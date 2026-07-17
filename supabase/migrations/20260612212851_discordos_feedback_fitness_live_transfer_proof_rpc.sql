create or replace function public.discordos_insert_feedback_proof(payload jsonb)
returns setof discordos.discord_feedback_reports
language plpgsql
security invoker
set search_path = public, discordos, pg_temp
as $$
declare
  inserted discordos.discord_feedback_reports;
  proof_report_id text := payload->>'report_id';
begin
  if proof_report_id is null
    or (
      proof_report_id not like 'edge-persist-proof-%'
      and proof_report_id not like 'shadow-transfer-proof-%'
      and proof_report_id not like 'fitness-live-transfer-%'
    )
  then
    raise exception 'proof_report_id_prefix_required' using errcode = '22023';
  end if;

  insert into discordos.discord_feedback_reports (
    report_id,
    report_type,
    short_display_id,
    created_at,
    updated_at,
    reporter_discord_user_id,
    reporter_fitness_user_id,
    reporter_member_number,
    reporter_user_kind,
    forum_channel_id,
    forum_thread_id,
    forum_message_id,
    status,
    completion_review_status,
    status_note,
    forum_title,
    forum_applied_tag_ids,
    runtime_warnings
  )
  values (
    proof_report_id,
    payload->>'report_type',
    payload->>'short_display_id',
    coalesce((payload->>'created_at')::timestamptz, now()),
    coalesce((payload->>'updated_at')::timestamptz, now()),
    payload->>'reporter_discord_user_id',
    payload->>'reporter_fitness_user_id',
    nullif(payload->>'reporter_member_number', '')::integer,
    payload->>'reporter_user_kind',
    payload->>'forum_channel_id',
    payload->>'forum_thread_id',
    payload->>'forum_message_id',
    coalesce(payload->>'status', 'new'),
    coalesce(payload->>'completion_review_status', 'not_required'),
    payload->>'status_note',
    payload->>'forum_title',
    coalesce(
      array(select jsonb_array_elements_text(payload->'forum_applied_tag_ids')),
      '{}'::text[]
    ),
    coalesce(
      array(select jsonb_array_elements_text(payload->'runtime_warnings')),
      '{}'::text[]
    )
  )
  returning * into inserted;

  return next inserted;
end;
$$;

revoke all on function public.discordos_insert_feedback_proof(jsonb) from public, anon, authenticated;
grant execute on function public.discordos_insert_feedback_proof(jsonb) to service_role;

comment on function public.discordos_insert_feedback_proof(jsonb) is
  'Service-role-only proof insert wrapper for DiscordOS feedback persistence. Accepts edge-persist-proof-*, shadow-transfer-proof-*, and fitness-live-transfer-* report ids only.';
