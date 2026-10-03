-- SOURCE ONLY: exact master project bxtcuhkotumitoqtrcej. Not auto-applied.
-- Do not run until no deployed route uses these six wrappers and their exact
-- Data API function selection has been removed and read back.
-- Caller must BEGIN, SET LOCAL atlas.expected_discordos_write_search_api_fingerprint
-- from a fresh exact six-function catalog readback, execute with stop-on-error,
-- inspect the poststate, and COMMIT only if it matches the plan.
-- Missing/changed identity or added dependencies hold rollback.

do $$
declare
  actual_identity jsonb;
begin
  select jsonb_build_object(
    'schema_oid', n.oid::text,
    'functions', (
      select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', jsonb_build_object(
        'oid', p.oid::text,
        'owner', pg_get_userbyid(p.proowner),
        'definition_md5', md5(pg_get_functiondef(p.oid)),
        'acl_md5', md5(coalesce(p.proacl::text, '<NULL>'))
      ))
      from pg_proc p
      where p.pronamespace = n.oid
        and p.proname in (
          'discordos_insert_feedback_proof',
          'discordos_insert_runtime_health_cron_run',
          'discordos_upsert_board_card',
          'discordos_upsert_music_sesh_event',
          'discordos_insert_moderation_audit',
          'discordos_search_moderation_audit'
        )
    )
  ) into actual_identity
  from pg_namespace n
  where n.nspname = 'discordos_api';

  if actual_identity is null
    or (select count(*) from jsonb_object_keys(actual_identity -> 'functions')) <> 6
    or md5(actual_identity::text) <> current_setting('atlas.expected_discordos_write_search_api_fingerprint') then
    raise exception 'DiscordOS write/search API rollback held: function identity drift';
  end if;
end;
$$;

drop function discordos_api.discordos_insert_feedback_proof(jsonb) restrict;
drop function discordos_api.discordos_insert_runtime_health_cron_run(jsonb) restrict;
drop function discordos_api.discordos_upsert_board_card(jsonb) restrict;
drop function discordos_api.discordos_upsert_music_sesh_event(jsonb) restrict;
drop function discordos_api.discordos_insert_moderation_audit(jsonb) restrict;
drop function discordos_api.discordos_search_moderation_audit(jsonb) restrict;
