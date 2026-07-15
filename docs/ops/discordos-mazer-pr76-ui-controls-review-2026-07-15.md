# Mazer PR #76 UI and controls review receipt

- Date: 2026-07-15
- Owner: Mazer
- Outcome: exact-card review reconciliation passed
- Product branch: `codex/physical-ui-controls-rework-20260715`
- Product head: `34524bd9`
- Product PR: `fawxzzy/mazer#76` (draft)
- Preview deployment: `dpl_GRbdcJ4KYMAvesH5VSRegBWsPvXS`
- Production deployment: not performed

## Product evidence

- Focused Smart Steering, settings, UI, and scene verification: 96/96 passed.
- Full Mazer verification: 363/363 tests and the production build passed.
- The exact deployed 393x852 preview passed menu, Options, play, Pause, scroll, text-containment, overlap, button-fit, console, and page-error checks.
- Physical iPhone review remains required before the product packet can leave Review.

## Board reconciliation

Only the governed exact-card journal writer was used. No legacy, config-wide, or full-board sync ran.

| Stable card | Thread | Lifecycle | Progress | Journal message |
| --- | --- | --- | ---: | --- |
| `mazer-cross-viewport-ui-reliability` | `1525337748830031875` | Review -> Review | 88% | `1527024557498695721` |
| `mazer-browser-layout-persistence` | `1525337752290197514` | Opened -> In Progress | 84% | `1527024567116365948` |
| `mazer-browser-layout-persistence` | `1525337752290197514` | In Progress -> Review | 86% | `1527025328365637783` |
| `mazer-shared-run-status-panel` | `1526644909241667644` | Review -> Review | 25% | `1527024577161728202` |

Every apply read back the expected starter, journal, canonical title, and exact starter/journal code points. All result reason-code arrays were empty.

The identical two-step replay passed with `journalAction: reused` for all four events, proving that a retry did not create duplicate journals.

## Post-work review

- The prior release made small fitting changes without making Smart Steering a separate setting or a complete one-tile assist. PR #76 corrects both gaps.
- The completed historic controls card was not reopened. Current physical-control acceptance remains represented on the existing cross-viewport Review card.
- Browser chrome and maximize/restore proof remain open; deterministic phone-shaped browser proof does not substitute for operator physical-device review.
- No unrelated Mazer card or Discord forum thread was mutated.
