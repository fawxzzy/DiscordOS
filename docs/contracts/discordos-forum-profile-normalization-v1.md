# DiscordOS Canonical Forum Profile and Migration v1

## Purpose

This contract defines one visible profile, title, and card-tag policy for all 13 required Discord project boards. The machine authorities are `config/discordos-board-registry.json` and `config/discordos-forum-profile-registry.json`.

The standalone scanner and normalizer remain supported. The serialized migration command is the only command authorized to resolve the available-tag/applied-tag dependency, classify retained legacy history, provision Socials OS, seed its owner export, and require exact 13-board readback.

## Canonical Identity and Titles

The forum identifies the project. Active managed card titles use `plain-work-outcome-v1`:

- no project prefix
- no Bug or Feature prefix
- exact delimited legacy prefixes are removed deterministically
- normal title words such as `Feature flag` or `Bug bounty` are not stripped
- retained Music Sesh history and the retained Shared Intake record are not renamed

Thread identity is always the exact Discord thread ID plus stable managed card ID when one exists. Title matching is never used to join retained history or invent owner truth.

Socials OS is admitted as required board 13. Before first provision its channel ID is intentionally unresolved and can resolve only by one exact `socials-os` forum name under the governed category. Provision readback supplies the exact ID used by every later operation in the same serialized cluster.

## Canonical Tags

Every forum declares the same moderated tag profile in this exact order:

1. Bug
2. Feature
3. Intake
4. Planning
5. Ready
6. Opened
7. In Progress
8. Review
9. Blocked
10. Completed
11. Low
12. Medium
13. High
14. Blocker
15. Duplicate
16. Withdrawn
17. Superseded

At most five tags may be applied. Live IDs are Discord transport identities, not semantic authority. Exact same-name IDs may be retained during profile replacement. Removed, orphan, unknown, or differently named IDs are never mapped by position or guessed.

Managed tags derive from owner-export fields first and managed starter fields second. A non-bug owner type maps to Feature because the canonical Type taxonomy is intentionally binary. Null or `Unspecified` priority produces no priority tag.

## Retained Legacy Disposition

Music Sesh has one active managed source:

- thread `1508141153835421798`
- card `music-sesh-phase-8-cross-service-room-sync-simple-controls`
- Feature, Blocked, High

The other 150 Music Sesh threads are `retained_legacy_history`. They remain outside active managed-card health and receive no manufactured owner identity, body, journal, title, or state.

Shared Intake has one `retained_unresolved_legacy` record. It is not defaulted to Planning and receives no generated active identity.

Retained rows preserve exact thread identity, starter, journal, archive/lock state, and immutable system history. If obsolete applied-tag IDs must be removed to replace the forum profile, the migration records the exact preimage in the runtime snapshot and classifies the result as `semantic_unknown_preserved`.

## Permissions and Defaults

Every board uses `restricted-single-writer-v1`:

- `@everyone`: deny View Channel and Send Messages
- `Verified`: allow View Channel
- `Fawx Security`: allow View Channel and Send Messages

Unknown, missing, or duplicate roles and unknown overwrites fail closed. Receipts redact live role IDs and omit the bot token.

Every board uses a null default reaction, null sort order, layout `0`, slowmode `0`, flags `0`, and NSFW `false`. Topics are exact registry values.

## Serialized Migration

The command is dry-run by default. Both receipt and snapshot paths must be under `runtime/`:

```powershell
npm run ops:production-env:run -- npm run ops:discordos:canonical-board-migration:json -- --snapshot-output <runtime-snapshot.json> --output <runtime-plan.json>
```

Apply requires the environment guard and explicit command guard:

```powershell
$env:DISCORDOS_CANONICAL_BOARD_MIGRATION='enabled'
npm run ops:production-env:run -- npm run ops:discordos:canonical-board-migration:json -- --allow-migration --apply --snapshot-output <runtime-snapshot.json> --output <runtime-receipt.json>
```

The apply cluster is serialized:

1. capture exact existing forum, thread, starter, journal, tags, permissions, and archive/lock preimages with complete pagination
2. provision or reuse Socials OS and resolve its exact ID
3. pre-clear only tag IDs that would become unsafe, while preserving archive/lock state
4. patch all forum topics, tags, permissions, and defaults
5. adopt the exact Phase 8 thread and migrate active managed titles/tags; clear retained-history obsolete tags without semantic guessing
6. validate and seed the 12-event Socials OS owner export idempotently, then apply canonical tags with no priority tag for null priority
7. run exact scanner readback across all 13 boards

The pre-clear makes every removed ID unreachable before forum replacement. A later failure is never accepted as terminal success. The receipt reports `recovery_required`, references the exact runtime preimage, and requires recover-forward completion. Orphan applied tags are never an accepted terminal state.

## Scanner Proof

The scanner verifies all 13 boards and all active managed cards across exact forum identity, tag order and IDs, semantic applied tags, title policy, permissions, defaults, bodies, journals, duplicate identities, pagination, archive/lock state, and text integrity.

Retained legacy history, superseded records, and active managed cards are separate denominators. After the live cluster, active managed health is the existing managed-card denominator plus Phase 8 plus 12 Socials OS cards. The 150 retained Music Sesh rows, one retained Shared Intake row, and superseded records remain reported separately.

This implementation PR does not authorize or perform a live Discord mutation. Live apply remains a separate post-merge operator authorization.
