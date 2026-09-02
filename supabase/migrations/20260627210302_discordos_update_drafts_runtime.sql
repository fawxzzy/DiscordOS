create schema if not exists discordos;

create table if not exists discordos.discord_update_drafts (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'vercel',
  status text not null default 'draft',
  deployment_id text not null,
  deployment_url text null,
  production_url text null,
  vercel_project_id text null,
  vercel_project_name text null,
  vercel_target text null,
  git_commit_sha text null,
  git_commit_ref text null,
  git_commit_message text null,
  user_facing_title text null,
  user_facing_changes text null,
  user_facing_why_it_matters text null,
  discord_channel_id text null,
  discord_message_id text null,
  published_by_discord_user_id text null,
  published_at timestamptz null,
  skipped_by_discord_user_id text null,
  skipped_at timestamptz null,
  skip_reason text null,
  webhook_received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discord_update_drafts_source_check check (source in ('vercel')),
  constraint discord_update_drafts_status_check check (status in ('draft', 'published', 'skipped', 'ignored', 'failed')),
  constraint discord_update_drafts_deployment_id_uq unique (deployment_id),
  constraint discord_update_drafts_user_facing_title_length_check check (
    user_facing_title is null or char_length(user_facing_title) <= 120
  ),
  constraint discord_update_drafts_user_facing_changes_length_check check (
    user_facing_changes is null or char_length(user_facing_changes) <= 1500
  ),
  constraint discord_update_drafts_user_facing_why_it_matters_length_check check (
    user_facing_why_it_matters is null or char_length(user_facing_why_it_matters) <= 800
  ),
  constraint discord_update_drafts_skip_reason_length_check check (
    skip_reason is null or char_length(skip_reason) <= 500
  ),
  constraint discord_update_drafts_vercel_target_length_check check (
    vercel_target is null or char_length(vercel_target) <= 40
  ),
  constraint discord_update_drafts_discord_channel_id_check check (
    discord_channel_id is null or discord_channel_id ~ '^[0-9]{5,32}$'
  ),
  constraint discord_update_drafts_discord_message_id_check check (
    discord_message_id is null or discord_message_id ~ '^[0-9]{5,32}$'
  ),
  constraint discord_update_drafts_published_by_discord_user_id_check check (
    published_by_discord_user_id is null or published_by_discord_user_id ~ '^[0-9]{5,32}$'
  ),
  constraint discord_update_drafts_skipped_by_discord_user_id_check check (
    skipped_by_discord_user_id is null or skipped_by_discord_user_id ~ '^[0-9]{5,32}$'
  )
);

create index if not exists discord_update_drafts_status_created_at_idx
  on discordos.discord_update_drafts (status, created_at desc);

create unique index if not exists discord_update_drafts_deployment_id_idx
  on discordos.discord_update_drafts (deployment_id);

create index if not exists discord_update_drafts_git_commit_sha_idx
  on discordos.discord_update_drafts (git_commit_sha)
  where git_commit_sha is not null;

create index if not exists discord_update_drafts_published_at_idx
  on discordos.discord_update_drafts (published_at desc)
  where published_at is not null;

drop trigger if exists set_discord_update_drafts_updated_at on discordos.discord_update_drafts;
create trigger set_discord_update_drafts_updated_at
before update on discordos.discord_update_drafts
for each row
execute function discordos.set_updated_at();

alter table discordos.discord_update_drafts enable row level security;

revoke all on discordos.discord_update_drafts from public, anon, authenticated;
grant all privileges on discordos.discord_update_drafts to service_role;

comment on table discordos.discord_update_drafts is 'DiscordOS-owned production deployment update draft store extracted from Fitness runtime.';
