# Mazer PR #76 visible-text correction receipt

- Date: 2026-07-15
- Owner: Mazer
- Outcome: corrected preview and exact-card Review reconciliation passed
- Product branch: `codex/physical-ui-controls-rework-20260715`
- Product head: `c7b1540ea482a17d1e50dd4343223ce6b243aa77`
- Product PR: `fawxzzy/mazer#76` (draft)
- Preview deployment: `dpl_FGKmMPHb64mGqdGykzQAmZ6YspNX`
- Production deployment: not performed for this correction

## Operator finding and correction

The operator's production iPhone screenshots correctly rejected the earlier visual claim. The play status value touched the right rail, action labels were oversized for their chrome, and partial guide or row text was still painted beneath scroll fades. Logical Phaser bounds had been treated as stronger evidence than the physical glyphs justified.

Commit `c7b1540e` adds conservative physical insets to the shared run-status, guide, toggle, and action-label contracts. It also reserves fade-safe scroll render bands so partially visible guide cards or rows are not painted beneath an active fade.

## Product evidence

- Focused visible-text verification: 62/62 tests passed.
- Full Mazer verification: 49 files, 363/363 tests, and production build passed.
- Exact deployed 393x852 preview capture passed status containment, action-label containment, guide containment, scroll-fade clearance, overlap, console, and page-error checks.
- The Mazer branch and PR head both resolve to `c7b1540e`; the worktree is clean.
- Physical iPhone review remains required. These cards remain in Review and were not marked Completed.

## Exact-card board reconciliation

Only the guarded stable-card journal writer was used. No legacy, config-wide, or full-board sync ran.

| Stable card | Thread | Lifecycle | Progress | Journal message |
| --- | --- | --- | ---: | --- |
| `mazer-cross-viewport-ui-reliability` | `1525337748830031875` | Review -> Review | 90% | `1527037072936796340` |
| `mazer-browser-layout-persistence` | `1525337752290197514` | Review -> Review | 89% | `1527037119258820752` |
| `mazer-shared-run-status-panel` | `1526644909241667644` | Review -> Review | 30% | `1527037132093526036` |

All three exact starters, journals, canonical titles, and starter/journal code points passed live readback with empty reason-code arrays and zero identity collisions.

The identical guarded replay returned `journalAction: reused` for all three message IDs, proving idempotency without duplicate journals.

## Post-work review

- The prior proof failed because it measured logical bounds too optimistically and because the corrected candidate had not reached production.
- The visual gate now checks real panel insets and fade-safe text regions, and exact deployed screenshots were inspected before this receipt was written.
- Production remains unchanged until explicit approval for this corrected commit and deploy.
