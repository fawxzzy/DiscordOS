# DiscordOS Moderation Audit Log Schema Admission v0 Contract

## Scope

This is the v0 schema-admission plan for future DiscordOS moderation audit logs.

It is planning-only. It does not create Supabase migrations, persist moderation cases, write audit rows, call Discord moderation APIs, or grant live moderation authority.

## Schema Admission

The moderation audit-log schema is admitted for planning with status `planning_ready`.

The matching code-facing shape is `DiscordOSModerationAuditLogSchemaAdmissionPlan` in `src/contracts/moderation.ts`.

## Table Shape

The planned table is `discordos_moderation_audit_log`.

Required columns:

- case id
- action type
- actor Discord user id
- subject Discord user id
- guild id
- channel id
- reason
- note
- occurred timestamp
- proof payload

## Index Plan

Future storage should include indexes for:

- case id
- action type
- subject Discord user id
- occurred timestamp

The idempotency key field remains `caseId`.

## Migration Boundary

This admission pass does not create or apply a migration. A later explicit schema lane must produce SQL, prove RLS posture, and run migration verification before any active moderation audit storage can exist.

## Forbidden Behaviors

This schema-admission contract does not allow:

- creating or applying database migrations
- writing moderation audit rows
- calling Discord moderation APIs
- treating planning-ready schema admission as active audit storage
- Fitness product code edits

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-moderation-audit-log-schema-admission-status`
- `npm run ops:discordos:moderation-audit-log-schema-admission-status`
