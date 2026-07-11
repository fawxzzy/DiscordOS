# Mazer AI Run Corpus Quality and Calibration Plan

## Imported Read-Only Audit Snapshot

The July 11, 2026 audit reported 1,341 completed AI cycles, 1,139 durable remote receipts, 1,122 menu-demo receipts, 17 human-play receipts, and 984 distinct maze seeds for the Fawxzzy account. It identified 916 behavior-ready AI receipts, 540 route-calibration-ready receipts, 46 zero-frame-metric receipts, no exact duplicates, and a 202-cycle gap between progression count and durable receipt coverage.

The audit is evidence for offline calibration only. It must not cause a production formula update, account progression reset, receipt deletion, synthetic receipt backfill, or automatic live tuning.

## Governing Decisions

- Raw telemetry is immutable evidence. Derive quality classifications instead of rewriting history.
- One versioned scorer must serve runtime, reporting, calibration, and dashboard consumers.
- The movement graph owns shortest path. A route benchmark must use the same legal movement edges, including wraps.
- Quality is purpose-specific. A receipt can be valid for behavior analysis while excluded from route-efficiency or performance analysis.
- Run origin, schema, build, algorithm, generator, and benchmark cohorts must be explicit before longitudinal comparisons drive decisions.

## Delivery Waves

1. Build a redacted, export-driven audit command that emits `mazer.ai-run-corpus-audit.v1` and per-purpose quality reason codes.
2. Correct wrapped shortest-path and scorer-parity contracts before any progression threshold changes.
3. Add future-only receipt versioning, idempotent client identities, sequence/coverage metadata, and an explicit bounded durability contract.
4. Generate stable representative, stress, long-tail, single-route, and wrap-shortcut anomaly seed packs.
5. Replay candidate progression formulas offline with time-ordered training and holdout cohorts; do not write live progression.
6. Document retention, export, progression reset, and explicit history deletion as separate user-data controls.

## Current Limits

Human-play data is sufficient for pipeline smoke testing but not player-balance tuning. Wrapped route-overrun metrics are not calibration-safe until graph parity lands. Historical rows without explicit versions must remain segmented as legacy cohorts. No Supabase mutation is authorized by this plan.
