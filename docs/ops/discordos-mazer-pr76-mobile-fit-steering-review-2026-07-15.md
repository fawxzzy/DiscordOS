# Mazer PR #76 mobile fit and Smart Steering review receipt

- Date: 2026-07-15
- Owner: Mazer
- Product branch: `codex/physical-ui-controls-rework-20260715`
- Product head: `8ca79d9a843213cecab4eb8bb6963ed2078db603`
- Product PR: `fawxzzy/mazer#76` (draft)
- Canonical-project preview: `dpl_HAcz3TXAnQUca929gqnzHQ87rH7Y` (Ready, preview)
- Preview URL: `https://fawxzzy-mazer-37nac17f6-fawxzzy.vercel.app`
- Production disposition: unchanged at prior approved head `4984d16c` / deployment `dpl_5MGsMbcgnSKFH5Kqz5M41w8okaMa`
- Receipt: `mazer-pr76-mobile-fit-steering-review-20260715`

## Product outcome

The five latest physical-iPhone findings are implemented on exact PR head `8ca79d9a`:

- shared status, action, toggle, guide, slider, and Pause labels use more of their available chrome while retaining measured padding;
- active-play Pause is exactly the same `62px` height as the compact shared run-status panel;
- the Pause scroll viewport begins directly below the title and progressively clips guide geometry while hiding only complete text rows;
- the Move Speed slider owns its active drag pointer so the overlay cannot scroll during adjustment;
- physical-stick Smart Steering preserves the held cardinal axis through normal analog noise, performs one bounded perpendicular tile shift at a wall, and resumes the original direction on vertical and horizontal one-tile corridor jogs.

## Verification

- focused Mazer UI/control packet: `85/85` tests passed;
- full Mazer verification: `364/364` tests passed;
- directional-intent architecture contract: `1/1` passed;
- TypeScript check and production Vite/PWA build: passed;
- deterministic iPhone-class matrix: `390x844` at `3x` DPR passed menu, Options top/bottom, play, Pause top/bottom, containment, overlap, scroll reachability, fade clearance, label fill, Pause/status height parity, wrap topology, and console/page-error gates;
- local visual report: `C:/ATLAS/tmp/captures/mazer-ui-surfaces/2026-07-15T23-14-52-388Z/report.md`;
- canonical preview readback: Ready and serving the same hashed app artifact as the locally captured build;
- Vercel team SSO remained enabled, so anonymous remote screenshot automation was correctly not represented as passing.

## Exact-card live reconciliation

Only the three existing active Mazer cards in `discordos-mazer-pr76-mobile-fit-steering-review-events-2026-07-15.json` were targeted. No legacy, config-wide, full-board, unrelated starter-body, new-card, or Completed-board mutation ran.

The terminal fluid-controls card was not reopened or duplicated. Its earlier completion history remains immutable; the changed physical evidence and exact fix are recorded on the existing active cross-viewport owner that already includes Smart Steering in its PR #76 context.

| Stable card | Thread | Journal | Lifecycle | Readback |
| --- | --- | --- | --- | --- |
| `mazer-cross-viewport-ui-reliability` | `1525337748830031875` | `1527096365799182356` | Review -> Review | starter/title/journal/code points exact |
| `mazer-browser-layout-persistence` | `1525337752290197514` | `1527096374967930981` | Review -> Review | starter/title/journal/code points exact |
| `mazer-shared-run-status-panel` | `1526644909241667644` | `1527096383717380286` | Review -> Review | starter/title/journal/code points exact |

### Guard and replay receipt

- Dry-run identity scan: `2026-07-15T23:30:45.269Z` to `2026-07-15T23:33:13.399Z`.
- Live identity scan: `2026-07-15T23:33:28.393Z` to `2026-07-15T23:35:44.323Z`.
- Replay identity scan: `2026-07-15T23:36:10.263Z` to `2026-07-15T23:38:21.697Z`.
- Current live identities inspected: `237`.
- Proposed identities: `3`.
- Exact declared-thread matches: `3/3`.
- Collision locations: `0`.
- Scan blocking reason codes: `0`.
- Apply reason codes: `0`.
- Replay result: all three `journalAction` values were `reused` with the same journal IDs.

The registry reported global `drift_detected` as a non-blocking scan status, while `scanBlockingReasonCodes`, per-card identity reason codes, and final writer reason codes were all empty. This packet did not reconcile, replay, or mutate any unrelated drifted record.

## Post-work review

- Product source, remote branch, PR head, and preview receipt correlate at `8ca79d9a`.
- The accidental isolated Vercel project created during the first unlinked preview attempt was deleted immediately; account readback shows only the canonical `fawxzzy-mazer` project.
- Production was not changed because this exact packet does not yet have current-thread production authorization.
- All three cards remain in Review. Physical-iPhone screenshots are still required; the shared run-status card also retains the canonical scorer dependency.
