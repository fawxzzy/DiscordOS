create schema if not exists discordos;

create table if not exists discordos.discordos_moderation_audit_log (
  case_id text primary key,
  action_type text not null check (action_type in ('note', 'warn', 'timeout', 'remove_content', 'escalate', 'close')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  actor_discord_user_fingerprint text not null,
  subject_discord_user_fingerprint text not null,
  guild_id text not null,
  channel_id text,
  reason_present boolean not null default false,
  note_present boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  proof_payload jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'
);

create index if not exists discordos_moderation_audit_log_action_type_idx
  on discordos.discordos_moderation_audit_log(action_type);

create index if not exists discordos_moderation_audit_log_subject_idx
  on discordos.discordos_moderation_audit_log(subject_discord_user_fingerprint);

create index if not exists discordos_moderation_audit_log_occurred_at_idx
  on discordos.discordos_moderation_audit_log(occurred_at desc);

create index if not exists discordos_moderation_audit_log_case_action_idx
  on discordos.discordos_moderation_audit_log(case_id, action_type);

alter table discordos.discordos_moderation_audit_log enable row level security;

revoke all on table discordos.discordos_moderation_audit_log from public, anon, authenticated;
grant all privileges on table discordos.discordos_moderation_audit_log to service_role;

comment on table discordos.discordos_moderation_audit_log is
  'Private DiscordOS moderation audit ledger table. Service-role only; no public policies.';

comment on column discordos.discordos_moderation_audit_log.case_id is
  'Idempotency key for moderation audit shadow rows.';

comment on column discordos.discordos_moderation_audit_log.actor_discord_user_fingerprint is
  'Sanitized actor fingerprint; raw Discord user id is not stored in this shadow audit table.';

comment on column discordos.discordos_moderation_audit_log.subject_discord_user_fingerprint is
  'Sanitized subject fingerprint; raw Discord user id is not stored in this shadow audit table.';
