# DiscordOS Socials Owner-Export Accepted-Preimage Receipt

Date: 2026-07-16
Repository: `fawxzzy/DiscordOS`
Branch: `codex/socials-owner-export-accepted-preimage`
Base: `876b30e17733b6cb3c3c89a667b5d546be09b4c6`
Status: local implementation verified; hosted PR gates remain external to this committed receipt

## Bounded outcome

The production owner-seed validator now reads an optional `acceptedPreimage` from an `owner_export` registry adapter. Before journal-event construction it checks the exact export ID, source revision, roadmap count, selected nonterminal count, ordered stable card IDs, and observed raw-file Git blob identity. Path-backed owner seed, canonical migration, and residual recovery hash the exact bytes and pass that identity through every validation call. A production caller that lacks the raw blob identity fails closed; object reconstruction is not accepted evidence. Any accepted-preimage failure suppresses the complete event batch. Adapters without this registry field retain their prior behavior.

The prior Socials-only hard-coded count constants were removed. Registry validation now requires `orderedCardIds` to be an actual array and fails missing or non-array declarations before they can become production authority, including malformed zero-count declarations.

## Accepted Socials authority

- repository: `fawxzzy/socials-os`
- repository commit: `99335e2f9a6fc4339d5577b41dd46fdfa7dcd85a`
- owner-export path: `exports/atlas.project-board.owner-export.v1.json`
- owner-export blob: `e70bd79135c99b89483e6edbd5a417d135aba753`
- export ID: `pbe_socials-os_773fe3821635`
- source revision: `sha256:773fe3821635533a72ec6949bb3e716c5ed93d233df29363f1bbca4d1aeb94fe`
- roadmap records: `23`
- selected nonterminal records: `12`
- ordered cards: `SOC-009`, `SOC-010`, `SOC-011`, `SOC-012`, `SOC-013`, `SOC-015`, `SOC-016`, `SOC-017`, `SOC-018`, `SOC-020`, `SOC-021`, `SOC-022`

Read-only GitHub API evidence confirmed that the named commit resolves the owner-export path to the named blob. Recomputing the Git blob object ID from the returned 51,628 bytes produced the same value. The returned export fields and ordered identities matched the registry declaration.

## Fail-closed matrix

Every case below returned `ok: false`, `eventCount: 0`, and `events: []` even when the same batch also contained an otherwise-valid non-Socials export:

| Case | Stable reason evidence |
| --- | --- |
| wrong adapter ID | `owner_export_preimage_adapter_mismatch` |
| wrong export ID | `owner_export_preimage_export_id_mismatch` |
| wrong source digest | `owner_export_preimage_source_revision_mismatch` |
| missing card | `owner_export_preimage_card_count_mismatch` |
| extra card | `owner_export_preimage_card_count_mismatch` |
| substituted same-count card | `owner_export_preimage_ordered_card_ids_mismatch` |
| reordered cards | `owner_export_preimage_ordered_card_ids_mismatch` |
| roadmap count drift | `owner_export_preimage_roadmap_record_count_mismatch` |
| selected count drift | `owner_export_preimage_exported_nonterminal_count_mismatch` |
| exact-byte Git blob drift | `owner_export_preimage_blob_mismatch` |
| same-envelope card content drift | `owner_export_preimage_blob_mismatch` |
| raw blob identity unavailable | `owner_export_preimage_blob_unverified` |

The exact accepted identity and selection envelope with its observed raw blob produced 12 deterministic ordered events. Canonical migration with the raw blob identity withheld returned no phases, `mutatesDiscord: false`, `sendsMessages: false`; residual recovery planning returned no Socials events.

## Verification

- `npm run verify:discordos-project-board-owner-seed`: pass, 21 tests, 0 failed
- `npm run verify:discordos-canonical-board-migration`: pass, 29 passed, 2 fixture-dependent skips, 0 failed
- `npm run verify:discordos-board-registry`: pass, 3 tests, 0 failed
- `npm run ops:discordos:project-board-owner-export:check`: pass, exact 5-card DiscordOS export current
- `npm run verify`: pass, exit code 0
- `git diff --check`: pass

The first unmodified full-verification attempt exposed the mandated nested worktree's pre-existing Atlas package-discovery assumption (`atlas_contracts_package_unavailable`). The successful full run used a temporary untracked path shim that mapped only the misderived nested-worktree package path to `C:\ATLAS\packages\atlas-contracts`. The shim was deleted immediately after verification and is not part of the diff.

The first exact-head Codex review found that canonical migration/recovery did not yet pass the raw blob identity and that registry validation normalized a missing ordered-card list to `[]`. Both findings were addressed additively: the raw file bytes now flow through every canonical owner-seed validation, missing blob evidence blocks before mutation, and non-array `orderedCardIds` values are invalid even at zero count.

## Invariance and authority

- Changed production behavior is registry-backed and generic; no Socials adapter ID is hard-coded in the validator.
- Non-Socials owner exports retain the existing conversion, terminal-history, text-integrity, identity, idempotency, lifecycle, and board checks.
- Existing journal, single-writer, lifecycle, readback, and mutation guards were not weakened.
- Accepted-preimage blob verification is mandatory for every production caller; canonical migration and residual recovery pass the raw-file identity through preview, planning, and apply validation.
- DiscordOS main remained clean at the exact base during implementation.
- No ATLAS-root, Socials OS, Fitness, Mazer, or other owner-repo file was written by this packet. Separate pre-existing dirty state observed in Mazer and Socials OS was left untouched.
- Live Discord commands were not run.
- `discord_mutations: 0`

## Next packet

`DiscordOS DOS-201/DOS-202 owner-registry lifecycle reconciliation`
