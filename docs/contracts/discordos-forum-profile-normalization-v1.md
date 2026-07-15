# DiscordOS Forum Profile Normalization v1

## Purpose

This contract defines one deterministic forum-level configuration profile for every enabled, required board in `config/discordos-board-registry.json`. It covers the current 12-board denominator without authorizing a Discord mutation.

The machine-readable authority is `config/discordos-forum-profile-registry.json`. Every board registry row references one forum profile and one permission profile. The profile registry supplies exact structure, ordered tags, permissions, defaults, lifecycle/archive-lock expectations, exceptions, deferred decisions, post-seed proof counts, and the candidate marker measurement.

Forum-profile normalization is separate from card migration. It must never rewrite legacy Shared Intake or Music Sesh cards, decide active-source completion state, infer orphan tag meanings, or admit Socials OS.

## Canonical Forum Structure

Every governed board is a type-15 forum under the type-4 `Project Feedback Boards` category. Forum channel IDs remain registry authority. A channel ID whose name, type, or parent does not match the declared board is stale identity evidence and blocks apply rather than being silently repurposed.

Names and topics are exact per-board values in the profile registry. Relative order is declared for scanning, but position mutation is explicitly not applicable in the v1 normalizer. Shared Completed remains last. Board-specific title formats are card-level exceptions and are not forum normalization fields.

## Canonical Tags

At most five tags may be applied to a card. Available tags use this exact order:

| Semantic key | Name | Moderation |
|---|---|---|
| `type.bug` | Bug | Moderated except on community intake |
| `type.feature` | Feature | Moderated except on community intake |
| `state.intake` | Intake | Moderated |
| `state.planning` | Planning | Moderated |
| `state.ready` | Ready | Moderated |
| `state.opened` | Opened | Moderated |
| `state.in_progress` | In Progress | Moderated |
| `state.review` | Review | Moderated |
| `state.blocked` | Blocked | Moderated |
| `state.completed` | Completed | Moderated |
| `priority.low` | Low | Moderated |
| `priority.medium` | Medium | Moderated |
| `priority.high` | High | Moderated |
| `priority.blocker` | Blocker | Moderated |
| `outcome.duplicate` | Duplicate | Moderated |
| `outcome.withdrawn` | Withdrawn | Moderated |
| `record.superseded` | Superseded | Moderated |

Tags have no default emoji. Stable semantic keys are repository authority. Live tag IDs are Discord-assigned transport identities only. Removed, unknown, or orphan applied-tag IDs must never be guessed or reused as semantic truth.

## Permission Profile

The canonical `restricted-single-writer-v1` profile resolves roles by semantics at read time:

- `@everyone`: deny View Channel and Send Messages.
- `Verified`: allow View Channel only.
- `Fawx Security`: allow View Channel and Send Messages.

The guild-wide everyone role resolves from the guild identity. Named roles require one exact guild-role-name match. Missing, duplicated, or unknown roles block. Unknown channel overwrites also block because dropping one could change access. Durable receipts include semantic role keys, names, and permission meanings but redact all live role IDs and omit the bot token.

## Defaults

All profiles declare:

- default reaction: `null`
- default sort order: `null`
- default forum layout: `0`
- forum slowmode: `0`
- flags: `0`
- NSFW: `false`

Status reactions remain starter-message behavior under the board/card contract; they are not forum default reactions.

## Board Exceptions and Lifecycle

- Shared Intake: community-intake type tags may be unmoderated; legacy card migration and title normalization are deferred.
- Fitness: owner-owned plain titles remain card authority.
- Mazer: the `mazer: ` title prefix remains card authority.
- Atlas, Cortex, DiscordOS, Foundation, Lifeline, Playbook, and `_stack`: owner-export titles remain authority; `_stack` is explicitly empty-ready.
- Music Sesh: 151 legacy threads retain their current archive/lock state until the separate legacy disposition packet.
- Shared Completed: source titles remain preserved; orphan-tag cleanup is separate.

For governed active cards, open work is unarchived and unlocked. Superseded records are archived and locked. A transferred completion source must be archived and locked, but whether its managed state is `review` or `completed` remains an explicit separate decision. Current Completed records are `completed` and unlocked; archive state is not applicable because Discord auto-archive is allowed. Superseded Completed records are archived and locked.

## Read-Only Scanner

The denominator scanner requires `--output` and always writes a JSON receipt. It compares all enabled required boards across:

- exact channel identity, name, topic, type, parent, and declared relative order
- ordered available-tag names, moderation, emoji, and live transport IDs
- permissions and overwrites with role IDs redacted
- defaults, slowmode, flags, and NSFW
- orphan and semantically ambiguous applied tags
- card identity, managed starter format, journal presence, and content hashes exposed by the existing board contract
- duplicate stable identities and reciprocal completion pairs
- lifecycle, archive, and lock expectations
- text integrity and complete pagination readback

```powershell
npm run ops:production-env:run -- npm run ops:discordos:forum-profile-scan:json -- --output <receipt.json>
```

Incomplete channel, role, thread, starter, journal, or pagination readback blocks. Mojibake in the profile or live card surfaces is rejected; new source and configuration text remains ASCII.

## Guarded Normalization

The normalizer is dry-run by default and requires `--output`:

```powershell
npm run ops:production-env:run -- npm run ops:discordos:forum-profile-normalize:json -- --output <plan.json>
```

Apply requires both guards:

```powershell
$env:DISCORDOS_FORUM_PROFILE_NORMALIZATION='enabled'
npm run ops:production-env:run -- npm run ops:discordos:forum-profile-normalize:json -- --allow-normalization --apply --output <receipt.json>
```

Apply fails closed on unknown roles or overwrites, stale forum IDs, uncovered boards, orphan or ambiguous applied tags, invalid profiles, or incomplete live readback. Existing canonical tag IDs are reused only by exact declared name; new IDs are Discord-assigned. Every apply performs exact field-by-field readback across all 12 boards. The receipt excludes raw write payload role IDs.

This implementation lane did not run apply.

## Post-Seed Proof

The seven admitted owner-export boards are proven at 78/78:

- 78 input events journaled
- 78 cards created
- 78 journal entries created
- 78/78 exact starter readback
- 78/78 exact journal readback
- zero reason codes

The post-seed scan proves 12/12 coverage, 367 current cards, 215 healthy cards, 152 unchanged legacy drifts, 49 superseded records, zero duplicate identities, zero actionable text findings, and 124 immutable system-history findings.

The deterministic offline proof consumes the guarded live receipt plus the post-seed consistency receipt; it does not call Discord:

```powershell
npm run ops:discordos:project-board-owner-seed-proof:json -- --live-receipt <live.json> --scan-receipt <scan.json> --output <proof.json>
```

It cross-checks all 78 result thread/card identities against healthy post-seed rows, exact starter/journal readback flags, per-board counts, the complete 12-board denominator, and the exact remaining five legacy drift classes.

## Marker Candidate

The profile persists the scout's ten equal 10% units as a candidate measurement only. Post-seed candidate measurement is 30%: structural identity, owner-seed adoption, and text/duplicate/exact-readback safety are proof-backed, while permissions, canonical tags, legacy cards/journals, lifecycle decisions, and Socials OS admission remain open. This contract does not move any ATLAS marker.
