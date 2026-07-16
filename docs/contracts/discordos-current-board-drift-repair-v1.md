# DiscordOS Current Board Drift Repair v1

## Purpose

This contract defines one targeted, fail-closed DiscordOS maintenance command for the admitted 2026-07-16 current-board event. It does not modify or ratchet the historical canonical 13-board / 10-unit closeout.

The sole command surface is:

```text
npm run ops:discordos:current-board-drift-repair -- <mode> --evidence <scan.json> [--plan <plan.json>] [--output <receipt.json>] [--resume-receipt <prior-blocked-receipt.json> --resume-receipt-sha256 <trusted-exact-byte-sha256>]
```

Modes are separate:

- `--generate-plan`: read-only source enrichment plus deterministic plan generation.
- `--preflight`: verify plan/evidence digests, current denominator, exact target preimages, and transfer replay state; never write.
- `--dry-run`: the same no-write contract with a dry-run receipt.
- `--apply --allow-apply`: execute only after every current preimage passes.

The default mode is `--preflight`. `--current-scan <fixture>` is admitted only for no-write preflight/dry-run evidence and is rejected by apply mode. Apply requires `--output` so every admitted mutation attempt leaves a durable receipt. `--resume-receipt` is apply-only and requires an independently trusted SHA-256 of the exact original receipt bytes through `--resume-receipt-sha256`; a digest stored only inside the supplied JSON is not authority.

## Evidence and plan identity

The admitted evidence is content-addressed, not path-trusted:

- raw SHA-256: `a4768859896ea7c7d73f21eff6009dae5cbd3915aa8e14780d89a8d66ab2f182`
- canonical JSON SHA-256: `0f246e6196bf039924c1afd7799da16fd881ca778cfbb330f335dc3a15fcaddd`
- plan SHA-256: `2179246439631b51d4ff76395660c4fdf3e7a237d81c0cfd1e80d28dc1fe2841`

The plan contains the exact stable board, channel, thread, card, tag, source-title, owner, complete source body, body hash, event, order-slot, and full guild-channel invariant preimages. The executor binds execution to the independently published digest above, in addition to recomputing the plan digest and checking both evidence digests. Recomputing a digest over a modified plan does not authorize it.

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
- strict plan-backed execution rereads and byte-compares the source title against the reviewed title before destination discovery; destination title, body, and journal derivation use only that reviewed title;
- a pristine source requires `thread_metadata.archived === false`; Discord may omit `locked` only to represent the unlocked state;
- any unreadable listed destination starter blocks before creation; an unreadable identity is never treated as a non-match;
- archived destination discovery and journal-event lookup paginate to exhaustion under explicit fail-closed page limits;
- exact completed-transfer readback must byte-match the deterministic managed destination body, deterministic journal event, deterministic reciprocal source body, completed state, source link, Feature/Completed tags, success reaction, and archived+locked source;
- a corrupted known destination body or journal can be repaired only to the plan-derived exact postimage; no new destination or journal is created during that recovery;
- strict byte-exact body and journal enforcement is enabled only when the reviewed source preimage is supplied by this plan-backed command; the reusable standalone transfer CLI preserves a stable-ID-matched persisted destination and journal on replay;
- an exact archived+locked destination is classified without reopening and replays with zero writes; a repair-needed archived destination is reopened only for the bounded repair and restored to its exact prior archive/lock state before source mutation. The original state is retained in the operation receipt, restoration gets at most two logical attempts (each retaining the existing HTTP retry guard), only a successful re-close is recorded as restored, and a recovered first-attempt failure does not leave a stale blocking reason;
- if both bounded re-close attempts fail, the receipt remains blocked with the original required archive/lock state and exact successful-write count. A later plan-backed invocation may not adopt an open destination that still needs destination repair as its new preimage; without an explicit trusted state preimage it fails closed with `completed_card_destination_archive_preimage_unknown`;
- every blocked completed-transfer receipt that created or adopted a destination persists its exact stable thread ID and the destination archive/lock state that must survive the operation. This is `false/false` for a newly created destination and the captured live preimage for an existing destination; a failed create records no invented destination state. A later apply may use that prior exact plan/evidence-bound blocked receipt through `--resume-receipt`; the executor first binds the entire file to the independently trusted exact-byte digest, then binds its plan, evidence, card, operation, destination ID, and state before allowing the partial destination to resume. Tampering either archive/lock direction fails before live preflight and at zero writes;
- once a trusted partial destination exists, every later blocked return carries the same destination ID and original archive/lock expectation, including source, history, compare, reopen, and prewrite barriers. Repeated blocked resumes cannot erase authority or authorize duplicate creation;
- Discord transport promise rejection is converted at the single-writer boundary into a blocked phase receipt instead of escaping the command. A rejected read records `discord_read_transport_rejected`; a rejected write records `discord_write_outcome_unknown`, increments `discordMutationOutcomesUnknown`, stops later phases, and retains every earlier confirmed write plus any exact destination resume state. Confirmed writes remain exact in `discordMutations`, while any unknown write outcome makes `mutatesDiscord` conservatively true. Ambiguous rejected writes are not automatically replayed in the same invocation;
- a rejected final reconciliation scan is converted into `terminal_reconciliation_scan_rejected` and a durable blocked top-level receipt that preserves all earlier confirmed writes, unknown outcomes, and resumable destination state;
- journal history is classified before an archived destination reopens, required success-reaction reconciliation is deferred until the journal succeeds, and any journal read/create/update failure is a hard barrier before tag, reaction, or source mutation;
- the one admitted partial source state is the exact reviewed reciprocal-link body while the source is explicitly open and not locked (`locked` may be omitted by Discord); replay may perform only the remaining archive+lock transition, while every other source-body or state drift blocks;
- applied tag IDs are duplicate-sensitive sets: response order is irrelevant, but missing, extra, or duplicate IDs are rejected;
- completed-transfer receipts count every successful non-GET Discord request, including writes completed before a later blocked return;
- a successful replay produces zero writes.

On partial failure, the receipt stops at the first failed write/readback except for a bounded destination archive-state restoration required after a repair attempt. A later invocation re-runs the complete preflight and skips only operations proven complete by exact postimage readback. Terminal reconciliation combines the refreshed scanner denominator/order/tag proof with a second plan-bound completed-transfer inspection for every operation, re-proving the exact destination body, title, tags, journal, success reaction, source link, source reciprocal body, source archive/lock, and destination archive-state contract before reporting `applied_and_reconciled`. When a completed destination was created or reopened before the failure, resume requires the durable prior blocked receipt; it is never inferred from the currently open thread. Duplicate completed cards and title-only destination reuse are forbidden.

Immediately before each tag PATCH and the one forum-order PATCH, the writer performs a fresh exact runtime inspection. It writes only if that compare-before-write still matches the planned preimage; an already-complete postimage becomes a zero-write replay, and any third state blocks the operation and all later operations. Final readback remains mandatory after a write.

## Ordering boundary

The order operation sends one bounded `PATCH /guilds/{guild.id}/channels` payload containing only the 13 registered forum channel IDs mapped onto the existing 13 board slots. Unrelated category channels are neither selected nor assigned positions. The plan records the full relevant guild-channel preimage, and preflight plus post-write readback require every unrelated channel's ID, type, parent, position, and name to remain exact.

## Terminal reconciliation

The later live apply is terminal only when the scanner reports:

- 13/13 registered boards;
- 246/246 healthy current rows;
- zero reason codes;
- zero duplicate stable identities;
- zero actionable text findings;
- unchanged historical evidence counts.

The exact next packet is: **DiscordOS guarded current 13-board drift live apply and reconciliation**.
