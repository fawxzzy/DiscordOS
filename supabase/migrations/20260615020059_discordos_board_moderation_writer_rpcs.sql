create or replace function public.discordos_upsert_board_card(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = discordos, public, pg_temp
as $$
declare
  inserted_row discordos.discordos_board_cards%rowtype;
  reason_codes text[];
begin
  if nullif(payload->>'card_id', '') is null then
    raise exception 'missing_card_id';
  end if;
  if nullif(payload->>'workflow', '') is null then
    raise exception 'missing_workflow';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into reason_codes
  from jsonb_array_elements_text(coalesce(payload->'reason_codes', '[]'::jsonb)) as value;

  insert into discordos.discordos_board_cards (
    card_id,
    workflow,
    kind,
    current_state,
    source_thread_id,
    latest_transition_at,
    latest_transition_actor,
    latest_transition_note_present,
    proof_payload,
    reason_codes
  )
  values (
    payload->>'card_id',
    payload->>'workflow',
    coalesce(nullif(payload->>'kind', ''), 'ops'),
    coalesce(nullif(payload->>'current_state', ''), 'opened'),
    nullif(payload->>'source_thread_id', ''),
    now(),
    nullif(payload->>'latest_transition_actor', ''),
    coalesce((payload->>'latest_transition_note_present')::boolean, false),
    coalesce(payload->'proof_payload', '{}'::jsonb),
    coalesce(reason_codes, '{}'::text[])
  )
  on conflict (card_id) do update set
    workflow = excluded.workflow,
    kind = excluded.kind,
    current_state = excluded.current_state,
    source_thread_id = excluded.source_thread_id,
    latest_transition_at = excluded.latest_transition_at,
    latest_transition_actor = excluded.latest_transition_actor,
    latest_transition_note_present = excluded.latest_transition_note_present,
    proof_payload = excluded.proof_payload,
    reason_codes = excluded.reason_codes
  returning * into inserted_row;

  return jsonb_build_object(
    'cardId', inserted_row.card_id,
    'workflow', inserted_row.workflow,
    'kind', inserted_row.kind,
    'currentState', inserted_row.current_state,
    'sourceThreadIdPresent', inserted_row.source_thread_id is not null,
    'latestTransitionActorPresent', inserted_row.latest_transition_actor is not null,
    'latestTransitionNotePresent', inserted_row.latest_transition_note_present,
    'updatedAt', inserted_row.updated_at,
    'operation', 'upsert'
  );
end;
$$;

create or replace function public.discordos_insert_moderation_audit(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = discordos, public, pg_temp
as $$
declare
  audit_row discordos.discordos_moderation_audit_log%rowtype;
  inserted boolean := true;
  reason_codes text[];
begin
  if nullif(payload->>'case_id', '') is null then
    raise exception 'missing_case_id';
  end if;
  if nullif(payload->>'action_type', '') is null then
    raise exception 'missing_action_type';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into reason_codes
  from jsonb_array_elements_text(coalesce(payload->'reason_codes', '[]'::jsonb)) as value;

  insert into discordos.discordos_moderation_audit_log (
    case_id,
    action_type,
    severity,
    actor_discord_user_fingerprint,
    subject_discord_user_fingerprint,
    guild_id,
    channel_id,
    reason_present,
    note_present,
    proof_payload,
    reason_codes
  )
  values (
    payload->>'case_id',
    payload->>'action_type',
    coalesce(nullif(payload->>'severity', ''), 'medium'),
    payload->>'actor_discord_user_fingerprint',
    payload->>'subject_discord_user_fingerprint',
    payload->>'guild_id',
    nullif(payload->>'channel_id', ''),
    coalesce((payload->>'reason_present')::boolean, false),
    coalesce((payload->>'note_present')::boolean, false),
    coalesce(payload->'proof_payload', '{}'::jsonb),
    coalesce(reason_codes, '{}'::text[])
  )
  on conflict (case_id) do nothing
  returning * into audit_row;

  if audit_row.case_id is null then
    inserted := false;
    select *
    into audit_row
    from discordos.discordos_moderation_audit_log
    where case_id = payload->>'case_id';
  end if;

  return jsonb_build_object(
    'caseId', audit_row.case_id,
    'actionType', audit_row.action_type,
    'severity', audit_row.severity,
    'actorFingerprintPresent', audit_row.actor_discord_user_fingerprint is not null,
    'subjectFingerprintPresent', audit_row.subject_discord_user_fingerprint is not null,
    'guildIdPresent', audit_row.guild_id is not null,
    'reasonPresent', audit_row.reason_present,
    'notePresent', audit_row.note_present,
    'occurredAt', audit_row.occurred_at,
    'operation', case when inserted then 'inserted' else 'duplicate_existing' end
  );
end;
$$;

create or replace function public.discordos_get_product_workflow_readback()
returns jsonb
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  select jsonb_build_object(
    'boardCardCount', (select count(*) from discordos.discordos_board_cards),
    'moderationAuditCount', (select count(*) from discordos.discordos_moderation_audit_log),
    'latestBoardCard', (
      select jsonb_build_object(
        'cardId', card_id,
        'workflow', workflow,
        'kind', kind,
        'currentState', current_state,
        'updatedAt', updated_at,
        'latestTransitionAt', latest_transition_at
      )
      from discordos.discordos_board_cards
      order by updated_at desc
      limit 1
    ),
    'latestModerationAudit', (
      select jsonb_build_object(
        'caseId', case_id,
        'actionType', action_type,
        'severity', severity,
        'reasonPresent', reason_present,
        'notePresent', note_present,
        'occurredAt', occurred_at
      )
      from discordos.discordos_moderation_audit_log
      order by occurred_at desc
      limit 1
    ),
    'generatedAt', now()
  );
$$;

create or replace function public.discordos_search_moderation_audit(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  with params as (
    select
      nullif(payload->>'case_id', '') as case_id,
      nullif(payload->>'action_type', '') as action_type,
      nullif(payload->>'subject_discord_user_fingerprint', '') as subject_discord_user_fingerprint,
      least(greatest(coalesce((payload->>'limit')::int, 10), 1), 50) as row_limit
  ),
  rows as (
    select
      log.case_id,
      log.action_type,
      log.severity,
      log.actor_discord_user_fingerprint,
      log.subject_discord_user_fingerprint,
      log.reason_present,
      log.note_present,
      log.occurred_at
    from discordos.discordos_moderation_audit_log log, params
    where (params.case_id is null or log.case_id = params.case_id)
      and (params.action_type is null or log.action_type = params.action_type)
      and (
        params.subject_discord_user_fingerprint is null
        or log.subject_discord_user_fingerprint = params.subject_discord_user_fingerprint
      )
    order by log.occurred_at desc
    limit (select row_limit from params)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'caseId', case_id,
      'actionType', action_type,
      'severity', severity,
      'actorFingerprint', actor_discord_user_fingerprint,
      'subjectFingerprint', subject_discord_user_fingerprint,
      'reasonPresent', reason_present,
      'notePresent', note_present,
      'occurredAt', occurred_at
    )), '[]'::jsonb),
    'returnedCount', count(*),
    'generatedAt', now()
  )
  from rows;
$$;

revoke all on function public.discordos_upsert_board_card(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_insert_moderation_audit(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_get_product_workflow_readback() from public, anon, authenticated;
revoke all on function public.discordos_search_moderation_audit(jsonb) from public, anon, authenticated;

grant execute on function public.discordos_upsert_board_card(jsonb) to service_role;
grant execute on function public.discordos_insert_moderation_audit(jsonb) to service_role;
grant execute on function public.discordos_get_product_workflow_readback() to service_role;
grant execute on function public.discordos_search_moderation_audit(jsonb) to service_role;

comment on function public.discordos_upsert_board_card(jsonb) is
  'Service-role-only DiscordOS board/card guarded writer RPC. Keeps private table unexposed to anon/authenticated roles.';
comment on function public.discordos_insert_moderation_audit(jsonb) is
  'Service-role-only DiscordOS moderation audit guarded writer RPC. Stores sanitized fingerprints only.';
comment on function public.discordos_get_product_workflow_readback() is
  'Service-role-only DiscordOS product workflow readback RPC for operator dashboards.';
comment on function public.discordos_search_moderation_audit(jsonb) is
  'Service-role-only DiscordOS moderation audit sanitized review/search RPC.';
