# Mazer physical-iPhone text containment production receipt - 2026-07-15

## Scope

This exact-card packet records the approved Mazer PR #75 production release and production browser proof. It updates only `mazer-cross-viewport-ui-reliability`, `mazer-browser-layout-persistence`, and `mazer-shared-run-status-panel`. It does not run a legacy, config-wide, or full-board sync.

## Production release

- PR: `https://github.com/fawxzzy/mazer/pull/75`
- Reviewed head: `ee20811b2d65dbdc6f36ba8f0b1684224db06972`
- Merge commit: `659d2907c20d8a5a6e39fffc51dd7646814ff1fa`
- Merged: `2026-07-15T17:26:58Z`
- Deployment: `dpl_AZ9NUecXPHhn7PiWnXWjh9YoJm7u`
- Target/status: `production` / `READY`
- Canonical alias: `https://fawxzzy-mazer.vercel.app`
- Immutable deployment: `https://fawxzzy-mazer-b9f0x8ymm-fawxzzy.vercel.app`
- Served asset: `main-c9yQG3lZ.js`
- Canonical `origin/main` readback matched the merge commit exactly.

## Production browser proof

The Codex in-app browser was used at an explicit 390x844 viewport. The browser session was released after proof and no ChatGPT Chrome-extension lease was held.

- Menu: centered 252x60 shared status panel; 149x32 text bounds; `textFits: true`.
- Options: 350x784 panel and 298x220 guide; eight guide rows; no guide, panel, or button failures; truthful inactive scroll rail.
- Play: 248x60 status panel beside Pause; 138x32 text bounds; `textFits: true`; touch controls visible.
- Pause top: 350x770 panel and 298x220 guide; eight guide rows; no containment failures; active scroll rail.
- Pause bottom: scroll offset reached max offset 274; all lower controls and pinned actions were reachable; no panel or button failures.
- Runtime: zero captured console/page errors across the proof.
- Observability: deployment inspection reported READY and the canonical alias resolved to the same deployment. The static Vite site produced no Vercel runtime error-log entries during the release window.

## Card disposition

- `mazer-cross-viewport-ui-reliability`: remains Review at 98%; fresh operator physical-iPhone production screenshots are the final acceptance gate.
- `mazer-browser-layout-persistence`: remains open at 90%; physical-iPhone acceptance plus native maximize/restore/browser-chrome automation remain open.
- `mazer-shared-run-status-panel`: remains Review at 94%; physical-iPhone acceptance and canonical score-field traceability remain open.

## Exact live board receipt

- Readiness: ready; all required update and bot-token checks passed; no blocking reason codes.
- Identity preflight: consistent; 237 current identities, exactly 3 proposed identities, zero collisions, no reason codes.
- `mazer-cross-viewport-ui-reliability`
  - thread: `1525337748830031875`
  - production journal: `1527007682760937664`
  - readback: starter, journal, starter code points, journal code points, and title exact
- `mazer-browser-layout-persistence`
  - thread: `1525337752290197514`
  - production journal: `1527007691850125524`
  - readback: starter, journal, starter code points, journal code points, and title exact
- `mazer-shared-run-status-panel`
  - thread: `1526644909241667644`
  - production journal: `1527007700540457093`
  - readback: starter, journal, starter code points, journal code points, and title exact
- Idempotent replay reused all three production journal IDs; no duplicate journal was created.
- Final reason codes: none.

## Safety and review

- No legacy, config-wide, or full-board sync was run.
- No unrelated starter body was targeted.
- No card was marked Completed without the required physical-iPhone acceptance evidence.
- The production release used the already-reviewed source head and exact merge commit.
- The remaining device gate is explicit and actionable: the operator should capture fresh Menu, Options, Play, and Pause screenshots from canonical production.
