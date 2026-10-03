-- SOURCE ONLY: exact master project bxtcuhkotumitoqtrcej. Not auto-applied.
-- Do not run until no deployed route uses these wrappers and Data API function
-- selection plus discordos_api schema exposure have been removed and read back.
-- Caller must BEGIN, SET LOCAL atlas.expected_discordos_readback_api_fingerprint
-- from a fresh exact schema/function identity readback, execute this file with
-- stop-on-error, inspect the poststate, and COMMIT only if it matches the plan.
-- A missing setting, changed OID/owner/definition/ACL, or added function holds.

do $$
declare
  actual_identity jsonb;
begin
  select jsonb_build_object(
    'schema_oid', n.oid::text,
    'schema_owner', pg_get_userbyid(n.nspowner),
    'schema_acl_md5', md5(coalesce(n.nspacl::text, '<NULL>')),
    'functions', (
      select jsonb_object_agg(p.proname, jsonb_build_object(
        'oid', p.oid::text,
        'owner', pg_get_userbyid(p.proowner),
        'definition_md5', md5(pg_get_functiondef(p.oid)),
        'acl_md5', md5(coalesce(p.proacl::text, '<NULL>'))
      ))
      from pg_proc p
      where p.pronamespace = n.oid
    )
  ) into actual_identity
  from pg_namespace n
  where n.nspname = 'discordos_api';

  if actual_identity is null
    or md5(actual_identity::text) <> current_setting('atlas.expected_discordos_readback_api_fingerprint') then
    raise exception 'DiscordOS readback API rollback held: schema or function identity drift';
  end if;
end;
$$;

drop function discordos_api.discordos_get_music_sesh_readback() restrict;
drop function discordos_api.discordos_get_product_workflow_readback() restrict;
drop function discordos_api.discordos_get_runtime_health_cron_run_status() restrict;
drop schema discordos_api restrict;
