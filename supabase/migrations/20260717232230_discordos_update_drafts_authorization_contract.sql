alter table discordos.discord_update_drafts
  add column if not exists owner_service text not null default 'discordos-update-drafts-caller',
  add column if not exists revision bigint not null default 1,
  add column if not exists last_operation text not null default 'insert',
  add column if not exists last_operated_by_service text not null default 'discordos-update-drafts-caller',
  add column if not exists last_operated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'discordos.discord_update_drafts'::regclass
      and conname = 'discord_update_drafts_owner_service_check'
  ) then
    alter table discordos.discord_update_drafts
      add constraint discord_update_drafts_owner_service_check
      check (owner_service = 'discordos-update-drafts-caller');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'discordos.discord_update_drafts'::regclass
      and conname = 'discord_update_drafts_revision_check'
  ) then
    alter table discordos.discord_update_drafts
      add constraint discord_update_drafts_revision_check
      check (revision >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'discordos.discord_update_drafts'::regclass
      and conname = 'discord_update_drafts_last_operator_check'
  ) then
    alter table discordos.discord_update_drafts
      add constraint discord_update_drafts_last_operator_check
      check (last_operated_by_service = owner_service);
  end if;
end;
$$;

create or replace function public.discordos_list_update_drafts(payload jsonb default '{}'::jsonb)
returns setof discordos.discord_update_drafts
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  with params as (
    select
      nullif(payload->>'status', '') as status_filter,
      least(greatest(coalesce((payload->>'limit')::int, 5), 1), 10) as row_limit
  )
  select draft.*
  from discordos.discord_update_drafts draft, params
  where draft.owner_service = 'discordos-update-drafts-caller'
    and (params.status_filter is null or draft.status = params.status_filter)
  order by draft.created_at desc
  limit (select row_limit from params);
$$;

create or replace function public.discordos_get_update_draft_by_deployment_id(payload jsonb)
returns setof discordos.discord_update_drafts
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  select draft.*
  from discordos.discord_update_drafts draft
  where draft.owner_service = 'discordos-update-drafts-caller'
    and draft.deployment_id = payload->>'deployment_id'
  order by draft.created_at desc
  limit 1;
$$;

create or replace function public.discordos_get_update_draft_by_id(payload jsonb)
returns setof discordos.discord_update_drafts
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  select draft.*
  from discordos.discord_update_drafts draft
  where draft.owner_service = 'discordos-update-drafts-caller'
    and draft.id = (payload->>'id')::uuid
  limit 1;
$$;

create or replace function public.discordos_get_update_draft_by_prefix(payload jsonb)
returns setof discordos.discord_update_drafts
language sql
security invoker
set search_path = discordos, public, pg_temp
as $$
  with params as (
    select
      (payload->>'lower_bound')::uuid as lower_bound,
      (payload->>'upper_bound')::uuid as upper_bound,
      least(greatest(coalesce((payload->>'limit')::int, 2), 1), 10) as row_limit
  )
  select draft.*
  from discordos.discord_update_drafts draft, params
  where draft.owner_service = 'discordos-update-drafts-caller'
    and draft.id >= params.lower_bound
    and draft.id <= params.upper_bound
  order by draft.id asc
  limit (select row_limit from params);
$$;

create or replace function public.discordos_insert_update_draft(payload jsonb)
returns setof discordos.discord_update_drafts
language plpgsql
security invoker
set search_path = discordos, public, pg_temp
as $$
declare
  canonical_draft discordos.discord_update_drafts%rowtype;
begin
  if nullif(payload->>'deployment_id', '') is null then
    raise exception using errcode = '22023', message = 'invalid_update_draft_insert';
  end if;

  if payload - array[
    'deployment_id',
    'deployment_url',
    'production_url',
    'vercel_project_id',
    'vercel_project_name',
    'vercel_target',
    'git_commit_sha',
    'git_commit_ref',
    'git_commit_message',
    'user_facing_title',
    'user_facing_changes',
    'user_facing_why_it_matters'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'invalid_update_draft_insert';
  end if;

  insert into discordos.discord_update_drafts (
    source,
    status,
    owner_service,
    deployment_id,
    deployment_url,
    production_url,
    vercel_project_id,
    vercel_project_name,
    vercel_target,
    git_commit_sha,
    git_commit_ref,
    git_commit_message,
    user_facing_title,
    user_facing_changes,
    user_facing_why_it_matters,
    webhook_received_at,
    created_at,
    updated_at,
    revision,
    last_operation,
    last_operated_by_service,
    last_operated_at
  )
  values (
    'vercel',
    'draft',
    'discordos-update-drafts-caller',
    payload->>'deployment_id',
    nullif(payload->>'deployment_url', ''),
    nullif(payload->>'production_url', ''),
    nullif(payload->>'vercel_project_id', ''),
    nullif(payload->>'vercel_project_name', ''),
    nullif(payload->>'vercel_target', ''),
    nullif(payload->>'git_commit_sha', ''),
    nullif(payload->>'git_commit_ref', ''),
    nullif(payload->>'git_commit_message', ''),
    nullif(payload->>'user_facing_title', ''),
    nullif(payload->>'user_facing_changes', ''),
    nullif(payload->>'user_facing_why_it_matters', ''),
    now(),
    now(),
    now(),
    1,
    'insert',
    'discordos-update-drafts-caller',
    now()
  )
  on conflict (deployment_id) do nothing
  returning * into canonical_draft;

  if not found then
    select draft.*
    into canonical_draft
    from discordos.discord_update_drafts draft
    where draft.owner_service = 'discordos-update-drafts-caller'
      and draft.deployment_id = payload->>'deployment_id';

    if not found or
      canonical_draft.deployment_url is distinct from nullif(payload->>'deployment_url', '') or
      canonical_draft.production_url is distinct from nullif(payload->>'production_url', '') or
      canonical_draft.vercel_project_id is distinct from nullif(payload->>'vercel_project_id', '') or
      canonical_draft.vercel_project_name is distinct from nullif(payload->>'vercel_project_name', '') or
      canonical_draft.vercel_target is distinct from nullif(payload->>'vercel_target', '') or
      canonical_draft.git_commit_sha is distinct from nullif(payload->>'git_commit_sha', '') or
      canonical_draft.git_commit_ref is distinct from nullif(payload->>'git_commit_ref', '') or
      canonical_draft.git_commit_message is distinct from nullif(payload->>'git_commit_message', '') then
      raise exception using errcode = 'DU001', message = 'update_draft_insert_conflict';
    end if;
  end if;

  return next canonical_draft;
  return;
end;
$$;

create or replace function public.discordos_update_update_draft(payload jsonb)
returns setof discordos.discord_update_drafts
language plpgsql
security invoker
set search_path = discordos, public, pg_temp
as $$
declare
  current_draft discordos.discord_update_drafts%rowtype;
  updated_draft discordos.discord_update_drafts%rowtype;
  expected_revision bigint;
  transition_to text;
  actor_discord_user_id text;
  transition_reason text;
begin
  if nullif(payload->>'id', '') is null or nullif(payload->>'expected_revision', '') is null then
    raise exception using errcode = '22023', message = 'invalid_update_draft_update';
  end if;

  if payload - array[
    'id',
    'expected_revision',
    'user_facing_title',
    'user_facing_changes',
    'user_facing_why_it_matters',
    'transition_to',
    'actor_discord_user_id',
    'transition_reason'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'invalid_update_draft_update';
  end if;

  expected_revision := (payload->>'expected_revision')::bigint;
  transition_to := nullif(payload->>'transition_to', '');
  actor_discord_user_id := nullif(payload->>'actor_discord_user_id', '');
  transition_reason := nullif(payload->>'transition_reason', '');

  select draft.*
  into current_draft
  from discordos.discord_update_drafts draft
  where draft.owner_service = 'discordos-update-drafts-caller'
    and draft.id = (payload->>'id')::uuid
  for update;

  if not found then
    raise exception using errcode = 'DU002', message = 'update_draft_not_found';
  end if;
  if current_draft.revision <> expected_revision then
    raise exception using errcode = 'DU003', message = 'update_draft_stale_revision';
  end if;
  if current_draft.status <> 'draft' then
    raise exception using errcode = 'DU004', message = 'update_draft_terminal';
  end if;
  if transition_to is not null and transition_to not in ('published', 'skipped', 'ignored', 'failed') then
    raise exception using errcode = 'DU004', message = 'update_draft_invalid_transition';
  end if;
  if transition_to in ('published', 'skipped') and
    (actor_discord_user_id is null or actor_discord_user_id !~ '^[0-9]{5,32}$') then
    raise exception using errcode = 'DU004', message = 'update_draft_actor_required';
  end if;
  if transition_to = 'skipped' and transition_reason is null then
    raise exception using errcode = 'DU004', message = 'update_draft_skip_reason_required';
  end if;
  if transition_to is distinct from 'skipped' and transition_reason is not null then
    raise exception using errcode = 'DU004', message = 'update_draft_unexpected_reason';
  end if;
  if transition_to in ('ignored', 'failed') and actor_discord_user_id is not null then
    raise exception using errcode = 'DU004', message = 'update_draft_unexpected_actor';
  end if;

  update discordos.discord_update_drafts draft
  set
    status = coalesce(transition_to, draft.status),
    user_facing_title = case
      when payload ? 'user_facing_title' then nullif(payload->>'user_facing_title', '')
      else draft.user_facing_title
    end,
    user_facing_changes = case
      when payload ? 'user_facing_changes' then nullif(payload->>'user_facing_changes', '')
      else draft.user_facing_changes
    end,
    user_facing_why_it_matters = case
      when payload ? 'user_facing_why_it_matters' then nullif(payload->>'user_facing_why_it_matters', '')
      else draft.user_facing_why_it_matters
    end,
    published_by_discord_user_id = case
      when transition_to = 'published' then actor_discord_user_id
      else draft.published_by_discord_user_id
    end,
    published_at = case when transition_to = 'published' then now() else draft.published_at end,
    skipped_by_discord_user_id = case
      when transition_to = 'skipped' then actor_discord_user_id
      else draft.skipped_by_discord_user_id
    end,
    skipped_at = case when transition_to = 'skipped' then now() else draft.skipped_at end,
    skip_reason = case when transition_to = 'skipped' then transition_reason else draft.skip_reason end,
    revision = draft.revision + 1,
    last_operation = coalesce(transition_to, 'update'),
    last_operated_by_service = 'discordos-update-drafts-caller',
    last_operated_at = now(),
    updated_at = now()
  where draft.id = current_draft.id
    and draft.owner_service = 'discordos-update-drafts-caller'
    and draft.revision = expected_revision
  returning * into updated_draft;

  if not found then
    raise exception using errcode = 'DU003', message = 'update_draft_stale_revision';
  end if;

  return next updated_draft;
  return;
end;
$$;

revoke all on function public.discordos_list_update_drafts(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_get_update_draft_by_deployment_id(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_get_update_draft_by_id(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_get_update_draft_by_prefix(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_insert_update_draft(jsonb) from public, anon, authenticated;
revoke all on function public.discordos_update_update_draft(jsonb) from public, anon, authenticated;

grant execute on function public.discordos_list_update_drafts(jsonb) to service_role;
grant execute on function public.discordos_get_update_draft_by_deployment_id(jsonb) to service_role;
grant execute on function public.discordos_get_update_draft_by_id(jsonb) to service_role;
grant execute on function public.discordos_get_update_draft_by_prefix(jsonb) to service_role;
grant execute on function public.discordos_insert_update_draft(jsonb) to service_role;
grant execute on function public.discordos_update_update_draft(jsonb) to service_role;

comment on column discordos.discord_update_drafts.owner_service is
  'Server-owned named service identity for the update-draft authorization boundary.';
comment on column discordos.discord_update_drafts.revision is
  'Monotonic compare-and-swap token; callers must provide the exact expected revision for updates.';
comment on function public.discordos_insert_update_draft(jsonb) is
  'Service-role-only, owner-scoped, replay-safe DiscordOS update draft insert wrapper.';
comment on function public.discordos_update_update_draft(jsonb) is
  'Service-role-only, owner-scoped, lifecycle-valid compare-and-swap DiscordOS update draft update wrapper.';
