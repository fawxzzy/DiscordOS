# DiscordOS Socials Owner-Export Accepted-Preimage Receipt

Date: 2026-07-16
Repository: `fawxzzy/DiscordOS`
Branch: `codex/socials-owner-export-accepted-preimage`
Base: `876b30e17733b6cb3c3c89a667b5d546be09b4c6`
Status: local implementation verified; hosted PR gates remain external to this committed receipt

## Bounded outcome

The production owner-seed validator now reads an optional `acceptedPreimage` from an `owner_export` registry adapter. Before journal-event construction it checks the exact export ID, source revision, roadmap count, selected nonterminal count, and ordered stable card IDs. The path-backed command additionally computes and checks the exact Git blob object ID from the export file bytes. Any accepted-preimage failure suppresses the complete event batch. Adapters without this registry field retain their prior behavior.

The prior Socials-only hard-coded count constants were removed. Registry validation now fails malformed accepted-preimage declarations before they can become production authority.

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

The exact accepted identity and selection envelope produced 12 deterministic ordered events.

## Verification

- `npm run verify:discordos-project-board-owner-seed`: pass, 18 tests, 0 failed
- `npm run verify:discordos-canonical-board-migration`: pass, 27 passed, 2 fixture-dependent skips, 0 failed
- `npm run verify:discordos-board-registry`: pass, 3 tests, 0 failed
- `npm run ops:discordos:project-board-owner-export:check`: pass, exact 5-card DiscordOS export current
- `npm run verify`: pass, exit code 0
- `git diff --check`: pass

The first unmodified full-verification attempt exposed the mandated nested worktree's pre-existing Atlas package-discovery assumption (`atlas_contracts_package_unavailable`). The successful full run used a temporary untracked path shim that mapped only the misderived nested-worktree package path to `C:\ATLAS\packages\atlas-contracts`. The shim was deleted immediately after verification and is not part of the diff.

## Invariance and authority

- Changed production behavior is registry-backed and generic; no Socials adapter ID is hard-coded in the validator.
- Non-Socials owner exports retain the existing conversion, terminal-history, text-integrity, identity, idempotency, lifecycle, and board checks.
- Existing journal, single-writer, lifecycle, readback, and mutation guards were not weakened.
- DiscordOS main remained clean at the exact base during implementation.
- No ATLAS-root, Socials OS, Fitness, Mazer, or other owner-repo file was written by this packet. Separate pre-existing dirty state observed in Mazer and Socials OS was left untouched.
- Live Discord commands were not run.
- `discord_mutations: 0`

## Next packet

`DiscordOS DOS-201/DOS-202 owner-registry lifecycle reconciliation`
