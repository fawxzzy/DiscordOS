create schema if not exists discordos;

create table if not exists discordos.discord_feedback_reports (
  report_id text primary key,
  report_type text not null check (report_type in ('bug', 'feature', 'fix')),
  short_display_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reporter_discord_user_id text,
  reporter_fitness_user_id text,
  reporter_member_number integer,
  reporter_user_kind text check (reporter_user_kind in ('human', 'automation', 'unknown')),
  forum_channel_id text,
  forum_thread_id text,
  forum_message_id text,
  status text not null default 'new' check (status in ('new', 'needs_info', 'confirmed', 'fawxzzy_review', 'in_progress', 'fixed', 'closed', 'duplicate', 'spam', 'withdrawn')),
  completion_review_status text not null default 'not_required' check (completion_review_status in ('not_required', 'pending', 'approved', 'needs_followup')),
  status_updated_at timestamptz,
  status_updated_by_discord_user_id text,
  status_note text,
  completion_reviewed_at timestamptz,
  completion_reviewed_by_discord_user_id text,
  completion_review_note text,
  forum_title text,
  forum_applied_tag_ids text[] not null default '{}',
  reporter_mentioned_at timestamptz,
  runtime_warnings text[] not null default '{}',
  last_forum_sync_at timestamptz
);

create table if not exists discordos.discord_feedback_audit_events (
  id uuid primary key default gen_random_uuid(),
  report_id text not null references discordos.discord_feedback_reports(report_id) on delete cascade,
  action text not null check (action in ('status_update', 'completion_review', 'withdraw', 'reporter_update', 'staff_update', 'duplicate_signal', 'sync_format')),
  actor_label text,
  include_reporter_mention boolean not null default false,
  status_before text check (status_before is null or status_before in ('new', 'needs_info', 'confirmed', 'fawxzzy_review', 'in_progress', 'fixed', 'closed', 'duplicate', 'spam', 'withdrawn')),
  status_after text check (status_after is null or status_after in ('new', 'needs_info', 'confirmed', 'fawxzzy_review', 'in_progress', 'fixed', 'closed', 'duplicate', 'spam', 'withdrawn')),
  completion_review_status text check (completion_review_status is null or completion_review_status in ('not_required', 'pending', 'approved', 'needs_followup')),
  note text,
  duplicate_count integer check (duplicate_count is null or duplicate_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists discordos.discord_feedback_completion_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id text not null references discordos.discord_feedback_reports(report_id) on delete cascade,
  status text not null check (status in ('not_required', 'pending', 'approved', 'needs_followup')),
  reviewed_by_discord_user_id text not null,
  reviewed_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists discord_feedback_reports_short_display_id_idx on discordos.discord_feedback_reports(short_display_id);
create index if not exists discord_feedback_reports_status_idx on discordos.discord_feedback_reports(status);
create index if not exists discord_feedback_reports_forum_thread_id_idx on discordos.discord_feedback_reports(forum_thread_id);
create index if not exists discord_feedback_audit_events_report_id_created_at_idx on discordos.discord_feedback_audit_events(report_id, created_at desc);
create index if not exists discord_feedback_completion_reviews_report_id_reviewed_at_idx on discordos.discord_feedback_completion_reviews(report_id, reviewed_at desc);

create or replace function discordos.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_discord_feedback_reports_updated_at on discordos.discord_feedback_reports;
create trigger set_discord_feedback_reports_updated_at
before update on discordos.discord_feedback_reports
for each row
execute function discordos.set_updated_at();

alter table discordos.discord_feedback_reports enable row level security;
alter table discordos.discord_feedback_audit_events enable row level security;
alter table discordos.discord_feedback_completion_reviews enable row level security;

revoke all on schema discordos from public, anon, authenticated;
revoke all on all tables in schema discordos from public, anon, authenticated;
revoke all on all functions in schema discordos from public, anon, authenticated;

grant usage on schema discordos to service_role;
grant all privileges on all tables in schema discordos to service_role;
grant all privileges on all functions in schema discordos to service_role;
grant usage, select on all sequences in schema discordos to service_role;

comment on schema discordos is 'Private DiscordOS-owned runtime schema; not exposed to anon/authenticated clients.';
comment on table discordos.discord_feedback_reports is 'DiscordOS feedback report contract landing table. Fitness remains live source until approved cutover.';
comment on table discordos.discord_feedback_audit_events is 'DiscordOS feedback audit event contract table.';
comment on table discordos.discord_feedback_completion_reviews is 'DiscordOS feedback completion review event contract table.';
