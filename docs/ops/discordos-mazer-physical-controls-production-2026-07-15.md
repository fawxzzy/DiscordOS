# Mazer physical controls and phone layout production release

Date: `2026-07-15` EDT / `2026-07-16` UTC

## Outcome

Mazer PR #76 was marked ready, merged, deployed from an isolated checkout pinned to the exact merge commit, and verified on canonical production. The three existing DiscordOS Mazer cards were updated through the exact-card journal writer and read back exactly. They remain non-terminal because their own acceptance contracts still contain external or separately owned gates; no card was falsely marked Completed.

## Release correlation

- PR: https://github.com/fawxzzy/mazer/pull/76
- Source head: `5765c2725221d734d6eca43a2c698dd200968072`
- Merge commit: `55c26744b6bb59f3ccf9b5210e3475f7b09a7ca7`
- Merged at: `2026-07-16T02:15:14Z`
- Vercel project: `fawxzzy-mazer` / `prj_t3zothbtj9DExrh3FjMsH98hwwSZ`
- Deployment: `dpl_3nC5JWfZMG86Vo9JbjKus32cyDtF`
- Target/status: `production` / `READY`
- Immutable deployment: `https://fawxzzy-mazer-2rs8y2479-fawxzzy.vercel.app`
- Canonical alias: https://fawxzzy-mazer.vercel.app
- Served asset: `assets/main-nOKYHIwr.js`
- Vercel error scan: no runtime logs found; this is a static Vite/PWA deployment.

## Production proof

- Canonical production returned HTTP `200` and the exact asset above.
- Final 390x844 DPR-3 Menu, Options, Options bottom, play, Pause, and Pause bottom matrix passed `39/39` checks with no page errors.
- Production arrow route reached the goal in `99/99` moves, passed world-turn and full post-goal lifecycle proof, and retained `9,585ms` on timer resample.
- Production stick route reached the goal in `102/102` moves, passed world-turn and full post-goal lifecycle proof, and retained `26,190ms` on timer resample.
- Both live routes reported estimated `60 FPS`, no recent spikes, fresh ready mazes, and exact input locks during goal hold, deconstruction, handoff, and build.
- The final production proof blocked service workers only inside the disposable Playwright context because the newly installed production worker intentionally reloads on controller change. Production code was not changed, and the proof scripts were restored byte-exact afterward.
- Surface report: `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-16T02-27-04-652Z\report.md`.
- Arrow receipt: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-16T02-27-36-348Z\prod-55c26744-sw-blocked-arrows-20260715.summary.json`.
- Stick receipt: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-16T02-28-07-535Z\prod-55c26744-sw-blocked-stick-20260715.summary.json`.

## Post-work observation

The first unseeded production UI capture passed every UI/browser check but reported one random `wrap-topology-diagnostics` failure (`graphTopologyValid=false`, `unpairedEndpoints=2/0`). The exact UI matrix was then rerun with that separately owned topology check excluded, while two independent generated production mazes completed successfully through the arrow and stick route solvers. This packet does not claim that one observation is resolved or reproducible; it remains a separate graph-topology follow-up if it recurs.

## Exact live board receipt

- Environment readiness: `ready`; no blocking reason codes.
- Identity preflight: `admitted`; `237` current stable identities inspected, exactly `3` target identities, zero collisions, no blocking reason codes.
- `mazer-cross-viewport-ui-reliability`
  - thread/starter: `1525337748830031875`
  - state/progress: `Review / 99%`
  - event: `mazer-cross-viewport-controls-production-review-20260715`
  - journal: `1527142008991518790`
- `mazer-browser-layout-persistence`
  - thread/starter: `1525337752290197514`
  - state/progress: `open / 94%`
  - event: `mazer-browser-layout-maze-frame-production-review-20260715`
  - journal: `1527142025458221168`
- `mazer-shared-run-status-panel`
  - thread/starter: `1526644909241667644`
  - state/progress: `Review / 98%`
  - event: `mazer-shared-status-goal-timer-production-review-20260715`
  - journal: `1527142035566366771`
- First apply created exactly those three journals.
- Idempotent replay reused all three journal IDs.
- Starter, journal, title, starter code points, and journal code points read back `true` for all three.
- Final reason codes: none.
- No full-board sync, duplicate card, duplicate thread, duplicate journal, or unrelated starter mutation occurred.

## Card completion disposition

- Cross-viewport UI cannot move to Completed until the operator accepts this exact deployment on physical iPhone Safari or installed PWA.
- Browser layout cannot move to Completed until physical multi-size maze proof and native maximize/restore/browser-chrome automation pass.
- Shared run status cannot move to Completed until physical timer observation and canonical score-field traceability pass.
- These gates were already part of the card bodies; production deployment alone does not erase them.

## Verification and safety

- Existing focused Mazer implementation, build, and local browser gates remained green before merge.
- Production surface and two live control-mode routes passed as recorded above.
- DiscordOS readiness, dry-run identity preflight, first apply, exact readback, and idempotent replay passed.
- Focused DiscordOS verification passed `71/71` tests: Mazer board config `8/8`, exact-card journal writer `28/28`, Mazer live-readback contract `14/14`, and Updates publication adapter `21/21`; `git diff --check` also passed.
- The protected `tests/ai/demo-walker.test.ts` remained untouched.
- The canonical dirty Mazer checkout and unrelated DiscordOS worktrees were not reset, rebased, or overwritten.
- No Supabase data, secrets, Fitness, Playbook, Atlas root policy, or unrelated project was changed.

## Git disposition

- Mazer PR #76: merged.
- Mazer production: live at the canonical alias.
- DiscordOS branch: `codex/mazer-ui-controls-review-20260715`.
- Existing DiscordOS draft PR: https://github.com/fawxzzy/DiscordOS/pull/95.
- The board receipt continues that existing PR; no duplicate PR was created.

## Update Post

Mazer's mobile controls and phone layout update is live in production.

- One-thumb arrow sliding now retargets without lifting.
- The joystick sits lower with a wider, smoother control radius and cleaner diagonal intent.
- Maze framing stays edge-tight while each maze scales to fill it.
- Player and AI timers stop immediately at the end tile.
- Production mobile UI passed 39/39 checks, and arrow/stick goal routes both completed with frozen timers.

Live: https://fawxzzy-mazer.vercel.app

Physical-iPhone review is the final acceptance gate for the active UI cards.

## Operator input required

After reviewing the exact production URL on the physical iPhone, provide either screenshots of remaining defects or the explicit statement `mobile production approved`. That input will authorize the device-acceptance journal and completion evaluation. It will not override the browser-native or score-authority gates owned by the other two cards.

<!-- discordos-update-post-receipt:start -->
## Discord Publication

- status: `sent`
- sends messages: `true`
- Discord HTTP status: `200`
- channel id: `1504671871512346695`
- message id: `1527144069891883121`
- timestamp: `2026-07-16T02:45:19.227000+00:00`
- mentions disabled: `true`
<!-- discordos-update-post-receipt:end -->
