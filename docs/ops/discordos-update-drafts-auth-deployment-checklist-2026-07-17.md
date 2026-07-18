# FP-DOS-UPDATE-DRAFTS-AUTH-001 deployment and rollback gates

No item in this checklist is authorized by the source packet.

## Cutover gates

1. Resolve the terminal `FP-DOS-UPDATE-DRAFTS-CALLER-RO-001` stop gate. Its bounded 15-root / 11,962-file evidence set found no committed caller, while current runtime invocation remains `UNKNOWN` and live v5 remains active. Either bind the exact caller repository, file, deployment, owner, and paired key-install order, or separately ratify a zero-invocation window and obtain explicit disable authority. Keep all other callers denied. Artifact SHA-256: `2fc8966fd32546c84f444dea1d006992ee024c9e8414a611bbce0ba1c3be3b76`.
2. Ratify one exact DiscordOS source head and one isolated non-production Supabase project.
3. Install a dedicated named `discordos-update-drafts-caller` secret through the provider secret lane. Never disclose its value.
4. Apply the forward migration and deploy the exact source head with per-function `verify_jwt=false` only in that isolated project.
5. Pass all 38 fixed units: 23 negative, 6 authorized, 5 provenance, and 4 deployment/config units.
6. Read back the exact function bundle, named auth mode, migration version, denied-call zero effect, authorized effects, and caller deployment identity.
7. Prove DiscordOS board/event/projection/readback/scheduler/update-draft/Auth parity, negative paths, backup/restore, and an owner-ratified observation window.
8. Obtain separate exact-project production and later target-cutover authority. A source PR merge is not deployment authority.

## Rollback contract

Rollback is fail-closed: stop the bound caller, revoke the dedicated named key, and disable/remove the candidate function deployment while preserving database and deployment preimages. Do not redeploy vulnerable live v5. If the forward migration has been applied, retain its additive columns and RPC contract until a separately reviewed rollback migration proves data safety; do not rewrite migration history.

Rollback completion requires exact provider metadata readback, denied-call zero effect, preserved data counts/digests, restored caller behavior or an explicit stopped state, and a durable observation receipt.

## Current gate state

- Source candidate and local deterministic matrix: verified source-only; 34/38 units pass and the four deployment units remain blocked.
- Committed caller: none found in the bounded attribution denominator.
- Current runtime caller/invocation: `UNKNOWN`.
- Non-production Supabase deployment: not performed.
- Production/source deployment: prohibited.
- Target deployment/cutover: prohibited.
- Four deployment denominator units: `blocked_not_executed`.
