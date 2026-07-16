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
6. Reading back the exact starter body and journal message, including every Unicode code point, before returning success.

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

## Unicode and text integrity

Board titles, starter bodies, journal messages, owner exports, JSON inputs, and readback evidence use UTF-8 and NFC-normalized Unicode. Valid em dashes (`U+2014`), en dashes (`U+2013`), curly quotes, accented names, and non-English names remain Unicode; they are not transliterated to ASCII.

`scripts/discordos-board-text-integrity.js` owns deterministic classification and bounded diagnostic recovery. Every finding carries its exact UTF-16 span and code points. File-byte boundaries use fatal UTF-8 decoding. Invalid UTF-8, `U+FFFD`, unpaired surrogates, non-round-trippable text, and ambiguous recovery fail closed.

A Windows-1252-to-UTF-8 recovery candidate is valid only when reconstructing its Windows-1252 bytes produces strict UTF-8, encoding the decoded value round-trips to the exact source span, and the deterministic corruption score strictly decreases. Recovery permits at most two passes. Recovery is diagnostic and migration-supporting behavior, not permission for an outbound writer to silently repair proposed text: journal events, card upserts, and owner exports containing classified corruption block before mutation.

Every rendered journal event field is checked before a starter or journal body is produced. Generic forum-card upserts validate the complete proposed title and payload, then require exact post-write title and starter readback with expected and actual code-point evidence. Marker-only or ASCII-substituted readback is not success.

Discord system history is classified separately from mutable board content. Discord documents `CHANNEL_NAME_CHANGE` (`type 4`) and other system-message types as non-deletable, and rejects attempted mutation with API error `50021` (`Cannot execute action on a system message`): <https://docs.discord.com/developers/resources/message> and <https://docs.discord.com/developers/topics/opcodes-and-status-codes>. Corrupt system history on an already-superseded, archived thread remains reported with exact IDs and code points, but is retained as immutable evidence rather than counted as actionable board drift. The same finding on a current thread remains actionable and requires a clean replacement/retirement flow. Cleanup commands must never retry deletion of a documented non-deletable system-message type.

## Authoritative board registry

`config/discordos-board-registry.json` is the single machine-readable denominator for governed Discord project boards. Every entry declares:

- stable board identity and project ownership scope
- forum channel identity and active, completed, or legacy role
- source adapter and stable-card namespace
- forum and permission profiles plus lifecycle normalization, reaction, journal, and encoding policies
- completion destination
- required, enabled, or explicitly blocked admission state with reason and evidence

Registry validation rejects duplicate board IDs, forum channel IDs, and stable-card namespaces; invalid roles, statuses, and lifecycle states; unknown adapters and policy references; missing or invalid completion targets; and overlapping enabled ownership scopes. A required blocked entry is valid registry structure but blocks consistency success until its admission evidence changes.

The governed denominator is `13` required boards, including Socials OS. Socials has an admitted owner adapter and resolves its exact forum ID inside the first serialized provision cluster. The prior 12-board live receipt remains historical baseline evidence; it is not proof that board 13 is visible.

### Owner-export accepted preimages

An `owner_export` source adapter may declare an `acceptedPreimage` in the board registry. The declaration is adapter data, not adapter-specific code. Before constructing any journal event, the production owner-seed validator compares the proposed export with the declaration's exact export ID, source revision, roadmap record count, selected nonterminal count, and ordered stable card IDs. A mismatch blocks the batch and returns zero events, including events from otherwise-valid exports in the same batch. Adapters without an `acceptedPreimage` retain their prior validation behavior.

Every production caller must retain the raw owner-export bytes long enough to compute their Git blob object ID and pass that observed identity into owner-seed validation. The path-backed owner-seed command does this directly. Canonical migration and residual recovery read the Socials file once, parse that same byte buffer, and pass its computed object ID through preview, planning, and apply validation. An accepted-preimage adapter with no observed blob identity fails closed before provision or journal-event generation; reconstructing bytes from a parsed object is not accepted evidence. The registry records the source repository and commit as immutable chain-of-custody evidence even though those values are not fields in `atlas.project-board.owner-export.v1`.

Registry validation requires `orderedCardIds` to be an actual array even when `exportedNonterminalCount` is zero. Missing, null, string, or object values are malformed authority and cannot be normalized to an empty accepted set.

The accepted `socials-os-roadmap-v1` preimage is:

- repository: `fawxzzy/socials-os`
- repository commit: `99335e2f9a6fc4339d5577b41dd46fdfa7dcd85a`
- owner-export blob: `e70bd79135c99b89483e6edbd5a417d135aba753`
- export ID: `pbe_socials-os_773fe3821635`
- source revision: `sha256:773fe3821635533a72ec6949bb3e716c5ed93d233df29363f1bbca4d1aeb94fe`
- roadmap records: `23`
- exported nonterminal records: `12`
- ordered card IDs: `SOC-009`, `SOC-010`, `SOC-011`, `SOC-012`, `SOC-013`, `SOC-015`, `SOC-016`, `SOC-017`, `SOC-018`, `SOC-020`, `SOC-021`, `SOC-022`

Changing any accepted identity is a registry-contract change requiring a new reviewed owner packet. Count-only admission is forbidden.

Forum-level configuration authority is `config/discordos-forum-profile-registry.json` and `docs/contracts/discordos-forum-profile-normalization-v1.md`. Forum tags, permissions, defaults, structure, orphan applied tags, and archive/lock expectations are scanned denominator-wide. Forum normalization remains separate from legacy card migration and active-source completion semantics.

The registry-driven cross-board consistency scanner reports:

- cards missing stable identities
- cards missing the canonical managed starter body or update timestamp
- cards with no journal history
- active cards that are archived
- completed cards left on active boards
- invalid Completed-board state or source links
- duplicate stable card identities across boards
- registered, enabled, blocked, excluded, and uncovered boards
- required blocked admissions and live forums absent from the registry
- incomplete archived-thread or journal-message pagination
- Unicode/text-integrity counts by board, surface, and corruption pattern
- exact thread IDs and message IDs for title, starter, and journal findings on both current and superseded rows
- separate actionable and immutable-system-history finding totals

The scanner reads archived forum inventory and card history through shared bounded pagination. A failed page, missing pagination cursor, or exhausted page bound fails closed; the scanner must never infer journal absence, completion, or text cleanliness from only the first 100 messages. Superseded rows are inspected across title, starter, and complete journal history before their lifecycle-specific result is returned.

```powershell
npm run ops:production-env:run -- npm run ops:discordos:board-card-consistency:json

npm run ops:production-env:run -- npm run ops:discordos:board-card-consistency:json -- --registry config/discordos-board-registry.json
```

`--input <boards.json>` remains compatible for bounded legacy callers. It reports `inventorySource=legacy_input` and `coverageStatus=not_evaluated` because caller-supplied boards cannot prove the complete live denominator.

Legacy normalization is planned before it is applied. The migration planner joins live threads to owner records by explicit thread ID, stable card ID, or one unique normalized title. Unmatched threads receive a deterministic `legacy-<board>-<thread>` identity; ambiguous source matches block. Corrupt or ambiguous owner exports, live titles, starters, journals, and proposed events block with exact field or live-message evidence; valid Unicode remains unchanged.

The planner reads the complete paginated journal history before emitting an event. For normalization-only events, an existing valid journal state outranks the owner/export baseline, including terminal `completed` and `archived` states. Identity, body, title, and timestamp normalization must not advance, regress, reopen, or complete lifecycle state. Missing journal history keeps the mapped baseline; unreadable, truncated, malformed, identity-conflicting, or ambiguous journal history blocks the affected event.

Legacy `ATLAS-JOURNAL-EVENT-ID` entries may omit the `- card:` metadata. Those entries participate only when the owner source was selected by exact `source_thread_id` identity and the complete relevant history contains no explicit mismatched card ID. An all-omitted history and a mixed omitted-plus-matching history are accepted under that exact-thread gate. Any explicit mismatch blocks the card. Stable-card, title-only, fallback, ambiguous, and unmatched source selection cannot admit an omission. This exception changes identity admission only; lifecycle precedence, complete-history pagination, duplicate-event conflict checks, latest-state ambiguity checks, and authorized-transition rules remain unchanged.

Each resolved planner row carries `journalLifecycleStatus` and a deterministic `journalIdentityDecision` containing the source match mode, exact-thread result, total/missing/matching/conflicting counts, sorted explicit card IDs, a decision name, and reason codes. Admission uses `journal_lifecycle_card_identity_omission_admitted_exact_source_thread` or `journal_lifecycle_card_identity_mixed_match_admitted_exact_source_thread`. Non-exact omission uses `journal_lifecycle_card_identity_omission_requires_exact_source_thread`; explicit mismatch retains `journal_lifecycle_card_identity_conflict`.

```powershell
npm run ops:production-env:run -- npm run ops:discordos:board-card-migration-plan:json -- --boards <boards.json> --fitness-export <fitness.json> --mazer-board <mazer.json> --output <events.json>
```

An explicit transition may be supplied only in the board packet's top-level `lifecycleTransitions` array. It must identify one card (and optionally its exact thread), set `authorized: true`, declare a unique event ID, matching `fromState`, allowed `toState`, actor and occurrence time, and include `live_runtime` or `human_verified` proof with a receipt path or Discord message ID. The emitted journal event carries `card.previousState` and the full transition record. Partial, unauthorized, duplicated, stale, or conflicting transition evidence blocks instead of falling back to normalization.

```json
{
  "boards": [],
  "lifecycleTransitions": [
    {
      "eventId": "transition:<card-id>:<state>:v1",
      "cardId": "<card-id>",
      "threadId": "<thread-id>",
      "fromState": "in_progress",
      "toState": "review",
      "actor": "atlas.operator",
      "occurredAt": "<ISO-8601 timestamp>",
      "authorized": true,
      "proof": {
        "strength": "human_verified",
        "receiptPath": "<relative receipt path>",
        "messageId": null,
        "generatedAt": "<ISO-8601 timestamp>"
      }
    }
  ]
}
```

Fitness `fixed` records on an active board normalize to `review`, not `completed`, until proof-backed completion review authorizes transfer. Mazer records already marked `completed` remain terminal and are eligible for the guarded Completed-board transfer after normalization.

Before either dry-run admission or live apply, the journal command runs one fresh scan against `config/discordos-board-registry.json` and evaluates the complete input batch before processing the first event. Stable card IDs are trimmed and compared case-insensitively across every current non-superseded registry row, including other threads on the same board. An ID is admitted only when it has no live match or every live match is the event's exact explicit `card.threadId`; title and stable-ID fallback matching cannot establish same-thread identity for this gate.

The batch fails closed before any Discord write when a proposed ID belongs to a different current thread (`source_card_id_live_collision`), when normalized candidates repeat within the batch (`batch_candidate_identity_duplicate`), or when the full registry scan is incomplete (`live_identity_preflight_stale`). The result embeds scan timestamps, the registry path, normalized candidates, exact target thread IDs, and deterministically sorted matching and collision locations. Known blocked board-admission rows remain reported by the registry scan but do not make enabled-board identity inventory stale.

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
- canonical plain work-outcome title with project and Bug/Feature prefixes removed
- starter message payload from the board-specific content renderer
- required starter-message reaction from card-level status, board-level `requiredReaction`, or the default success/failure reaction map

Thread matching must prefer the stable identity embedded in the starter message, then canonical title, then the proposed title. A title-only match is not sufficient to claim the card is healthy.

Existing canonical starter bodies are protected by a read-before-write preflight. A replacement body must carry the same stable card ID plus project, state, owner, priority, summary, objective, acceptance criteria, next actions, and a valid `updated` timestamp. Changed canonical content is admitted only when that timestamp is strictly newer than the live body. Missing fields, older content, equal-timestamp conflicts, or identity conflicts block before mutation with stable reason codes including `canonical_card_body_downgrade_prevented`, `canonical_card_body_older_than_live`, `canonical_card_body_timestamp_conflict`, and `canonical_card_identity_conflict`.

The same preflight blocks classified corruption in a proposed title or payload. After an admitted create or update, the shared helper reads back the thread and starter message and compares their complete Unicode strings exactly. Reaction success cannot mask a title or starter code-point mismatch.

Board writers must plan every admitted card before executing any write. If one row fails preflight, the batch performs no thread, starter-message, or reaction mutation. Unchanged title/body/reaction triples return `unchanged` and perform no mutation. Execution must reject any row outside the admitted card set with `card_mutation_out_of_scope_prevented`.

## Title Contract

All boards use `plain-work-outcome-v1`. Forum identity supplies the project, so project and canonical Bug/Feature prefixes are forbidden in active managed titles. Removal is limited to exact delimited prefixes, is idempotent, and does not damage ordinary words such as `Feature flag` or `Bug bounty`. Retained Music Sesh history and the retained Shared Intake record keep their original titles.

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
- `npm run verify:discordos-board-registry`
- `npm run verify:discordos-board-card-contract`
- `npm run verify:discordos-board-card-reconciliation`
