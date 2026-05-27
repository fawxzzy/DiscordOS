# DiscordOS Ops

This directory is reserved for DiscordOS repo-local operational runbooks and receipts once approved implementation work begins.

At bootstrap:

- ATLAS root remains the durable home for the current separation receipt chain
- this directory is intentionally a placeholder only

Current repo-local preconditions:

- `feedback-lookup-first-mutation-checklist.md`
  - no-op and rollback checklist for the first future `FeedbackLookupPort` mutation lane
- `feedback-lookup-execution-readiness-recheck-2026-05-26.md`
  - confirms the preconditions are landed and advances the repo-local queue to the first narrow lookup mutation lane

Pre-handoff live-state check:

- verify live `HEAD`
- read the latest local receipt
- confirm repo status is clean
- confirm the proposed next package is not already landed
