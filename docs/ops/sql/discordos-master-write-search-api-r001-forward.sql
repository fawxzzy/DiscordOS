-- SOURCE ONLY: exact master project bxtcuhkotumitoqtrcej. Not auto-applied.
-- Install only after the readback-api-r001 forward source has been separately
-- authorized, applied, and read back. The six wrappers must be absent.
-- Keep public and discordos unexposed; select only discordos_api and exact RPCs.
-- One transaction hides default PUBLIC EXECUTE until it is revoked.
begin;

create function discordos_api.discordos_insert_feedback_proof(payload jsonb)
returns setof discordos.discord_feedback_reports
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select * from public.discordos_insert_feedback_proof(payload);
end;

create function discordos_api.discordos_insert_runtime_health_cron_run(payload jsonb)
returns setof discordos.runtime_health_cron_runs
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select * from public.discordos_insert_runtime_health_cron_run(payload);
end;

create function discordos_api.discordos_upsert_board_card(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_upsert_board_card(payload);
end;

create function discordos_api.discordos_upsert_music_sesh_event(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_upsert_music_sesh_event(payload);
end;

create function discordos_api.discordos_insert_moderation_audit(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_insert_moderation_audit(payload);
end;

create function discordos_api.discordos_search_moderation_audit(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = discordos_api, public, pg_temp
begin atomic
  select public.discordos_search_moderation_audit(payload);
end;

revoke all on function discordos_api.discordos_insert_feedback_proof(jsonb) from public, anon, authenticated;
revoke all on function discordos_api.discordos_insert_runtime_health_cron_run(jsonb) from public, anon, authenticated;
revoke all on function discordos_api.discordos_upsert_board_card(jsonb) from public, anon, authenticated;
revoke all on function discordos_api.discordos_upsert_music_sesh_event(jsonb) from public, anon, authenticated;
revoke all on function discordos_api.discordos_insert_moderation_audit(jsonb) from public, anon, authenticated;
revoke all on function discordos_api.discordos_search_moderation_audit(jsonb) from public, anon, authenticated;
grant execute on function discordos_api.discordos_insert_feedback_proof(jsonb) to service_role;
grant execute on function discordos_api.discordos_insert_runtime_health_cron_run(jsonb) to service_role;
grant execute on function discordos_api.discordos_upsert_board_card(jsonb) to service_role;
grant execute on function discordos_api.discordos_upsert_music_sesh_event(jsonb) to service_role;
grant execute on function discordos_api.discordos_insert_moderation_audit(jsonb) to service_role;
grant execute on function discordos_api.discordos_search_moderation_audit(jsonb) to service_role;

comment on function discordos_api.discordos_insert_feedback_proof(jsonb) is 'Narrow service-role wrapper for retained public DiscordOS feedback insert.';
comment on function discordos_api.discordos_insert_runtime_health_cron_run(jsonb) is 'Narrow service-role wrapper for retained public DiscordOS cron insert.';
comment on function discordos_api.discordos_upsert_board_card(jsonb) is 'Narrow service-role wrapper for retained public DiscordOS board upsert.';
comment on function discordos_api.discordos_upsert_music_sesh_event(jsonb) is 'Narrow service-role wrapper for retained public DiscordOS Music Sesh upsert.';
comment on function discordos_api.discordos_insert_moderation_audit(jsonb) is 'Narrow service-role wrapper for retained public DiscordOS moderation audit insert.';
comment on function discordos_api.discordos_search_moderation_audit(jsonb) is 'Narrow service-role wrapper for retained public DiscordOS moderation audit search.';

commit;
