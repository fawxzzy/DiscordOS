-- SOURCE ONLY: exact master target bxtcuhkotumitoqtrcej. Not auto-applied.
-- Do not execute until provider readback proves no deployed route consumes the
-- wrapper and the Data API exposure is removed. A fresh action-time receipt
-- must supply its exact OID, owner, pg_get_functiondef MD5 and proacl MD5 as
-- session-local settings below. Missing settings and changed identity HOLD.
-- The caller must BEGIN, SET LOCAL all four values from fresh readback, then
-- execute this body and COMMIT only after exact postreadback. Do not autocommit.
-- Execute under the exact single-writer lease; this is not a concurrency lock.

do $$
declare
  actual_oid oid;
  actual_owner text;
  actual_definition_md5 text;
  actual_acl_md5 text;
begin
  select p.oid, pg_get_userbyid(p.proowner), md5(pg_get_functiondef(p.oid)),
         md5(coalesce(p.proacl::text, '<NULL>'))
    into actual_oid, actual_owner, actual_definition_md5, actual_acl_md5
    from pg_proc p
    where p.oid = to_regprocedure('fitness.discordos_get_live_transfer_status()');

  if actual_oid is null
    or actual_oid::text <> current_setting('atlas.expected_live_transfer_wrapper_oid')
    or actual_owner <> current_setting('atlas.expected_live_transfer_wrapper_owner')
    or actual_definition_md5 <> current_setting('atlas.expected_live_transfer_wrapper_definition_md5')
    or actual_acl_md5 <> current_setting('atlas.expected_live_transfer_wrapper_acl_md5') then
    raise exception 'R007 rollback held: wrapper identity or ACL drift';
  end if;
end;
$$;

drop function fitness.discordos_get_live_transfer_status() restrict;
