create table if not exists discordos.runtime_health_cron_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  schedule_name text not null,
  source text not null default 'vercel-cron-runtime-health',
  status text not null check (status in ('pass', 'fail')),
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  event_type text not null,
  event_severity text not null check (event_severity in ('info', 'warning', 'error', 'critical')),
  posture text,
  readiness_percent integer check (readiness_percent is null or readiness_percent between 0 and 100),
  blocked_reasons text[] not null default '{}',
  alert_event_type text,
  alert_severity text,
  alert_delivery_enabled boolean not null default false,
  alert_delivery_status text,
  alert_delivery_target_type text,
  alert_delivered boolean not null default false,
  artifact_written boolean not null default false,
  destructive boolean not null default false,
  reason_codes text[] not null default '{}'
);

create index if not exists runtime_health_cron_runs_generated_at_idx
  on discordos.runtime_health_cron_runs(generated_at desc);

create index if not exists runtime_health_cron_runs_schedule_generated_at_idx
  on discordos.runtime_health_cron_runs(schedule_name, generated_at desc);

alter table discordos.runtime_health_cron_runs enable row level security;

revoke all on table discordos.runtime_health_cron_runs from public, anon, authenticated;
grant all privileges on table discordos.runtime_health_cron_runs to service_role;

create or replace function public.discordos_insert_runtime_health_cron_run(payload jsonb)
returns setof discordos.runtime_health_cron_runs
language plpgsql
security invoker
set search_path = public, discordos, pg_temp
as $$
declare
  inserted discordos.runtime_health_cron_runs;
  payload_run_id text := payload->>'run_id';
  payload_schedule_name text := payload->>'schedule_name';
  payload_generated_at timestamptz := nullif(payload->>'generated_at', '')::timestamptz;
  payload_status text := coalesce(payload->>'status', 'fail');
begin
  if payload_run_id is null or payload_run_id not like 'runtime-health-cron-%' then
    raise exception 'runtime_health_cron_run_id_prefix_required' using errcode = '22023';
  end if;

  if payload_schedule_name is null or payload_schedule_name = '' then
    raise exception 'runtime_health_cron_schedule_name_required' using errcode = '22023';
  end if;

  insert into discordos.runtime_health_cron_runs (
    run_id,
    schedule_name,
    source,
    status,
    generated_at,
    event_type,
    event_severity,
    posture,
    readiness_percent,
    blocked_reasons,
    alert_event_type,
    alert_severity,
    alert_delivery_enabled,
    alert_delivery_status,
    alert_delivery_target_type,
    alert_delivered,
    artifact_written,
    destructive,
    reason_codes
  )
  values (
    payload_run_id,
    payload_schedule_name,
    coalesce(payload->>'source', 'vercel-cron-runtime-health'),
    payload_status,
    coalesce(payload_generated_at, now()),
    coalesce(payload->>'event_type', 'discordos.runtime_health.cron_fail'),
    coalesce(payload->>'event_severity', 'error'),
    payload->>'posture',
    nullif(payload->>'readiness_percent', '')::integer,
    coalesce(
      array(select jsonb_array_elements_text(payload->'blocked_reasons')),
      '{}'::text[]
    ),
    payload->>'alert_event_type',
    payload->>'alert_severity',
    coalesce((payload->>'alert_delivery_enabled')::boolean, false),
    payload->>'alert_delivery_status',
    payload->>'alert_delivery_target_type',
    coalesce((payload->>'alert_delivered')::boolean, false),
    coalesce((payload->>'artifact_written')::boolean, false),
    coalesce((payload->>'destructive')::boolean, false),
    coalesce(
      array(select jsonb_array_elements_text(payload->'reason_codes')),
      '{}'::text[]
    )
  )
  on conflict (run_id) do update set
    schedule_name = excluded.schedule_name,
    source = excluded.source,
    status = excluded.status,
    generated_at = excluded.generated_at,
    event_type = excluded.event_type,
    event_severity = excluded.event_severity,
    posture = excluded.posture,
    readiness_percent = excluded.readiness_percent,
    blocked_reasons = excluded.blocked_reasons,
    alert_event_type = excluded.alert_event_type,
    alert_severity = excluded.alert_severity,
    alert_delivery_enabled = excluded.alert_delivery_enabled,
    alert_delivery_status = excluded.alert_delivery_status,
    alert_delivery_target_type = excluded.alert_delivery_target_type,
    alert_delivered = excluded.alert_delivered,
    artifact_written = excluded.artifact_written,
    destructive = excluded.destructive,
    reason_codes = excluded.reason_codes
  returning * into inserted;

  return next inserted;
end;
$$;

revoke all on function public.discordos_insert_runtime_health_cron_run(jsonb) from public, anon, authenticated;
grant execute on function public.discordos_insert_runtime_health_cron_run(jsonb) to service_role;

create or replace function public.discordos_get_runtime_health_cron_run_status()
returns jsonb
language sql
security invoker
set search_path = public, discordos, pg_temp
as $$
with latest_any as (
  select *
  from discordos.runtime_health_cron_runs
  order by generated_at desc
  limit 1
),
latest_pass as (
  select *
  from discordos.runtime_health_cron_runs
  where status = 'pass'
  order by generated_at desc
  limit 1
),
counts as (
  select
    count(*)::integer as total_count,
    count(*) filter (where status = 'pass')::integer as pass_count,
    count(*) filter (where status = 'fail')::integer as fail_count,
    max(generated_at) as latest_generated_at
  from discordos.runtime_health_cron_runs
)
select jsonb_build_object(
  'totalCount', coalesce(counts.total_count, 0),
  'passCount', coalesce(counts.pass_count, 0),
  'failCount', coalesce(counts.fail_count, 0),
  'latestGeneratedAt', counts.latest_generated_at,
  'latestRun', (select to_jsonb(latest_any) from latest_any),
  'latestPassingRun', (select to_jsonb(latest_pass) from latest_pass)
)
from counts;
$$;

revoke all on function public.discordos_get_runtime_health_cron_run_status() from public, anon, authenticated;
grant execute on function public.discordos_get_runtime_health_cron_run_status() to service_role;

comment on table discordos.runtime_health_cron_runs is
  'Private DiscordOS runtime-health cron execution receipts. Service-role only; no public policies.';

comment on function public.discordos_insert_runtime_health_cron_run(jsonb) is
  'Service-role-only sanitized runtime-health cron receipt upsert. Accepts runtime-health-cron-* run ids only.';

comment on function public.discordos_get_runtime_health_cron_run_status() is
  'Service-role-only runtime-health cron receipt status summary. Returns non-secret execution metadata.';
