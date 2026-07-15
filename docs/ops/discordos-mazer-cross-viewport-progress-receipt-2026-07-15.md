# DiscordOS Mazer Cross-Viewport Progress Receipt

Date: `2026-07-15`

## Product and GitHub truth

- Mazer branch: `codex/cross-viewport-reliability-completion`.
- Mazer commit: `768c3c633865adb8b6a1ceacab9af222378f7fcf`.
- Mazer draft PR: `#72` — `https://github.com/fawxzzy/mazer/pull/72`.
- Preview deployment: `dpl_5h1c8EkYAHuqUZ8Kx1aAgccoFjpo`, target
  `preview`, state `READY`.
- Preview URL: `https://fawxzzy-mazer-qonuksqh7-fawxzzy.vercel.app`.
- Full Mazer verification: `48/48` files and `360/360` tests passed,
  followed by a successful production bundle build.
- Maintained route-aware transition capture passed for menu, Options, play,
  and Pause at `360x720 -> 1440x900 -> 360x720 -> 405x958`.
- Deployed preview browser proof restored `390x844` board, HUD, and controller
  geometry exactly after a `1440x900` round trip with no console warnings or
  errors.
- No production deployment or promotion occurred.

## Exact board target

- Stable card ID: `mazer-cross-viewport-ui-reliability`.
- Source forum: `1524889569475170478`.
- Thread/starter: `1525337748830031875`.
- Event: `mazer-cross-viewport-ui-reliability-progress-20260715`.
- Live lifecycle after apply: `in_progress / 94%`.
- Live thread state: active and unlocked.
- Canonical updated timestamp: `2026-07-15T08:07:27.564Z`.
- Journal count after apply: `11`.
- New/latest journal: `1526864042843705395`.

## Guarded apply and replay

- Operator environment readiness: `ready`, no blocking reason codes.
- Live identity preflight: one matching source location, zero collision
  locations, admitted.
- Registry scan observed `222` identities. Its aggregate status was
  `drift_detected`, but it returned no scan blocking reason codes and the exact
  proposed identity was collision-free. No unrelated identity was mutated.
- First apply: starter `updated`, journal `created` as
  `1526864042843705395`.
- First readback: starter exact, journal exact, starter code points exact,
  journal code points exact, no reason codes.
- Idempotent replay: starter `updated`, journal `reused` as the same
  `1526864042843705395`; no duplicate journal was created.
- Replay readback: starter exact, journal exact, starter code points exact,
  journal code points exact, no reason codes.
- Final exact thread readback: one event journal, `11` total journals, one
  message page, not truncated, active/unlocked, `in_progress / 94%`, no reason
  codes.

Durable writer artifacts:

- `docs/ops/discordos-mazer-cross-viewport-progress-event-2026-07-15.json`
- `docs/ops/discordos-mazer-cross-viewport-progress-apply-2026-07-15.json`
- `docs/ops/discordos-mazer-cross-viewport-progress-replay-2026-07-15.json`

## Verification and writer boundaries

- Exact card journal/contract/consistency/live-readback tests pass.
- The focused exact-card suite passed `68/68` tests.
- The repository-wide verification command cannot run to completion from this
  isolated worktree because the newly merged canonical-board migration helper
  derives `C:\ATLAS\runtime` by walking three parents above its physical script
  path. From `C:\ATLAS\tmp\worktrees\...`, it therefore rejects the valid
  `C:\ATLAS\runtime\board-integrity\...` fixture at canonical-migration test
  `8/8`. A temporary junction under `C:\ATLAS\repos` did not change Node's
  physical `__dirname`, so the same path-only failure reproduced. No live
  migration or full-board sync was invoked by either verification attempt.
- The DiscordOS mainline 13-board migration currently leaves three legacy
  Mazer full-sync test expectations red on title normalization. That path is
  unrelated to this exact-card event and remains forbidden for Mazer work; it
  was neither repaired nor invoked here.
- No legacy/config-wide/full-board Mazer sync ran.
- No other Mazer starter body or journal changed.
- No duplicate thread or journal was created.

## Remaining terminal proof

The card intentionally remains `in_progress`. Physical iPhone Safari and
installed-PWA browser-chrome/safe-area proof against PR #72 is still required.
The preview must be exercised with browser chrome expanded and collapsed and in
installed display mode, capturing menu, active play, and Pause against the
Dynamic Island and home-indicator safe areas. Deterministic emulation is not
relabeled as physical evidence.
