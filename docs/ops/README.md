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
- `feedback-lookup-callable-live-provider-boundary-pause-checkpoint-2026-05-27.md`
  - confirms the callable live-provider boundary is complete enough to pause and routes any further widening to an explicit externally-backed-or-transport-aware boundary decision
- `feedback-lookup-externally-backed-or-transport-aware-boundary-checkpoint-2026-05-27.md`
  - decides whether any externally backed or transport-aware lookup lane should open at all and narrows the next safe artifact to a transport-neutral external-backing trust boundary only
- `feedback-lookup-transport-neutral-externally-backed-live-provider-trust-boundary-package-16-2026-05-27.md`
  - defines the smallest safe externally backed trust boundary for lookup while keeping transport choice, bridge wiring, and execution blocked
- `feedback-lookup-externally-backed-trust-boundary-pause-checkpoint-2026-05-27.md`
  - confirms the externally backed trust boundary is complete enough to pause and routes any further widening to an explicit transport-aware-or-externally-executing boundary decision
- `feedback-lookup-transport-aware-or-externally-executing-boundary-checkpoint-2026-05-27.md`
  - confirms both transport-aware and externally-executing lookup lanes remain blocked and stops further DiscordOS lookup widening pending explicit higher-level authorization

Pre-handoff live-state check:

- verify live `HEAD`
- read the latest local receipt
- confirm repo status is clean
- confirm the proposed next package is not already landed
