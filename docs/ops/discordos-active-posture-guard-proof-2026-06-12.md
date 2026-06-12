# DiscordOS Active Posture Guard Proof

Date: 2026-06-12

## Decision

DiscordOS production may expose `active` writer and traffic posture only below the live cutover gate.

This is not a live workflow cutover receipt. The cutover gate now requires explicit live traffic and rollback execution receipt IDs in addition to active writer mode, active traffic mode, rollback-ready mode, and live parity proof.

## Proof

- Owner commit: `227c576`
- Production deployment: `dpl_AsuBanrKrhy4m9kLp5bQpQA11yjs`
- Production alias: `https://fawxzzy-discordos.vercel.app`
- Vercel production posture env:
  - `DISCORDOS_WRITER_MODE=active`
  - `DISCORDOS_TRAFFIC_TRANSFER_MODE=active`
  - `DISCORDOS_ROLLBACK_MODE=discordos-primary-with-fitness-rollback`

Live `/api/activation` reports:

- `writerMode: active`
- `trafficTransferMode: active`
- `rollbackMode: discordos-primary-with-fitness-rollback`
- `shadowWorkflowParityProved: true`
- `liveWorkflowParityProved: false`
- `liveParityProofIdPresent: false`
- `liveTrafficProofIdPresent: false`
- `rollbackExecutionProofIdPresent: false`
- `writerActivationAllowed: false`
- `liveCutover: false`
- `fitnessTrafficMoved: false`
- blocked reasons: `missing_live_workflow_parity_proof`, `missing_live_traffic_transfer_proof`, `missing_rollback_execution_proof`

Live `/api/readiness` reports the same activation posture and keeps the Supabase Edge service-role proof and Discord bot proof green.

The former shadow-transfer endpoint now fails closed under active traffic posture:

- endpoint: `/api/feedback-transfer-proof`
- status: `409`
- error: `SHADOW_TRANSFER_PROOF_NOT_ENABLED`
- `shadowWorkflowParityProved: true`
- `liveWorkflowParityProved: false`
- `liveTrafficMoved: false`
- `rollbackExecutionProved: false`
- blocked reason: `traffic_transfer_mode_not_shadow`

Supabase connector proof keeps both Edge Functions active:

- `discordos-readiness`: version `3`, `ACTIVE`, `verify_jwt: true`
- `discordos-feedback-persist`: version `3`, `ACTIVE`, `verify_jwt: true`

Vercel runtime logs for `dpl_AsuBanrKrhy4m9kLp5bQpQA11yjs` show:

- `GET /api/activation` -> `200`
- `GET /api/readiness` -> `200`
- `POST /api/feedback-transfer-proof` -> `409`

## Boundary

This pass did not modify Fitness, did not retarget the Discord application interaction URL, did not prove that Fitness-origin traffic reached DiscordOS, did not write Discord messages, and did not execute rollback.

The exact remaining blocker is live Fitness-to-DiscordOS traffic transfer plus rollback execution and live parity proof.
