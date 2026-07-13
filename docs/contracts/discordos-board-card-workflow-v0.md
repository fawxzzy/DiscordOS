# DiscordOS Board Card Workflow v0 Contract

## Scope

This is the v0 contract surface for DiscordOS board/card product workflows.

It is contract-first. It builds on the existing no-send-first forum/card lifecycle publication tooling, but it does not create persistent board storage, send Discord messages, mutate production config, or open a live board product lane by itself.

## Card Identity

Every board card should include:

- card id
- workflow
- kind
- optional source thread id
- created timestamp

The matching code-facing shape is `DiscordOSBoardCardIdentity` in `src/contracts/board.ts`.

## Card State

The admitted v0 card states are:

- `intake`
- `planning`
- `ready`
- `opened`
- `in_progress`
- `review`
- `blocked`
- `completed`
- `archived`
- `closed`

The matching code-facing state union is `DiscordOSBoardCardState` in `src/contracts/board.ts`.

## Continuous card journal

Board state is not allowed to live only in a ChatGPT or Codex transcript. Every governed work item must resolve or create one stable card and publish lifecycle evidence into that card while work is active.

The shared `atlas.board-card-journal.v1` event contains:

- stable event and card identities
- a complete canonical card snapshot
- summary, objective, acceptance criteria, discoveries, next actions, blockers, and evidence
- a progress entry describing completed work, new discoveries, next work, and blockers
- task, job, branch, commit, and receipt correlations

DiscordOS applies one event by:

1. Resolving the card by explicit thread ID, then stable `ATLAS-CARD-ID`, then one unique legacy title.
2. Creating the card when no match exists, or refreshing its canonical starter body when it does.
3. Preserving pre-contract legacy content as original context.
4. Appending exactly one thread message identified by `ATLAS-JOURNAL-EVENT-ID`.
5. Reopening an archived active card before mutation.
6. Reading back both the starter body and journal message before returning success.

Live mutation requires both `--allow-apply` and `DISCORDOS_BOARD_CARD_JOURNAL=enabled`; dry-run remains the default. Duplicate stable identities and ambiguous legacy titles block instead of guessing.

Required publication checkpoints are:

- admission or creation
- work start
- material checkpoint
- discovery that changes scope, acceptance criteria, priority, architecture, or risk
- blocker or unblock
- review readiness
- terminal completion or cancellation

Routine tool chatter does not require a card message. A checkpoint is material when a human reviewer would otherwise lose useful planning or execution context by reading only the starter body.

The cross-board consistency scanner reads the active Fitness board, active Mazer board, and shared Completed board and reports:

- cards missing stable identities
- cards missing the canonical managed starter body or update timestamp
- cards with no journal history
- active cards that are archived
- completed cards left on active boards
- invalid Completed-board state or source links
- duplicate stable card identities across boards

```powershell
npm run ops:production-env:run -- npm run ops:discordos:board-card-consistency:json -- --input <boards.json>
```

Legacy normalization is planned before it is applied. The migration planner joins live threads to owner records by explicit thread ID, stable card ID, or one unique normalized title. Unmatched threads receive a deterministic `legacy-<board>-<thread>` identity; ambiguous source matches block.

```powershell
npm run ops:production-env:run -- npm run ops:discordos:board-card-migration-plan:json -- --boards <boards.json> --fitness-export <fitness.json> --mazer-board <mazer.json> --output <events.json>
```

Fitness `fixed` records on an active board normalize to `review`, not `completed`, until proof-backed completion review authorizes transfer. Mazer records already marked `completed` remain terminal and are eligible for the guarded Completed-board transfer after normalization.

```powershell
npm run ops:production-env:run -- npm run ops:discordos:board-card-journal:json -- --input <event.json> --dry-run

$env:DISCORDOS_BOARD_CARD_JOURNAL='enabled'
npm run ops:production-env:run -- npm run ops:discordos:board-card-journal:json -- --input <event.json> --allow-apply --apply
```

## Completed-board transfer

Discord forum threads cannot be re-parented. A proof-complete card therefore moves through an idempotent clone-and-link operation owned by DiscordOS:

1. Create or reuse exactly one card in the shared `completed` forum using the stable card ID.
2. Preserve the original card content and append completion evidence plus a link to the source card.
3. Apply and read back the required success reaction on the completed card.
4. Add the completed-card link to the source card.
5. Archive and lock the source card only after destination readback succeeds.
6. Read back both surfaces and return a correlated receipt.

The source thread is never deleted. A destination failure leaves the source card active and produces a recoverable blocker. Live apply requires both `--allow-apply` and `DISCORDOS_BOARD_COMPLETED_TRANSFER=enabled`; dry-run is the default.

## Transition Contract

Every transition should include:

- card id
- previous state
- next state
- actor
- optional note
- occurrence timestamp
- proof object

The matching code-facing shape is `DiscordOSBoardCardTransition` in `src/contracts/board.ts`.

## Publication Boundary

The existing `npm run ops:discord:forum-card-lifecycle` command remains the publication producer for no-send-first card lifecycle updates. This contract does not bypass its target admission, duplicate-title protection, marker progress handling, or apply guard.

Active board-specific publishers must use the shared board-card contract helper in `scripts/discordos-board-card-contract.js` for live Discord forum card upserts. A board-specific sync script may construct card content and resolve board config, but it must not own independent Discord thread create, starter message patch, reaction mutation, or readback-success logic.

## Live Forum Card Contract

Every live Discord forum card upsert must derive a canonical card spec before touching Discord:

- stable identity: `card.id`
- canonical thread title from `board.titleContract` when present
- starter message payload from the board-specific content renderer
- required starter-message reaction from card-level status, board-level `requiredReaction`, or the default success/failure reaction map

Thread matching must prefer the stable identity embedded in the starter message, then canonical title, then the proposed title. A title-only match is not sufficient to claim the card is healthy.

## Title Contract

The default title contract preserves plain board titles. Boards that need an owner prefix must declare it in board config:

```json
{
  "titleContract": {
    "style": "prefix",
    "prefix": "mazer",
    "separator": ": ",
    "maxLength": 100
  }
}
```

Prefix normalization must be idempotent. For Mazer, `Skin deformation around nose wrinkles...` and `mazer: Skin deformation around nose wrinkles...` both normalize to one `mazer: ...` title, never `mazer: mazer: ...`.

Fitness titles remain owner-owned and plain. The observed Fitness title pattern is `Type: Area - Summary` with Discord's 100-character forum-thread limit applied by the owner repo.

## Reaction Contract

Required status reactions belong on the Discord forum starter message, not on later thread replies. The shared helper must read the starter message first, skip when the bot already reacted with the required emoji, apply the missing reaction when needed, then read back the message before reporting success.

Partial mutation is not success. If a title patch succeeds but reaction application or reaction readback fails, the card upsert result must stay incomplete and expose reason codes.

The current custom reaction ids are:

- success: `success:1507384062166302851`
- failure: `failure:1507384094424694785`

Historical Fitness docs and owner scripts may still refer to the stale `fawxzzy:<id>` emoji name. Live Discord readback shows the ids are correct but the active names are `success` and `failure`; future repairs should match by id and send the active Discord emoji name.

## Reconciliation

Use the reconciliation command for drift audits and bounded repair:

```powershell
npm run ops:production-env:run -- npm run ops:discordos:board-card-reconciliation:json -- --dry-run
```

Apply mode is guarded twice:

```powershell
$env:DISCORDOS_BOARD_CARD_RECONCILE='enabled'
npm run ops:production-env:run -- npm run ops:discordos:board-card-reconciliation:json -- --allow-apply --apply
```

The reconciler must report inspected cards, title repairs required/applied, reaction repairs required/applied, skipped cards, readback failures, and duplicate stable identities. It may repair titles and required starter-message reactions only for the selected board config.

## 2026-07-10 Readback Baseline

Mazer live board readback after the shared contract migration and local app state refresh:

- inspected cards: 35
- title repairs required: 0
- reaction repairs required: 0
- duplicate stable identities: 0

Fitness live readback through exported owner board links:

- exported cards: 53
- readable cards: 37
- cards skipped by missing/deleted thread access: 16
- title repairs required on readable cards: 0
- reaction repairs remaining on readable cards after bounded repair: 0

The skipped Fitness cards were not repaired because Discord returned `Unknown Channel` for their stored thread links, or the exported card had no thread link. They require owner-side data reconciliation before DiscordOS can safely mutate them.

## Forbidden Behaviors

This v0 contract does not allow:

- creating persistent board storage without a later explicit lane
- sending Discord messages from contract validation
- bypassing forum/card lifecycle preflight or release checks
- owning live forum thread create, starter patch, or reaction mutation inside a board-specific sync script when the shared helper supports it
- treating card contract state as deployed product state
- Fitness product code edits

## Verification

Use:

- `npm run verify:feedback-adapters`
- `npm run verify:discordos-feature-contract-status`
- `npm run ops:discordos:board-card-status`
- `npm run verify:discordos-board-card-contract`
- `npm run verify:discordos-board-card-reconciliation`
