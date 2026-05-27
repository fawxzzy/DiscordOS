# Feedback Lookup First Mutation Checklist

Use this checklist before opening the first `FeedbackLookupPort` mutation lane.

Before writing or accepting a handoff for that lane:

- verify live `HEAD`
- read the latest local receipt
- confirm repo status is clean
- confirm the proposed next package is not already landed

Stop immediately if any item fails:

- `npm run verify:feedback-adapters` passes without emitting files
- the lane stays scoped to `FeedbackLookupPort` only
- no direct import reaches into Fitness runtime, database, or env-backed code
- no full report-row truth is copied into DiscordOS
- the change remains local to:
  - `src/contracts/**`
  - `src/adapters/feedback/**`
  - repo-local tooling files needed for verification

The first mutation lane must also remain a no-op if:

- verification fails
- the boundary widens into report-store, permission, thread-sync, or audit
- transport wiring becomes necessary
- runtime activation, schema/data movement, worker retarget, or Vercel cutover is implied
