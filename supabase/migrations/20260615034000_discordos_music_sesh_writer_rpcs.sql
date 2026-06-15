create or replace function public.discordos_upsert_music_sesh_event(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = discordos, public, pg_temp
as $$
declare
  session_row discordos.discordos_music_sesh_sessions%rowtype;
  queue_row discordos.discordos_music_sesh_queue_items%rowtype;
  vote_row discordos.discordos_music_sesh_votes%rowtype;
  reason_codes text[];
  action_type text := coalesce(nullif(payload->>'action', ''), 'queue_item');
begin
  if nullif(payload->>'session_id', '') is null then
    raise exception 'missing_session_id';
  end if;
  if nullif(payload->>'guild_id', '') is null then
    raise exception 'missing_guild_id';
  end if;
  if nullif(payload->>'channel_id', '') is null then
    raise exception 'missing_channel_id';
  end if;
  if nullif(payload->>'actor_fingerprint', '') is null then
    raise exception 'missing_actor_fingerprint';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into reason_codes
  from jsonb_array_elements_text(coalesce(payload->'reason_codes', '[]'::jsonb)) as value;

  insert into discordos.discordos_music_sesh_sessions (
    session_id,
    guild_id,
    channel_id,
    current_state,
    opened_by_fingerprint,
    proof_payload,
    reason_codes
  )
  values (
    payload->>'session_id',
    payload->>'guild_id',
    payload->>'channel_id',
    case
      when action_type = 'close_session' then 'closed'
      when action_type = 'lock_session' then 'locked'
      else 'open'
    end,
    payload->>'actor_fingerprint',
    coalesce(payload->'proof_payload', '{}'::jsonb),
    coalesce(reason_codes, '{}'::text[])
  )
  on conflict (session_id) do update set
    guild_id = excluded.guild_id,
    channel_id = excluded.channel_id,
    current_state = excluded.current_state,
    proof_payload = excluded.proof_payload,
    reason_codes = excluded.reason_codes
  returning * into session_row;

  if action_type = 'queue_item' and nullif(payload->>'queue_item_id', '') is not null then
    insert into discordos.discordos_music_sesh_queue_items (
      queue_item_id,
      session_id,
      item_title,
      requested_by_fingerprint,
      queue_position,
      proof_payload,
      reason_codes
    )
    values (
      payload->>'queue_item_id',
      payload->>'session_id',
      coalesce(nullif(payload->>'item_title', ''), 'Untitled'),
      payload->>'actor_fingerprint',
      coalesce((payload->>'queue_position')::int, 0),
      coalesce(payload->'proof_payload', '{}'::jsonb),
      coalesce(reason_codes, '{}'::text[])
    )
    on conflict (queue_item_id) do update set
      item_title = excluded.item_title,
      requested_by_fingerprint = excluded.requested_by_fingerprint,
      queue_position = excluded.queue_position,
      proof_payload = excluded.proof_payload,
      reason_codes = excluded.reason_codes
    returning * into queue_row;
  end if;

  if action_type = 'vote' and nullif(payload->>'vote_id', '') is not null then
    insert into discordos.discordos_music_sesh_votes (
      vote_id,
      session_id,
      queue_item_id,
      actor_fingerprint,
      vote_direction,
      proof_payload,
      reason_codes
    )
    values (
      payload->>'vote_id',
      payload->>'session_id',
      nullif(payload->>'queue_item_id', ''),
      payload->>'actor_fingerprint',
      coalesce(nullif(payload->>'vote_direction', ''), 'up'),
      coalesce(payload->'proof_payload', '{}'::jsonb),
      coalesce(reason_codes, '{}'::text[])
    )
    on conflict (session_id, queue_item_id, actor_fingerprint) do update set
      vote_direction = excluded.vote_direction,
      proof_payload = excluded.proof_payload,
      reason_codes = excluded.reason_codes
    returning * into vote_row;
  end if;

  return jsonb_build_object(
    'sessionId', session_row.session_id,
    'currentState', session_row.current_state,
    'queueItemId', queue_row.queue_item_id,
    'voteId', vote_row.vote_id,
    'action', action_type,
    'operation', 'upsert'
  );
end;
$$;

create or replace function public.discordos_get_music_sesh_readback()
returns jsonb
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  select jsonb_build_object(
    'sessionCount', (select count(*) from discordos.discordos_music_sesh_sessions),
    'queueItemCount', (select count(*) from discordos.discordos_music_sesh_queue_items),
    'voteCount', (select count(*) from discordos.discordos_music_sesh_votes),
    'latestSession', (
      select jsonb_build_object(
        'sessionId', session_id,
        'currentState', current_state,
        'updatedAt', updated_at
      )
      from discordos.discordos_music_sesh_sessions
      order by updated_at desc
      limit 1
    ),
    'latestQueueItem', (
      select jsonb_build_object(
        'queueItemId', queue_item_id,
        'sessionId', session_id,
        'currentState', current_state,
        'updatedAt', updated_at
      )
      from discordos.discordos_music_sesh_queue_items
      order by updated_at desc
      limit 1
    ),
    'generatedAt', now()
  );
$$;

revoke all on function public.discordos_upsert_music_sesh_event(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_get_music_sesh_readback() from public, anon, authenticated;

grant execute on function public.discordos_upsert_music_sesh_event(jsonb) to service_role;
grant execute on function public.discordos_get_music_sesh_readback() to service_role;

comment on function public.discordos_upsert_music_sesh_event(jsonb) is
  'Service-role-only DiscordOS Music Sesh guarded writer RPC. Stores sanitized fingerprints only.';

comment on function public.discordos_get_music_sesh_readback() is
  'Service-role-only DiscordOS Music Sesh operator readback RPC.';
