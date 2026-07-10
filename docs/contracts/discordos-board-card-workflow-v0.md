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

- `opened`
- `in_progress`
- `blocked`
- `completed`
- `closed`

The matching code-facing state union is `DiscordOSBoardCardState` in `src/contracts/board.ts`.

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

Mazer live board readback after the shared contract migration:

- inspected cards: 27
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
