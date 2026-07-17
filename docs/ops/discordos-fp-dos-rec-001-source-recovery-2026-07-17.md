# DiscordOS FP-DOS-REC-001 Source Recovery Receipt

Date: 2026-07-17

## Scope

Recovered repository source only from authenticated, read-only Supabase metadata and source surfaces. No Supabase, Auth, schema, data, Edge Function, cron, Discord, board, production, or secret mutation was performed. Publishing the required GitHub PR exercised the repository's existing automatic non-production Vercel Preview integration; no manual deployment, promotion, or production action occurred.

The isolated branch started from `aef01f277e006e3cb46550e507ebd8e4a1be9d21`. The canonical checkout, DiscordOS PR #104, Atlas root, and other owner repositories were not modified.

## Recovered source

The repository now maps all 17 live migration versions to 17 canonical source files, and every filename begins with its exact live version. The six recovered live-only versions are:

- `20260612082854`
- `20260627201353`
- `20260627202737`
- `20260627202816`
- `20260627210302`
- `20260627211548`

`supabase/source-provenance.manifest.json` records separate provider-raw and repository-canonical byte counts and SHA-256 digests. Migration comparison normalizes to LF with exactly one terminal newline.

The manifest also binds all six live Edge Function identities. `discordos-update-drafts` v5 preserves the exact authenticated provider source at 6,703 bytes with source SHA-256 `b0658e5a52534a34cb14abec5776cdaab8969c0fa04f7c3b64b4652c83272050`. Its distinct provider bundle digest is `fc366e5b614f9a776ff15f291a41d8dc3173375a6fa5dcd86e5e5b65eec229fa`.

## Disposable replay

A new packet-owned PostgreSQL 17 cluster was created on an isolated high local port. The replay used manifest live-version order. Review remediation subsequently aligned all ten mismatched historical filenames to those same live versions without changing their source blobs, so normal migration filename order now matches the replay contract.

- versions `20260612082758` through `20260627201353`: applied successfully from zero
- version `20260627202737`: failed because the local PostgreSQL installation has neither `pg_cron` nor `pg_net` extension control files
- partial state before the expected extension boundary: 9 DiscordOS tables, all 9 with RLS enabled
- actual zero-to-head replay: **not proven**
- replay status: `blocked_missing_local_supabase_extensions`

The packet-owned server was stopped, its selected port was read back with zero listeners, and its disposable data directory was removed. Existing listeners on ports 5432 and 5433 were not attached to or mutated.

## Live catalog comparison

Read-only, no-reveal catalog queries confirmed the accepted live shape:

- 10 `discordos` tables; RLS enabled on all 10; zero policies
- only `service_role` has table privileges among `anon`, `authenticated`, and `service_role`; each table exposes the expected seven table privileges to `service_role`
- 16 public `discordos_*` RPC signatures; all are security invoker, have explicit search paths, deny `anon` and `authenticated` execution, and allow `service_role` execution
- `discordos.set_updated_at()` has `search_path=discordos, pg_temp`
- `discordos_private.trigger_message_command_poll(base_url text, bearer_token text)` exists with its accepted parameterized signature
- 6 update triggers match recovered source
- installed extensions include `pg_cron` 1.6.4, `pg_net` 0.20.0, `pgcrypto` 1.3, `supabase_vault` 0.3.1, and `uuid-ossp` 1.1
- the active cron entry is `discordos_message_commands_poll`, scheduled every minute, and invokes the parameterized helper
- cron command bytes: 162; SHA-256: `734b62309d3cf535c1dc91f603e4338d1f4039a656f75dace6d986dade938dc3`
- the no-reveal cron scan returned no bearer-token or JWT literal shape

The cron command plaintext was not returned or committed. Its hidden secret-reference mechanism remains UNKNOWN because the safe metadata showed neither a Vault nor `current_setting` reference.

## Known live security risk

The exact recovered `discordos-update-drafts` v5 source uses its service-role credential after Edge gateway JWT verification without an additional caller-role or internal shared-secret check. A project publishable/anon JWT accepted by the gateway may therefore reach service-role RPC operations. This is a known live authorization risk, not an UNKNOWN.

Changing the recovered file in this packet would alter accepted live behavior and invalidate the authenticated 6,703-byte source identity. Remediation requires a separately admitted Edge security packet, deterministic authorization tests, and explicit deployment authority. This PR does not deploy the recovered source.

## Advisor baseline

Read-only advisor checks were recorded, not repaired:

- security: 12 findings (10 INFO, 2 WARN), representing the intentional RLS-without-policy service boundary plus the accepted helper search-path and `pg_net` placement warnings
- performance: 26 findings (25 INFO, 1 WARN), including existing unused/unindexed/duplicate-index and Auth connection-strategy observations

These are accepted live-baseline observations for source recovery. Semantic cleanup is outside FP-DOS-REC-001.

## Deterministic verification contract

`tests/discordos-supabase-source-provenance.test.js` proves:

- complete 17-migration and 6-Edge denominators
- exact live-version filename identities for all 17 migrations
- exact canonical source byte counts and SHA-256 digests
- provider-raw migration and Edge digests re-derived from committed bytes, including provider terminal-newline behavior
- the six recovered historical identities
- exact Edge raw-source and independently frozen provider-bundle digest separation
- parameterized scheduler helper semantics without cron plaintext
- 10-table, 18-function, and 6-trigger source identities
- RLS and service-role-only update-draft contracts
- explicit regression evidence for the accepted update-drafts caller-authorization risk
- no credential-value or machine-path shapes in recovered artifacts

The provenance regression is part of canonical `npm run verify` as well as the deployment-surface subset.

## Remaining UNKNOWNs

- Full zero-to-head replay remains unproven until a newly owned disposable runtime includes Supabase-compatible `pg_cron` and `pg_net` extensions.
- The provider-owned `ezbr_sha256` bundle derivation is not equated with raw source SHA-256.
- Hidden cron plaintext and its secret-reference source were intentionally not read.

## Next packet

`FP-MZR-REC-001` remains owned and admitted only by ATLAS MAIN. It was not started here.
