create or replace function public.discordos_get_live_transfer_status()
returns jsonb
language sql
security invoker
set search_path = public, discordos, pg_temp
as $$
with transfer_rows as (
  select
    report_id,
    report_type,
    reporter_user_kind,
    reporter_discord_user_id,
    status,
    completion_review_status,
    runtime_warnings,
    created_at,
    updated_at,
    coalesce(runtime_warnings, '{}'::text[]) @> array['edge_persist_writer_proof_only']::text[] as proof_only
  from discordos.discord_feedback_reports
  where report_id like 'fitness-live-transfer-%'
),
counts as (
  select
    count(*)::integer as fitness_live_transfer_count,
    count(*) filter (where reporter_user_kind = 'human')::integer as human_fitness_live_transfer_count,
    count(*) filter (where not proof_only)::integer as non_proof_fitness_live_transfer_count,
    count(*) filter (where reporter_user_kind = 'human' and not proof_only)::integer as human_non_proof_fitness_live_transfer_count,
    max(created_at) as latest_fitness_live_transfer_at
  from transfer_rows
),
latest_any as (
  select
    report_id,
    report_type,
    reporter_user_kind,
    reporter_discord_user_id,
    status,
    completion_review_status,
    runtime_warnings,
    proof_only,
    created_at,
    updated_at
  from transfer_rows
  order by created_at desc
  limit 1
),
latest_human_non_proof as (
  select
    report_id,
    report_type,
    reporter_user_kind,
    reporter_discord_user_id,
    status,
    completion_review_status,
    runtime_warnings,
    proof_only,
    created_at,
    updated_at
  from transfer_rows
  where reporter_user_kind = 'human'
    and not proof_only
  order by created_at desc
  limit 1
)
select jsonb_build_object(
  'fitnessLiveTransferCount', coalesce(counts.fitness_live_transfer_count, 0),
  'humanFitnessLiveTransferCount', coalesce(counts.human_fitness_live_transfer_count, 0),
  'nonProofFitnessLiveTransferCount', coalesce(counts.non_proof_fitness_live_transfer_count, 0),
  'humanNonProofFitnessLiveTransferCount', coalesce(counts.human_non_proof_fitness_live_transfer_count, 0),
  'latestFitnessLiveTransferAt', counts.latest_fitness_live_transfer_at,
  'liveSignedTransferReady', coalesce(counts.human_non_proof_fitness_live_transfer_count, 0) > 0,
  'latestTransferRow', (select to_jsonb(latest_any) from latest_any),
  'latestHumanNonProofTransferRow', (select to_jsonb(latest_human_non_proof) from latest_human_non_proof)
)
from counts;
$$;

revoke all on function public.discordos_get_live_transfer_status() from public, anon, authenticated;
grant execute on function public.discordos_get_live_transfer_status() to service_role;

comment on function public.discordos_get_live_transfer_status() is
  'Service-role-only live transfer status summary for DiscordOS cutover proof capture. Returns non-secret row metadata for fitness-live-transfer-* rows.';
