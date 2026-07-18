# DiscordOS update-drafts authorization v1

Status: source candidate only; not deployed

Packet: `FP-DOS-UPDATE-DRAFTS-AUTH-001`

Stacked base: `bd12f6713518b3f3af3761618e3d3e5f6979f167`

## Capability boundary

`discordos-update-drafts` is an internal service-only capability. The Edge gateway JWT check is disabled for this function only. The handler accepts exactly one named secret-key identity, `discordos-update-drafts-caller`, from the `apikey` header and the runtime-owned `SUPABASE_SECRET_KEYS` binding. It rejects bearer-token fallback, every other named key, browser origins, unsupported methods or media types, malformed/oversized bodies, batches, unknown operations, authority overrides, and server-owned fields before constructing the admin client or invoking an RPC.

The pinned `@supabase/server@1.4.0` verifier performs constant-time secret comparison. The admin client is constructed with the same exact named key only after caller authentication and operation validation. No key value belongs in Git, receipts, logs, or diagnostics.

## Operations and ownership

The six source capabilities remain `list_latest`, `find_by_deployment_id`, `find_by_id`, `find_by_prefix`, `insert`, and `update`. Every database function scopes rows to `owner_service = 'discordos-update-drafts-caller'`. The handler supplies no caller-controlled owner, source, status, timestamp, revision, or service-audit field. Every request UUID is exactly 36 lowercase canonical characters with the standard hyphen positions, an admitted version nibble, and an RFC variant nibble; whitespace, uppercase, braces, loose hyphenation, oversized values, and ambiguous database-cast inputs are rejected before privileged client construction.

Inserts are server-initialized as `draft`, revision `1`, and are idempotent by deployment identity. An identical immutable-provenance replay returns the canonical row without a write; a conflicting replay returns a stable conflict.

Updates require the exact current `revision`, increment it atomically, and may change only the three user-facing content fields plus one validated terminal transition from `draft`. Publication and skip transitions require a validated Discord actor identifier; only skip accepts a reason. Timestamp and database audit columns are derived inside the RPC. Terminal drafts cannot be mutated again.

## Stable errors

The versioned machine-readable contract fixes the complete emitted set and HTTP status for every class:

- `UNAUTHORIZED` (401), `FORBIDDEN` (403), `METHOD_NOT_ALLOWED` (405), `UNSUPPORTED_MEDIA_TYPE` (415), and `PAYLOAD_TOO_LARGE` (413).
- `INVALID_PAYLOAD` (400), `UNSUPPORTED_ACTION` (400), `INVALID_OPERATION_PAYLOAD` (422), `INVALID_SELECTOR` (400), `IMMUTABLE_FIELD` (422), `INVALID_REVISION` (400), `INVALID_TRANSITION` (422), and `EMPTY_UPDATE` (400).
- `CONFLICT` (409), `NOT_FOUND` (404), `SERVICE_UNAVAILABLE` (503), and `PRIVILEGED_OPERATION_FAILED` (500).

No other error code or status is emitted. Unknown authentication, provider, database, or internal failures collapse to `PRIVILEGED_OPERATION_FAILED` (500), except explicitly recognized temporary authentication infrastructure failures, which map to `SERVICE_UNAVAILABLE` (503). Provider status, SQLSTATE, messages, request bodies, keys, details, stacks, and row diagnostics are never returned.

## Compatibility boundary

The forward migration preserves the existing table and six RPC identities, JSONB argument shape, service-role-only execute grants, RLS/table boundary, scheduler sources, board/event/projection/readback sources, and recovered migration history. The update request contract adds `expectedRevision`; insert and update field ownership is intentionally stricter. Caller adoption is therefore required before deployment.

This packet proves source compatibility only. It does not prove live caller adoption, Edge deployment, production parity, provider configuration, target cutover, or rollback execution.

The terminal `FP-DOS-UPDATE-DRAFTS-CALLER-RO-001` attribution pass found no committed caller across 12 public repositories / 9,273 text files or the wider 15-root / 11,962-file bounded evidence set. Live v5 remains active with `verify_jwt=true`; current runtime invocation is `UNKNOWN`. Its secret-safe artifact digest is `2fc8966fd32546c84f444dea1d006992ee024c9e8414a611bbce0ba1c3be3b76`. Deployment remains fail-closed until an owner binds the exact caller and paired key-install order, or separately ratifies a zero-invocation window and supplies explicit disable authority.
