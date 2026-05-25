# DiscordOS Feedback Runtime Contract

## Status

- scaffold only
- no Fitness code copied
- no runtime implementation
- no database client
- no Supabase schema
- no env values

## Purpose

This document defines the first DiscordOS-owned contract surface for the feedback domain.

It exists so future extraction work can target a stable seam instead of copying Fitness-hosted implementation details into DiscordOS.

## Current Ownership

### Still Fitness-owned

- live Discord interaction route
- live feedback persistence
- live forum thread/message sync
- live audit comment posting
- canonical `discord_feedback_reports` rows
- current reporter identity bridge via Fitness-owned tables and contracts

### Future DiscordOS-owned

- feedback runtime orchestration
- feedback lifecycle handling
- feedback runtime state after approved schema landing and cutover
- feedback forum synchronization after approved runtime ownership transfer

## Contract Boundaries

This scaffold separates three concerns:

1. Fitness-owned current report truth
2. DiscordOS-owned future runtime state
3. shared cross-system contract shapes

The contract must support migration without changing:

- report ids
- thread ids
- message ids
- status meaning
- completion-review meaning
- audit event meaning

## Contract Shapes

These are documentation contracts only for now. They are not yet implemented as code or runtime adapters.

Current code-facing mirror:

- `src/contracts/feedback.ts`
  - typed contract surface only
  - intentionally contains no implementation

### 1. Feedback Card Identity

```ts
type FeedbackCardId = string;

type FeedbackCardIdentity = {
  reportId: FeedbackCardId;
  reportType: "bug" | "feature" | "fix";
  shortDisplayId: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- `reportId` must remain immutable across extraction
- public-facing thread/message linkage must continue to reference the same report identity

### 2. Feedback Status Lifecycle

```ts
type FeedbackStatus =
  | "new"
  | "needs_info"
  | "confirmed"
  | "fawxzzy_review"
  | "in_progress"
  | "fixed"
  | "closed"
  | "duplicate"
  | "spam"
  | "withdrawn";

type FeedbackCompletionReviewStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "needs_followup";

type FeedbackLifecycleState = {
  status: FeedbackStatus;
  completionReviewStatus: FeedbackCompletionReviewStatus;
  statusUpdatedAt: string | null;
  statusUpdatedByDiscordUserId: string | null;
  statusNote: string | null;
  completionReviewedAt: string | null;
  completionReviewedByDiscordUserId: string | null;
  completionReviewNote: string | null;
};
```

Rules:

- status labels keep current meaning
- completion review stays an explicit state, not an implied side effect

### 3. Feedback Audit / Comment Event

```ts
type FeedbackAuditAction =
  | "status_update"
  | "completion_review"
  | "withdraw"
  | "reporter_update"
  | "staff_update"
  | "duplicate_signal"
  | "sync_format";

type FeedbackAuditEvent = {
  reportId: FeedbackCardId;
  action: FeedbackAuditAction;
  actorLabel: string | null;
  includeReporterMention: boolean;
  statusBefore: FeedbackStatus | null;
  statusAfter: FeedbackStatus | null;
  completionReviewStatus: FeedbackCompletionReviewStatus | null;
  note: string | null;
  duplicateCount: number | null;
};
```

Rules:

- audit semantics must stay stable across owner transfer
- audit event shape should remain transport-safe and independent of current host implementation

### 4. Completion Review Event

```ts
type FeedbackCompletionReviewEvent = {
  reportId: FeedbackCardId;
  status: FeedbackCompletionReviewStatus;
  reviewedByDiscordUserId: string;
  reviewedAt: string;
  note: string | null;
};
```

### 5. Fitness-Owned Report Reference

```ts
type FitnessFeedbackReportReference = {
  reportId: FeedbackCardId;
  reporterDiscordUserId: string;
  reporterFitnessUserId: string | null;
  reporterMemberNumber: number | null;
  reporterUserKind: "human" | "automation" | "unknown" | null;
  forumChannelId: string | null;
  forumThreadId: string | null;
  forumMessageId: string | null;
};
```

Rules:

- this is a reference contract, not a promise that DiscordOS owns the source row yet
- Fitness remains canonical until a later approved cutover

### 6. DiscordOS-Owned Future Runtime State

```ts
type DiscordOSFeedbackRuntimeState = {
  reportId: FeedbackCardId;
  forumTitle: string | null;
  forumAppliedTagIds: string[] | null;
  reporterMentionedAt: string | null;
  runtimeWarnings: string[];
  lastForumSyncAt: string | null;
};
```

Rules:

- this shape is future-facing and should not be backfilled by guesswork
- no canonical writer exists in DiscordOS yet

### 7. Error / Fallback Response Shape

```ts
type FeedbackRuntimeErrorCode =
  | "REPORT_NOT_FOUND"
  | "REPORT_ID_AMBIGUOUS"
  | "FORUM_SYNC_FAILED"
  | "AUDIT_COMMENT_FAILED"
  | "REACTION_SYNC_FAILED"
  | "PERMISSION_DENIED"
  | "INVALID_INPUT"
  | "UPSTREAM_UNAVAILABLE";

type FeedbackRuntimeResult<T> =
  | { ok: true; value: T; warning: string | null }
  | { ok: false; code: FeedbackRuntimeErrorCode; message: string; warning: string | null };
```

Rules:

- error contracts should be stable before implementation moves
- fallback behavior must not depend on implicit route-local strings alone

## Ports Needed Later

Before real extraction, DiscordOS should implement ports rather than copied logic:

- `FeedbackReportStorePort`
- `FeedbackThreadSyncPort`
- `FeedbackAuditPort`
- `FeedbackLookupPort`
- `FeedbackPermissionPort`

These ports should be satisfied later by adapters, not by direct Fitness code copy.

## Explicit Non-Goals

This scaffold does not:

- copy `bug-reports.ts`
- copy `runtime/feedback/forum.ts`
- create TypeScript runtime code
- create a Supabase client
- define migrations
- define Vercel config
- define env files
- change live Discord behavior

## Next Safe Step

After this scaffold, the next safe package is:

- a small DiscordOS code-facing contract/interface package if and only if repo tooling is intentionally added for that purpose

Until then, this document is the governed seam for future feedback extraction work.
