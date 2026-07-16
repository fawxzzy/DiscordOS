# DiscordOS Mazer Cross-Viewport Production Release Receipt - 2026-07-16

## Outcome

Mazer PR #77 was merged and its exact merge commit was deployed to the existing Mazer Vercel production project. The existing Discord card `mazer-cross-viewport-ui-reliability` was then updated through the guarded exact-card journal writer and read back from Discord. The card remains in Review at `84%` pending physical-iPhone acceptance. No card was created, no full-board/config-wide sync ran, no completed-card transfer occurred, and no unrelated starter body was mutated.

## Release correlation

- Mazer PR: `#77` (`https://github.com/fawxzzy/mazer/pull/77`)
- Source commit: `b3da05dc452983a1b51a257ae128293d98a96ddb`
- Merge commit: `8ea4eed42024914397573af83a63d8ee79c5ced1`
- Vercel project: `fawxzzy-mazer`
- Deployment: `dpl_3PGem7fCME4mAkUdM4h98MQefet3`
- Production alias: `https://fawxzzy-mazer.vercel.app`
- Deployed bundle: `assets/main-D7gXztN9.js`
- DiscordOS branch: `codex/mazer-control-board-reconcile-20260716`

## Production proof

- Vercel inspect returned target `production`, status `Ready`, and the canonical production alias.
- The production alias returned HTTP `200` and referenced `assets/main-D7gXztN9.js`.
- The authenticated phone-sized capture harness passed at `390x844`, DPR `2`, against the production alias.
- Covered surfaces: Menu, Options, Options bottom, Play, Pause, and Pause bottom.
- Browser page errors: zero.
- Browser warning/error console messages: zero.
- Vercel runtime error query for the release deployment: no logs found.
- Production capture report: `tmp/captures/mazer-ui-surfaces/2026-07-16T13-16-36-409Z/report.md` (ATLAS-local evidence).
- Production capture summary: `tmp/captures/mazer-ui-surfaces/2026-07-16T13-16-36-409Z/summary.json` (ATLAS-local evidence).

The first broad capture completed every surface but failed only `wrap-topology-diagnostics` for deterministic seed `3749` (`graphTopologyValid=false`, `unpairedEndpoints=2/0`). That assertion is outside this UI/control release. The admitted rerun explicitly skipped the separate topology diagnostic and passed every UI/control capture check. This receipt preserves both results instead of relabeling the first run green.

## Exact live board identity

- Card ID: `mazer-cross-viewport-ui-reliability`
- Board: `mazer-active`
- Forum channel: `1524889569475170478`
- Thread/starter: `1525337748830031875`
- Event ID: `mazer-cross-viewport-prod-release-20260716`
- Journal message: `1527304970607526109`
- Canonical title: `cross-viewport UI reliability and layout hardening`
- Lifecycle body: `review`
- Progress: `84%`
- Remaining blocker: physical-iPhone post-release feel and containment verification

## Guarded board execution

1. Production environment readiness returned `status=ready` with zero blocking reason codes.
2. Exact-card dry run resolved one matching location by explicit thread ID, found zero collisions, reported `scanStatus=consistent`, and returned zero reason codes.
3. The admitted apply used both `--allow-apply --apply` and process-local `DISCORDOS_BOARD_CARD_JOURNAL=enabled`.
4. Apply returned `cardAction=updated`, `journalAction=created`, starter/journal/title readback `true`, starter/journal code-point exactness `true`, and zero reason codes.
5. Idempotent replay returned `journalAction=reused` with the same journal message ID `1527304970607526109`, the same exact readback checks, and zero reason codes.
6. Both live scans reported `currentIdentityCount=243`, one proposed identity, one exact matching location, and zero collisions.

## Durable artifacts

- Event: `docs/ops/discordos-mazer-cross-viewport-prod-release-event-2026-07-16.json`
- Dry run: `docs/ops/discordos-mazer-cross-viewport-prod-release-dry-run-2026-07-16.json`
- Live apply: `docs/ops/discordos-mazer-cross-viewport-prod-release-live-2026-07-16.json`
- Idempotent replay: `docs/ops/discordos-mazer-cross-viewport-prod-release-idempotent-2026-07-16.json`

The generated JSON receipts preserve the local execution registry path as local-only evidence; it is not a canonical machine-independent path contract.

## Verification

- `verify:discordos-mazer-feedback-board`: `8/8` passed.
- `verify:discordos-board-card-journal`: `28/28` passed.
- `verify:discordos-mazer-feedback-board-live-readback`: `14/14` passed.
- `node scripts/repo-hygiene.js verify`: passed under an extended `600s` caller window after `304.8s`.
- The first combined verification invocation hit its caller's `180s` timeout during the still-running hygiene scan and emitted `EPIPE`; it reported no repository finding. The isolated extended rerun above is the terminal hygiene result.
- `git diff --check`: passed before commit.

## Lifecycle disposition

- The existing card was updated rather than duplicated.
- The card remains in Review and was not moved to Completed.
- Completion requires the operator's physical-iPhone verification of Player Guide containment, one-tile wall fallback, dominant-lane T-junction steering, blocked-hold recovery, and sliding-arrow capture.
- Installed-PWA banding and native browser-chrome/maximize proof remain open on the coordinating card.

## Post-work review

- GitHub, Vercel, local production-capture evidence, the canonical card starter, and the stable journal now point to the same merge and deployment.
- The exact-card writer preserved unrelated Mazer board records and produced no duplicate journal on replay.
- The local config and live card intentionally preserve `84%`; automated release proof does not substitute for physical-device feel acceptance.
