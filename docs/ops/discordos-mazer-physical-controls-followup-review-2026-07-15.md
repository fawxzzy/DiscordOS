# Mazer physical controls and phone layout follow-up review

Date: `2026-07-15` EDT / `2026-07-16` UTC

## Outcome

Fresh operator physical-iPhone findings were implemented on existing Mazer draft PR #76 and reconciled to the three existing non-terminal Mazer board cards that own cross-viewport UI, browser layout, and shared run status. The exact-card writer updated only those three live threads, appended one stable journal per thread, read back each starter/title/journal exactly, and reused the same journals on replay. No legacy, config-wide, or full-board Mazer sync ran.

## Requested edits and disposition

- `landed` - one thumb can remain down and slide continuously between D-pad directions; the center gap pauses movement without losing pointer ownership.
- `landed` - the joystick sits lower, its knob travels through a larger visible radius, its deadzone is smaller, retargeting is faster, and direction hysteresis is stronger.
- `landed` - moderate diagonal stick noise remains cardinal while intentional near-diagonal pulls still resolve diagonally.
- `landed` - player and AI timers freeze at exact end-tile arrival and completion telemetry consumes that same frozen duration.
- `landed` - the phone maze border keeps a stable edge-tight 8px outer margin while inner tiles scale by active maze dimension.
- `landed` - the existing menu, Options, play, and Pause containment work remained green through the new control and layout changes.
- `deferred` - production release and fresh physical-iPhone acceptance of this newest packet require the draft head to be merged and a new explicit Mazer production deployment request.

## Mazer source and GitHub truth

- Repository branch: `codex/physical-ui-controls-rework-20260715`.
- Head: `5765c2725221d734d6eca43a2c698dd200968072`.
- Existing draft PR: https://github.com/fawxzzy/mazer/pull/76.
- The PR body records the latest implementation and proof packet.
- The protected `tests/ai/demo-walker.test.ts` file is unchanged.
- This packet is pushed but is not merged or deployed to production.

## Product verification

- Lint passed.
- TypeScript/Vite/PWA production build passed.
- Focused control/layout packet: `7 files / 130 tests` passed.
- Timer/QA packet: `4 files / 82 tests` passed.
- Full-suite concurrency run produced no assertion failures; five tests timed out only while contending with the concurrent production build, then the affected files passed serially: `4 files / 66 tests`.
- Exact iPhone-class surface proof at `390x844`, DPR `3`: `39/39` checks passed, zero console messages, zero page errors.
- Arrow live route: goal reached, `139/139` planned moves executed, estimated `60 FPS`, timer frozen at `12,818ms` on resample.
- Stick live route: goal reached, `82/82` planned moves executed, estimated `60 FPS`, timer frozen at `21,376ms` on resample.
- Surface receipt: `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-16T01-13-03-820Z\report.md`.
- Arrow receipt: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-16T01-12-11-424Z\controls-rework-arrows-timer-final-20260715.summary.json`.
- Stick receipt: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-16T01-12-11-423Z\controls-rework-stick-timer-final-20260715.summary.json`.

## Exact live board receipt

- DiscordOS environment readiness: `ready`; no blocking reason codes.
- Writer: double-guarded `atlas.board-card-journal.v1` exact-card path.
- Identity preflight: `admitted`; `237` current stable identities inspected, exactly `3` proposed target identities, zero target collisions, no blocking reason codes.
- `mazer-cross-viewport-ui-reliability`
  - thread/starter: `1525337748830031875`
  - event: `mazer-cross-viewport-physical-controls-review-20260715`
  - journal: `1527124236421042308`
  - exact readback: starter, title, journal, starter code points, and journal code points all `true`
- `mazer-browser-layout-persistence`
  - thread/starter: `1525337752290197514`
  - event: `mazer-browser-layout-maze-frame-review-20260715`
  - journal: `1527124245283606592`
  - exact readback: starter, title, journal, starter code points, and journal code points all `true`
- `mazer-shared-run-status-panel`
  - thread/starter: `1526644909241667644`
  - event: `mazer-shared-status-goal-timer-review-20260715`
  - journal: `1527124254343041147`
  - exact readback: starter, title, journal, starter code points, and journal code points all `true`
- First apply created exactly the three journals above.
- Idempotent replay reused all three exact journal IDs and created no duplicate.
- Final reason codes: none.

## Board verification

- Mazer board config tests: `8/8` passed.
- Exact card-journal tests: `28/28` passed.
- Mazer live-readback tests: `14/14` passed.
- `git diff --check`: passed.
- The repo-wide verify command was run and stops in the Atlas card/board consumer because that consumer resolves its sibling `packages/atlas-contracts` dependency from the canonical repository depth and cannot find it from this isolated worktree path. The exact Mazer board tests above are green.
- The canonical-board migration suite remains outside this packet and is not green on current `origin/main`: the canonical checkout reports a pre-existing stale Socials preimage digest, while isolated-worktree execution also hits the migration tool's canonical-path assertion. No consumer, migration, Atlas-contract, or Socials file was changed by this packet.

## Card lifecycle

- `mazer-cross-viewport-ui-reliability`: remains `Review / 98%` until the exact PR #76 release passes fresh physical-device acceptance.
- `mazer-browser-layout-persistence`: remains open at `90%`; PR #76 device proof and native maximize/restore/browser-chrome automation remain open.
- `mazer-shared-run-status-panel`: remains `Review / 94%`; PR #76 device timer proof and canonical score-field traceability remain open.
- No completed card was reopened or rewritten. The historically completed fluid-controls card remains terminal; this packet records a new physical-device refinement under the active cross-viewport lane.

## Safety and post-work review

- No production deployment occurred.
- No full-board sync or config-wide board reconciliation ran.
- No unrelated starter, journal, card, title, tag, or lifecycle state was targeted.
- No duplicate card, thread, or journal was created.
- No Chrome-extension browser lease was held; product proof used isolated Playwright/local browser tooling.
- The preserved DiscordOS canonical checkout and unrelated worktrees were not reset, rebased, or overwritten.

## Git disposition

- DiscordOS branch: `codex/mazer-ui-controls-review-20260715`.
- Existing draft DiscordOS PR: https://github.com/fawxzzy/DiscordOS/pull/95.
- This follow-up continues that exact board-history branch and does not create a duplicate PR.

## Operator decisions

None are required to review this packet. A later production deployment requires a new explicit request after PR #76 is merged; that release approval is intentionally not inferred from earlier deployments.
