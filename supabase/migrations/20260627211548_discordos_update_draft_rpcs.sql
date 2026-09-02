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
  where params.status_filter is null or draft.status = params.status_filter
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
  where draft.deployment_id = payload->>'deployment_id'
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
  where draft.id = (payload->>'id')::uuid
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
  where draft.id >= params.lower_bound
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
begin
  if nullif(payload->>'deployment_id', '') is null then
    raise exception 'missing_deployment_id';
  end if;

  return query
  insert into discordos.discord_update_drafts (
    source,
    status,
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
    discord_channel_id,
    discord_message_id,
    published_by_discord_user_id,
    published_at,
    skipped_by_discord_user_id,
    skipped_at,
    skip_reason,
    webhook_received_at,
    created_at,
    updated_at
  )
  values (
    coalesce(nullif(payload->>'source', ''), 'vercel'),
    coalesce(nullif(payload->>'status', ''), 'draft'),
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
    nullif(payload->>'discord_channel_id', ''),
    nullif(payload->>'discord_message_id', ''),
    nullif(payload->>'published_by_discord_user_id', ''),
    (payload->>'published_at')::timestamptz,
    nullif(payload->>'skipped_by_discord_user_id', ''),
    (payload->>'skipped_at')::timestamptz,
    nullif(payload->>'skip_reason', ''),
    coalesce((payload->>'webhook_received_at')::timestamptz, now()),
    coalesce((payload->>'created_at')::timestamptz, now()),
    coalesce((payload->>'updated_at')::timestamptz, now())
  )
  returning *;
end;
$$;

create or replace function public.discordos_update_update_draft(payload jsonb)
returns setof discordos.discord_update_drafts
language plpgsql
security invoker
set search_path = discordos, public, pg_temp
as $$
begin
  if nullif(payload->>'id', '') is null then
    raise exception 'missing_id';
  end if;

  return query
  update discordos.discord_update_drafts draft
  set
    source = case when payload ? 'source' then nullif(payload->>'source', '') else draft.source end,
    status = case when payload ? 'status' then nullif(payload->>'status', '') else draft.status end,
    deployment_id = case when payload ? 'deployment_id' then nullif(payload->>'deployment_id', '') else draft.deployment_id end,
    deployment_url = case when payload ? 'deployment_url' then nullif(payload->>'deployment_url', '') else draft.deployment_url end,
    production_url = case when payload ? 'production_url' then nullif(payload->>'production_url', '') else draft.production_url end,
    vercel_project_id = case when payload ? 'vercel_project_id' then nullif(payload->>'vercel_project_id', '') else draft.vercel_project_id end,
    vercel_project_name = case when payload ? 'vercel_project_name' then nullif(payload->>'vercel_project_name', '') else draft.vercel_project_name end,
    vercel_target = case when payload ? 'vercel_target' then nullif(payload->>'vercel_target', '') else draft.vercel_target end,
    git_commit_sha = case when payload ? 'git_commit_sha' then nullif(payload->>'git_commit_sha', '') else draft.git_commit_sha end,
    git_commit_ref = case when payload ? 'git_commit_ref' then nullif(payload->>'git_commit_ref', '') else draft.git_commit_ref end,
    git_commit_message = case when payload ? 'git_commit_message' then nullif(payload->>'git_commit_message', '') else draft.git_commit_message end,
    user_facing_title = case when payload ? 'user_facing_title' then nullif(payload->>'user_facing_title', '') else draft.user_facing_title end,
    user_facing_changes = case when payload ? 'user_facing_changes' then nullif(payload->>'user_facing_changes', '') else draft.user_facing_changes end,
    user_facing_why_it_matters = case when payload ? 'user_facing_why_it_matters' then nullif(payload->>'user_facing_why_it_matters', '') else draft.user_facing_why_it_matters end,
    discord_channel_id = case when payload ? 'discord_channel_id' then nullif(payload->>'discord_channel_id', '') else draft.discord_channel_id end,
    discord_message_id = case when payload ? 'discord_message_id' then nullif(payload->>'discord_message_id', '') else draft.discord_message_id end,
    published_by_discord_user_id = case when payload ? 'published_by_discord_user_id' then nullif(payload->>'published_by_discord_user_id', '') else draft.published_by_discord_user_id end,
    published_at = case when payload ? 'published_at' then (payload->>'published_at')::timestamptz else draft.published_at end,
    skipped_by_discord_user_id = case when payload ? 'skipped_by_discord_user_id' then nullif(payload->>'skipped_by_discord_user_id', '') else draft.skipped_by_discord_user_id end,
    skipped_at = case when payload ? 'skipped_at' then (payload->>'skipped_at')::timestamptz else draft.skipped_at end,
    skip_reason = case when payload ? 'skip_reason' then nullif(payload->>'skip_reason', '') else draft.skip_reason end,
    webhook_received_at = case when payload ? 'webhook_received_at' then (payload->>'webhook_received_at')::timestamptz else draft.webhook_received_at end,
    created_at = case when payload ? 'created_at' then (payload->>'created_at')::timestamptz else draft.created_at end,
    updated_at = case when payload ? 'updated_at' then coalesce((payload->>'updated_at')::timestamptz, draft.updated_at) else draft.updated_at end
  where draft.id = (payload->>'id')::uuid
  returning *;
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

comment on function public.discordos_list_update_drafts(jsonb) is
  'Service-role-only DiscordOS update draft list/read RPC.';
comment on function public.discordos_get_update_draft_by_deployment_id(jsonb) is
  'Service-role-only DiscordOS update draft lookup by Vercel deployment id.';
comment on function public.discordos_get_update_draft_by_id(jsonb) is
  'Service-role-only DiscordOS update draft lookup by draft id.';
comment on function public.discordos_get_update_draft_by_prefix(jsonb) is
  'Service-role-only DiscordOS update draft lookup by UUID prefix bounds.';
comment on function public.discordos_insert_update_draft(jsonb) is
  'Service-role-only DiscordOS update draft insert wrapper.';
comment on function public.discordos_update_update_draft(jsonb) is
  'Service-role-only DiscordOS update draft update wrapper.';
