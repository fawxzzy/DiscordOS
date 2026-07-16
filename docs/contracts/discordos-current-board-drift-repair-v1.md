# DiscordOS Current Board Drift Repair v1

## Purpose

This contract defines one targeted, fail-closed DiscordOS maintenance command for the admitted 2026-07-16 current-board event. It does not modify or ratchet the historical canonical 13-board / 10-unit closeout.

The sole command surface is:

```text
npm run ops:discordos:current-board-drift-repair -- <mode> --evidence <scan.json> [--plan <plan.json>] [--output <receipt.json>]
```

Modes are separate:

- `--generate-plan`: read-only source enrichment plus deterministic plan generation.
- `--preflight`: verify plan/evidence digests, current denominator, exact target preimages, and transfer replay state; never write.
- `--dry-run`: the same no-write contract with a dry-run receipt.
- `--apply --allow-apply`: execute only after every current preimage passes.

The default mode is `--preflight`. `--current-scan <fixture>` is admitted only for no-write preflight/dry-run evidence and is rejected by apply mode.

## Evidence and plan identity

The admitted evidence is content-addressed, not path-trusted:

- raw SHA-256: `a4768859896ea7c7d73f21eff6009dae5cbd3915aa8e14780d89a8d66ab2f182`
- canonical JSON SHA-256: `0f246e6196bf039924c1afd7799da16fd881ca778cfbb330f335dc3a15fcaddd`
- plan SHA-256: `1e2354552c5182b4a5475b8104959957725aa5a28294c89c8e204fb3806d4705`

The plan contains the exact stable board, channel, thread, card, tag, source-title, owner, body-hash, event, and order-slot preimages. The executor accepts only the reviewed plan schema/event and verifies the plan digest before any live read or write.

## Fixed scope

The only admitted operations are:

- 14 semantic applied-tag repairs.
- one 13-board relative-order repair using the registry order and the existing 13 board-position slots.
- three completed transfers for source threads `1526829391609335828`, `1526830094361038928`, and `1526830102946512959`.

Any extra or missing board, target, reason code, tag mapping, destination identity, or denominator row blocks the command. Tag and order state must be either the exact planned preimage or the exact planned postimage; no intermediate third state is accepted.

## Apply authority

Apply requires all of the following in the same invocation:

- `--apply`
- `--allow-apply`
- `DISCORDOS_CURRENT_BOARD_DRIFT_REPAIR=enabled`
- `DISCORDOS_BOARD_COMPLETED_TRANSFER=enabled`
- the normal Discord bot token admission

No guard is implied or synthesized by the command. Plan generation, preflight, dry-run, and default invocation never write.

## Execution and resume

Plan generation and execution are separate. Apply performs all scanner, raw tag, raw order, and completed-transfer preflights before the first write.

Operations are idempotent:

- exact tag postimages are recorded as already complete;
- exact registry order is recorded as already complete;
- completed destinations are reusable only through one exact stable-card-ID match;
- exact completed-transfer readback must include the managed body, completed state, source link, Feature/Completed tags, journal event, success reaction, reciprocal source link, and archived+locked source;
- a successful replay produces zero writes.

On partial failure, the receipt stops at the first failed write/readback. A later invocation re-runs the complete preflight and skips only operations proven complete by exact postimage readback. Duplicate completed cards and title-only destination reuse are forbidden.

## Ordering boundary

The order operation sends one bounded `PATCH /guilds/{guild.id}/channels` payload containing only the 13 registered forum channel IDs mapped onto the existing 13 board slots. Unrelated category channels are neither selected nor assigned positions. Exact guild-channel readback is mandatory.

## Terminal reconciliation

The later live apply is terminal only when the scanner reports:

- 13/13 registered boards;
- 246/246 healthy current rows;
- zero reason codes;
- zero duplicate stable identities;
- zero actionable text findings;
- unchanged historical evidence counts.

The exact next packet is: **DiscordOS guarded current 13-board drift live apply and reconciliation**.
