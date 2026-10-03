-- SOURCE ONLY: exact master target bxtcuhkotumitoqtrcej. Not auto-applied.
-- The wrapper must be absent. CREATE (without OR REPLACE) fails on collision.
-- Keep public unexposed through the Data API. The SQL-standard body is parsed
-- at creation and records its dependency on the retained public function.
-- Keep CREATE and its ACL change in one top-level transaction so the default
-- PUBLIC EXECUTE grant is never observable and any later failure rolls back.
begin;

create function fitness.discordos_get_live_transfer_status()
returns jsonb
language sql
security invoker
set search_path = fitness, public, pg_temp
begin atomic
  select public.discordos_get_live_transfer_status();
end;

revoke all on function fitness.discordos_get_live_transfer_status() from public, anon, authenticated;
grant execute on function fitness.discordos_get_live_transfer_status() to service_role;

comment on function fitness.discordos_get_live_transfer_status() is
  'Service-role-only exposed-schema wrapper for the retained public DiscordOS live-transfer read model.';

commit;
