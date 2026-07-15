# Mazer UI and controls review reconciliation — 2026-07-15

## Scope

This packet reconciles the operator's seven physical-iPhone findings and the one-tile smart-steering request with current Mazer GitHub truth and exact Discord board-card journals. It updates only the two active board records that can legally enter Review. It does not run a legacy, config-wide, or full-board sync, and it does not rewrite unrelated starter bodies.

## Mazer source truth

- UI/UX packet: draft PR #72, branch `codex/cross-viewport-reliability-completion`, commit `593e871c64e6d18c551efee7d2e248662e1a1436`.
- UI proof: focused 57/57; correlated repository 362/362; lint, build, and diff checks passed.
- UI preview: deployment `dpl_7zx3HAry5zipJXBwyL6KpSP6RXCS`, READY at `https://fawxzzy-mazer-6qs7k26v9-fawxzzy.vercel.app`.
- Deployed 390x844 proof: matching 236x58 menu/play status panels with `textFits: true`; Options guide and rows contained with inactive rail diagnostics `track: null` and `thumb: null`; Pause reached `maxOffset: 244` with Move Speed and pinned actions reachable; page and app fallback backgrounds were `rgb(2, 8, 15)`.
- Controls packet: draft PR #74, branch `codex/one-tile-wall-sidestep`, commit `85c72b1d85e802b60e829276389fced6fdbe46f0`.
- Controls proof: all-direction pure behavior passed 20/20; correlated repository 360/360; lint, build, and diff checks passed.
- Live stick proof at 405x958: a blocked held Up from `(3,14)` shifted exactly one tile to `(4,14)`, preserved the Up intent, continued to `(4,13)` on the next cadence without release, kept the assistance count at one, and cleared state on release.
- The protected user-owned Mazer test `tests/ai/demo-walker.test.ts` remained untouched.

## Exact live Discord receipts

The double-guarded exact-card journal writer was used with stable card and thread identity.

- `mazer-cross-viewport-ui-reliability`
  - thread: `1525337748830031875`
  - Review journal: `1526963206537609227`
  - idempotent replay: reused the same journal
  - readback: starter exact, journal exact, both code-point exact, title exact, no reason codes
- `mazer-shared-run-status-panel`
  - thread: `1526644909241667644`
  - implementation journal: `1526963214833684551`
  - Review journal: `1526964450760855672`
  - idempotent replay: reused Review journal `1526964450760855672`
  - readback: starter exact, journal exact, both code-point exact, title exact, no reason codes

No full-board sync occurred. No unrelated starter body was mutated.

## Deferred completed-card reopen intents

Changed operator evidence also affects three Completed records, but DiscordOS currently forbids `completed -> review`; the supported lifecycle only permits `completed -> archived`. No duplicate or misleading same-state journal was created.

- `mazer-fluid-controls-and-motion`: source thread `1524889582590496798`; completed thread `1526735009010946068`; intended evidence is PR #74 and the live held-stick one-tile resume proof.
- `mazer-ui-component-layout-standards`: source thread `1526644886697414707`; completed thread `1526684991730356235`; intended evidence is PR #72 and the physical-iPhone normalization packet.
- `mazer-player-facing-options-guide`: source thread `1524889574092963902`; completed thread `1526844308131545242`; intended evidence is PR #72 Options/Pause guide and scroll normalization.

These are preserved as exact reopen intents pending a governed changed-evidence reopen transition. They are not terminal blockers for Mazer source work.

## Vercel disposition

The canonical `fawxzzy-mazer` production deployment and alias were not changed. The UI packet used the named READY preview above.

During controls proof, an unlinked isolated worktree caused Vercel CLI to create a separate project named `mazer-fluid-zigzag-intent-resolver` and deployment `dpl_DBjfTqLeeZ96FDkSKQre3ma3mZhs`. Vercel labeled that isolated project's first deployment as production, but it did not promote, alias, or mutate canonical Mazer production. Further deployment mutation stopped and generated local linkage files were removed. After explicit operator direction, the isolated project and its deployments were deleted at `2026-07-15T15:02:50.688Z`; exact readback now reports no project for that name. Canonical project `fawxzzy-mazer` remains present as `prj_t3zothbtj9DExrh3FjMsH98hwwSZ`.

## Disposition

- Both active cards remain non-terminal in Review.
- PR #72 remains draft pending fresh physical iPhone Safari and installed-PWA proof plus shared-panel score traceability.
- PR #74 remains draft pending operator review.
- Canonical Mazer production remains unchanged.

## Verification

- Exact-card local read models passed for both active card IDs with no reason codes.
- Focused board contract, journal, consistency, and Mazer feedback-board tests passed 63/63.
- JSON parsing and `git diff --check` passed.
- The repository-wide verifier is not portable from this nested isolated worktree: its newly merged Atlas consumer resolves `packages/atlas-contracts` relative to a shallower checkout and fails with `atlas_contracts_package_unavailable`. A temporary dependency-path attempt was removed without retained root changes. The focused suites covering this packet remain green.
