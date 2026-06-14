create schema if not exists discordos;

create table if not exists discordos.discordos_board_cards (
  card_id text primary key,
  workflow text not null,
  kind text not null check (kind in ('feature', 'bug', 'ops', 'release', 'moderation')),
  current_state text not null check (current_state in ('opened', 'in_progress', 'blocked', 'completed', 'closed')),
  source_thread_id text,
  publication_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  latest_transition_at timestamptz,
  latest_transition_actor text,
  latest_transition_note_present boolean not null default false,
  proof_payload jsonb not null default '{}'::jsonb,
  reason_codes text[] not null default '{}'
);

create index if not exists discordos_board_cards_workflow_idx
  on discordos.discordos_board_cards(workflow);

create index if not exists discordos_board_cards_current_state_idx
  on discordos.discordos_board_cards(current_state);

create index if not exists discordos_board_cards_source_thread_id_idx
  on discordos.discordos_board_cards(source_thread_id);

create index if not exists discordos_board_cards_workflow_state_idx
  on discordos.discordos_board_cards(workflow, current_state);

drop trigger if exists set_discordos_board_cards_updated_at on discordos.discordos_board_cards;
create trigger set_discordos_board_cards_updated_at
before update on discordos.discordos_board_cards
for each row
execute function discordos.set_updated_at();

alter table discordos.discordos_board_cards enable row level security;

revoke all on table discordos.discordos_board_cards from public, anon, authenticated;
grant all privileges on table discordos.discordos_board_cards to service_role;

comment on table discordos.discordos_board_cards is
  'Private DiscordOS board/card workflow state table. Service-role only; no public policies.';

comment on column discordos.discordos_board_cards.card_id is
  'Idempotency key for board/card workflow state.';

comment on column discordos.discordos_board_cards.proof_payload is
  'Bounded non-secret proof payload for board/card state transitions.';
