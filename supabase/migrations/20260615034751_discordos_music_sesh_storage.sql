create schema if not exists discordos;

create table if not exists discordos.discordos_music_sesh_sessions (
  session_id text primary key,
  guild_id text not null,
  channel_id text not null,
  current_state text not null check (current_state in ('open', 'locked', 'closed')),
  opened_by_fingerprint text not null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proof_payload jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'
);

create table if not exists discordos.discordos_music_sesh_queue_items (
  queue_item_id text primary key,
  session_id text not null references discordos.discordos_music_sesh_sessions(session_id) on delete cascade,
  item_title text not null,
  requested_by_fingerprint text not null,
  queue_position integer not null default 0,
  current_state text not null default 'queued' check (current_state in ('queued', 'skipped', 'played')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proof_payload jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'
);

create table if not exists discordos.discordos_music_sesh_votes (
  vote_id text primary key,
  session_id text not null references discordos.discordos_music_sesh_sessions(session_id) on delete cascade,
  queue_item_id text references discordos.discordos_music_sesh_queue_items(queue_item_id) on delete cascade,
  actor_fingerprint text not null,
  vote_direction text not null check (vote_direction in ('up', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  proof_payload jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}',
  unique (session_id, queue_item_id, actor_fingerprint)
);

create index if not exists discordos_music_sesh_sessions_state_idx
  on discordos.discordos_music_sesh_sessions(current_state);

create index if not exists discordos_music_sesh_queue_items_session_idx
  on discordos.discordos_music_sesh_queue_items(session_id);

create index if not exists discordos_music_sesh_votes_session_idx
  on discordos.discordos_music_sesh_votes(session_id);

drop trigger if exists set_discordos_music_sesh_sessions_updated_at on discordos.discordos_music_sesh_sessions;
create trigger set_discordos_music_sesh_sessions_updated_at
before update on discordos.discordos_music_sesh_sessions
for each row
execute function discordos.set_updated_at();

drop trigger if exists set_discordos_music_sesh_queue_items_updated_at on discordos.discordos_music_sesh_queue_items;
create trigger set_discordos_music_sesh_queue_items_updated_at
before update on discordos.discordos_music_sesh_queue_items
for each row
execute function discordos.set_updated_at();

drop trigger if exists set_discordos_music_sesh_votes_updated_at on discordos.discordos_music_sesh_votes;
create trigger set_discordos_music_sesh_votes_updated_at
before update on discordos.discordos_music_sesh_votes
for each row
execute function discordos.set_updated_at();

alter table discordos.discordos_music_sesh_sessions enable row level security;
alter table discordos.discordos_music_sesh_queue_items enable row level security;
alter table discordos.discordos_music_sesh_votes enable row level security;

revoke all on table discordos.discordos_music_sesh_sessions from public, anon, authenticated;
revoke all on table discordos.discordos_music_sesh_queue_items from public, anon, authenticated;
revoke all on table discordos.discordos_music_sesh_votes from public, anon, authenticated;

grant all privileges on table discordos.discordos_music_sesh_sessions to service_role;
grant all privileges on table discordos.discordos_music_sesh_queue_items to service_role;
grant all privileges on table discordos.discordos_music_sesh_votes to service_role;

comment on table discordos.discordos_music_sesh_sessions is
  'Private DiscordOS Music Sesh session state table. Service-role only; no public policies.';

comment on table discordos.discordos_music_sesh_queue_items is
  'Private DiscordOS Music Sesh queue table. Service-role only; no public policies.';

comment on table discordos.discordos_music_sesh_votes is
  'Private DiscordOS Music Sesh vote table. Service-role only; no public policies.';

comment on column discordos.discordos_music_sesh_sessions.session_id is
  'Idempotency key for Music Sesh session state.';

comment on column discordos.discordos_music_sesh_queue_items.queue_item_id is
  'Idempotency key for Music Sesh queue items.';

comment on column discordos.discordos_music_sesh_votes.vote_id is
  'Idempotency key for Music Sesh votes.';
