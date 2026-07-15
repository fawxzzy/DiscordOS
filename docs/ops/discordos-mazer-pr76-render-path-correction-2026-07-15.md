# Mazer PR #76 render-path correction receipt

- Date: 2026-07-15
- Owner: Mazer
- Outcome: product correction and exact preview proof passed; exact-card Discord event intent preserved after dry-run readback hung
- Product branch: `codex/physical-ui-controls-rework-20260715`
- Product head: `4984d16cceaaaa5ec59604a129c4ac010f3263f6`
- Product PR: `fawxzzy/mazer#76` (draft)
- Preview deployment: `dpl_CV7pHtLRhdH5e626cgGb4eCDTrGx`
- Production deployment: not performed for this correction

## Operator finding and root cause

The operator correctly rejected the prior `c7b1540e` evidence. Phaser display-object bounds stayed inside the layout rails, but the 2x CanvasRenderer backing transform and an independent Phaser text-texture resolution multiplier both enlarged the painted glyphs. The logical checks therefore passed while real letters visibly crossed borders.

Commit `4984d16c` makes the game canvas the sole backing-resolution owner and keeps text textures at the resolution-1 baseline. The capture contract now records `textTransformOwner: game-canvas-only` and rejects any surface whose `textTextureResolution` is not 1.

## Product evidence

- Focused render, scene, and capture verification: 58/58 tests plus typecheck passed.
- Full Mazer verification: 49 files, 363/363 tests, and production Vite/PWA build passed.
- Local 393x852, device-scale-factor-2 proof: all six menu, Options, play, Pause, and scroll-endpoint images passed and were manually inspected.
- Exact remote preview proof at `4984d16c`: menu, Options top and bottom, play, Pause top and bottom were manually inspected at 393x852; visible text stayed inside status rails, guide frames, toggle rows, slider, action buttons, and scroll fades.
- Exact remote preview console readback: zero warnings and zero errors.
- Protected `tests/ai/demo-walker.test.ts` is unchanged.
- The Mazer worktree is clean and PR #76 resolves to exact head `4984d16c`.

## Exact-card board intent

Only these existing Review cards are targeted:

| Stable card | Thread | Intended lifecycle |
| --- | --- | --- |
| `mazer-cross-viewport-ui-reliability` | `1525337748830031875` | Review -> Review |
| `mazer-browser-layout-persistence` | `1525337752290197514` | Review -> Review |
| `mazer-shared-run-status-panel` | `1526644909241667644` | Review -> Review |

No legacy, config-wide, or full-board sync ran. The guarded exact-card dry run entered its live registry readback, remained hung for more than ten minutes, produced no output receipt, and performed no apply mutation. Its owned process tree was terminated. The durable event intent is preserved in `discordos-mazer-pr76-render-path-correction-events-2026-07-15.json` for a later exact-card retry when Discord readback is responsive.

## DiscordOS verification

- Board journal tests: 28/28 passed.
- Board card contract tests: 11/11 passed.
- Board card consistency tests: 16/16 passed.
- Total focused tests: 55/55 passed.

## Post-work review

- The failure was in the proof model as well as the render path; both are corrected in the product commit.
- The visibly broken resolution-2 experiment was rejected and never committed.
- Physical iPhone confirmation remains required, so the three cards remain in Review and are not Completed.
- Production remains unchanged. A new production promotion requires explicit approval for this exact corrected commit.
