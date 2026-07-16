# Mazer physical-iPhone text containment reconciliation - 2026-07-15

## Scope

This exact-card packet records the operator's seven fresh physical-iPhone production screenshots and the corrective Mazer PR #75. It updates only `mazer-cross-viewport-ui-reliability`, `mazer-browser-layout-persistence`, and `mazer-shared-run-status-panel`. It does not run a legacy, config-wide, or full-board sync.

## Finding and correction

- The production status panel's second row crossed the right border in menu and play.
- Options and Pause guide copy crossed the right edge.
- Toggle descriptions collided with row borders.
- Partially scrolled guide content redrew clipped rounded edges that resembled empty nested cards.
- Root cause: ideal canvas fitting did not reserve enough physical-device width and line height for the iPhone's native glyph rendering.
- PR #75 adds shared physical-width reserves, compact padding, taller described rows, and clipped-edge scroll rendering without screenshot-specific offsets or persisted geometry.

## Mazer source and proof

- Draft PR: `https://github.com/fawxzzy/mazer/pull/75`
- Branch: `codex/physical-iphone-text-containment`
- Commit: `ee20811b2d65dbdc6f36ba8f0b1684224db06972`
- Repository proof: 49 files / 363 tests, lint, build, and diff checks passed.
- Local phone proof: 390x844 at DPR3; all text-fit, overlap, offscreen, guide-containment, button-containment, scroll-reachability, console, and page-error gates passed.
- Hosted preview: `https://fawxzzy-mazer-bsygbvwk7-fawxzzy.vercel.app`
- Preview deployment: `dpl_DszBuTLSr4TaU1QxFMqFJ2t8y1Nm`, READY.
- Hosted phone proof: menu badge 252x60, play badge 248x60, both `textFits: true`; Options guide and controls contained; no offscreen, overlap, console, or page errors.
- Canonical production remains unchanged pending explicit approval of this corrected build.

## Card disposition

- `mazer-cross-viewport-ui-reliability`: remains Review at 96%; fresh physical-iPhone acceptance is the terminal gate.
- `mazer-browser-layout-persistence`: remains open at 88%; physical-device acceptance and native maximize/restore automation remain open.
- `mazer-shared-run-status-panel`: remains Review at 90%; physical-device acceptance and canonical score-field traceability remain open.

## Live board receipt

- Readiness: ready; required update and bot-token checks passed with no reason codes.
- Identity preflight: consistent; 237 current identities, exactly 3 proposed identities, zero collisions, and no reason codes.
- `mazer-cross-viewport-ui-reliability`
  - thread: `1525337748830031875`
  - journal: `1526999559828668536`
  - readback: starter, journal, starter code points, journal code points, and title exact
- `mazer-browser-layout-persistence`
  - thread: `1525337752290197514`
  - journal: `1526999569270046730`
  - readback: starter, journal, starter code points, journal code points, and title exact
- `mazer-shared-run-status-panel`
  - thread: `1526644909241667644`
  - journal: `1526999578782732390`
  - readback: starter, journal, starter code points, journal code points, and title exact
- Idempotent replay reused all three journal IDs; no duplicate journals were created.
- Final reason codes: none.

## Safety

- No full-board sync was run.
- No unrelated starter body was targeted.
- No production deployment was performed for PR #75.

## Verification

- Focused card contract, consistency, journal, Mazer read-model, and live-readback suites passed 77/77.
- The broader sweep passed 86/89. Its three legacy full-sync fixture failures expect the removed `mazer:` title prefix while the current canonical formatter and live boards correctly use plain outcome titles; this Mazer board packet does not modify shared DiscordOS writer code or those stale fixtures.
- Event JSON parsing and `git diff --check` passed.
