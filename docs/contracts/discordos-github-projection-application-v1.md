# DiscordOS GitHub Projection Application v1

`discordos.github.projection-application.receipt.v1` is the separately governed application layer for an already validated `atlas.github.projection-intent.v1` dry-run receipt.

The adapter accepts intent, source receipt, dry-run receipt, ApprovalRecord v2, and optional prior application receipts. It rebuilds the dry-run receipt with the existing consumer and requires byte-stable agreement before proceeding. The projection intent remains `external_mutation: denied`; approval is carried only in the separate record.

An apply requires `decision: approved`, `action.kind: external-mutation`, `action.target: discordos:updates`, `action.scope: publish_projection:<exact projection id>`, a future expiry, and `single-writer`, `exact-readback`, and `no-mentions` constraints. The receipt preserves approval id, job id, actor, scope, expiry, constraints, dry-run fingerprint, correlation identity, and route/command plan.

Without `--apply`, the adapter is readiness-only and sends nothing. With `--apply`, it calls only the existing `discord-update-post.js` writer. A verified POST plus GET produces `sent_verified`; a successful POST with failed or mismatched GET produces terminal `sent_but_unverified`. Exact verified prior receipts suppress replay; sent-but-unverified receipts require reconciliation; conflicting prior evidence is quarantined.

The ApprovalRecord mirror is valid only for isolated DiscordOS CI. A sibling Atlas canonical schema is preferred and the mirror is locked to owner commit `d718d14c5f23a08c402e9bd821db6526f541034a` and SHA-256 `e882aae2ceb6ea65cc7a208f036e95ddc209c203f0b4b830372b8b2b35e954a2`.
