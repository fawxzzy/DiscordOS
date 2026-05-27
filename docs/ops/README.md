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
- `feedback-lookup-support-surface-pause-checkpoint-2026-05-26.md`
  - confirms the local lookup-only support surface is coherent and pauses further lookup-only shaping pending an explicit provider-adjacent boundary decision
- `feedback-lookup-provider-adjacent-boundary-checkpoint-2026-05-26.md`
  - decides whether a provider-adjacent lookup lane should open at all and narrows the next safe artifact to a transport-neutral provider stub boundary only
- `feedback-lookup-provider-stub-boundary-pause-checkpoint-2026-05-26.md`
  - confirms the provider-stub boundary artifact is complete enough to pause and routes any further widening to an explicit implementation-adjacent boundary decision
- `feedback-lookup-implementation-adjacent-boundary-checkpoint-2026-05-26.md`
  - decides whether an implementation-adjacent lookup lane should open at all and narrows the next safe artifact to a transport-neutral callable stub provider boundary only
- `feedback-lookup-callable-stub-provider-pause-checkpoint-2026-05-26.md`
  - confirms the callable stub provider artifact is complete enough to pause and routes any further widening to an explicit live-provider-adjacent boundary decision
- `feedback-lookup-live-provider-adjacent-boundary-checkpoint-2026-05-27.md`
  - decides whether a live-provider-adjacent lookup lane should open at all and narrows the next safe artifact to a transport-neutral live-provider capability boundary only
- `feedback-lookup-live-provider-capability-pause-checkpoint-2026-05-27.md`
  - confirms the live-provider capability boundary is complete enough to pause and routes any further widening to an explicit callable-live-provider-adjacent boundary decision
- `feedback-lookup-callable-live-provider-adjacent-boundary-checkpoint-2026-05-27.md`
  - decides whether a callable-live-provider-adjacent lookup lane should open at all and narrows the next safe artifact to a transport-neutral callable live-provider boundary only

Pre-handoff live-state check:

- verify live `HEAD`
- read the latest local receipt
- confirm repo status is clean
- confirm the proposed next package is not already landed
