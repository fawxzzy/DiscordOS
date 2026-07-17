alter table discordos.discord_feedback_reports
  add column if not exists source text not null default 'discord',
  add column if not exists severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'blocker')),
  add column if not exists effort_points integer,
  add column if not exists card_id text,
  add column if not exists card_phase text,
  add column if not exists card_priority text check (card_priority is null or card_priority in ('P0', 'P1', 'P2', 'P3')),
  add column if not exists depends_on text[],
  add column if not exists dependency_notes text,
  add column if not exists area text,
  add column if not exists summary text,
  add column if not exists details text,
  add column if not exists steps_to_reproduce text,
  add column if not exists screenshot_url text,
  add column if not exists attachment_count integer not null default 0,
  add column if not exists attachment_metadata jsonb,
  add column if not exists attachment_pruned boolean not null default false,
  add column if not exists reporter_discord_username text,
  add column if not exists discord_interaction_id text,
  add column if not exists duplicate_fingerprint text,
  add column if not exists duplicate_count integer not null default 1,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists staff_channel_message_id text,
  add column if not exists closed_at timestamptz,
  add column if not exists pruned_at timestamptz,
  add column if not exists details_pruned boolean not null default false,
  add column if not exists triage_notes text;

update discordos.discord_feedback_reports
set
  source = coalesce(source, 'discord'),
  severity = coalesce(severity, 'medium'),
  attachment_count = coalesce(attachment_count, 0),
  duplicate_count = greatest(coalesce(duplicate_count, 1), 1),
  attachment_pruned = coalesce(attachment_pruned, false),
  details_pruned = coalesce(details_pruned, false),
  first_seen_at = coalesce(first_seen_at, created_at),
  last_seen_at = coalesce(last_seen_at, updated_at)
where
  source is distinct from coalesce(source, 'discord')
  or severity is distinct from coalesce(severity, 'medium')
  or attachment_count is distinct from coalesce(attachment_count, 0)
  or duplicate_count is distinct from greatest(coalesce(duplicate_count, 1), 1)
  or attachment_pruned is distinct from coalesce(attachment_pruned, false)
  or details_pruned is distinct from coalesce(details_pruned, false)
  or first_seen_at is null
  or last_seen_at is null;

create index if not exists discord_feedback_reports_report_type_status_idx
  on discordos.discord_feedback_reports(report_type, status);

create index if not exists discord_feedback_reports_last_seen_at_idx
  on discordos.discord_feedback_reports(last_seen_at desc);

create index if not exists discord_feedback_reports_reporter_user_updated_idx
  on discordos.discord_feedback_reports(reporter_discord_user_id, updated_at desc);

create index if not exists discord_feedback_reports_duplicate_fingerprint_idx
  on discordos.discord_feedback_reports(duplicate_fingerprint);

comment on column discordos.discord_feedback_reports.summary is
  'DiscordOS-owned extracted feedback summary copied from the Fitness lifecycle model.';

comment on column discordos.discord_feedback_reports.details is
  'DiscordOS-owned extracted feedback detail body copied from the Fitness lifecycle model.';

comment on column discordos.discord_feedback_reports.steps_to_reproduce is
  'DiscordOS-owned extracted section override storage for bug/feature feedback cards.';
