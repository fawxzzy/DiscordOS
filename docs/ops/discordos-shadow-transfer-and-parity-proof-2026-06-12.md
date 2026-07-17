# DiscordOS Shadow Transfer And Parity Proof

Date: 2026-06-12

## Scope

This receipt records the next DiscordOS owner-side blocker slice after Edge-backed persistence.

It proves a shadow transfer path only. It does not move Fitness traffic, does not send Discord messages, does not write Fitness state, and does not prove rollback execution.

## Changes

- Added `api/feedback-transfer-proof.js`.
- Added `tests/feedback-transfer-proof.test.js`.
- Updated `api/activation.js` to distinguish `shadowWorkflowParityProved` from `liveWorkflowParityProved`.
- Updated `api/readiness.js` to project the same shadow/live parity distinction.
- Updated the Supabase Edge writer to admit `shadow-transfer-proof-*` rows as proof-only.
- Added migration `supabase/migrations/20260612175354_discordos_feedback_shadow_transfer_proof_rpc.sql` to keep the proof RPC allowlist aligned.

## Required Production Posture

The proof endpoint requires:

```text
DISCORDOS_PERSISTED_WRITER_ENABLED=true
DISCORDOS_WRITER_MODE=shadow
DISCORDOS_TRAFFIC_TRANSFER_MODE=shadow
DISCORDOS_SHADOW_PARITY_PROOF_ID=<this governed receipt id>
```

The proof endpoint does not require `DISCORDOS_TRAFFIC_TRANSFER_MODE=active`.

## Boundaries

- `shadowTrafficTransferProved` may become true.
- `shadowWorkflowParityProved` may become true.
- `liveWorkflowParityProved` remains false.
- `liveTrafficMoved` remains false.
- `trafficMoved` remains false.
- `writesDiscord` remains false.
- `writesFitness` remains false.
- `rollbackExecutionProved` remains false.
- rollback posture remains `fitness-primary-retained`.

## Remaining Blocker

After this packet, the remaining blocker is expected to narrow to:

`active Fitness-to-DiscordOS traffic transfer and rollback execution proof`.
