-- SOURCE ONLY: exact master project bxtcuhkotumitoqtrcej. Not auto-applied.
-- The discordos_api schema and all three wrappers must be absent at action time.
-- Keep public unexposed; select only this narrow schema and the exact wrappers
-- through a separately authorized Data API settings change after SQL readback.
-- One top-level transaction hides default PUBLIC EXECUTE until it is revoked.
begin;

create schema discordos_api;
revoke all on schema discordos_api from public, anon, authenticated;
grant usage on schema discordos_api to service_role;

create function discordos_api.discordos_get_music_sesh_readback()
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_get_music_sesh_readback();
end;

create function discordos_api.discordos_get_product_workflow_readback()
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_get_product_workflow_readback();
end;

create function discordos_api.discordos_get_runtime_health_cron_run_status()
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_get_runtime_health_cron_run_status();
end;

revoke all on function discordos_api.discordos_get_music_sesh_readback() from public, anon, authenticated;
revoke all on function discordos_api.discordos_get_product_workflow_readback() from public, anon, authenticated;
revoke all on function discordos_api.discordos_get_runtime_health_cron_run_status() from public, anon, authenticated;
grant execute on function discordos_api.discordos_get_music_sesh_readback() to service_role;
grant execute on function discordos_api.discordos_get_product_workflow_readback() to service_role;
grant execute on function discordos_api.discordos_get_runtime_health_cron_run_status() to service_role;

comment on schema discordos_api is 'Service-role-only Data API facade for selected DiscordOS readbacks.';
comment on function discordos_api.discordos_get_music_sesh_readback() is 'Narrow wrapper for retained public DiscordOS music readback.';
comment on function discordos_api.discordos_get_product_workflow_readback() is 'Narrow wrapper for retained public DiscordOS workflow readback.';
comment on function discordos_api.discordos_get_runtime_health_cron_run_status() is 'Narrow wrapper for retained public DiscordOS cron readback.';

commit;
