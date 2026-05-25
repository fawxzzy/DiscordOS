export type FeedbackCardId = string;

export type FeedbackReportType = "bug" | "feature" | "fix";

export type FeedbackStatus =
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

export type FeedbackCompletionReviewStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "needs_followup";

export type FeedbackUserKind = "human" | "automation" | "unknown";

export type FeedbackAuditAction =
  | "status_update"
  | "completion_review"
  | "withdraw"
  | "reporter_update"
  | "staff_update"
  | "duplicate_signal"
  | "sync_format";

export type DiscordOSFeedbackErrorCode =
  | "REPORT_NOT_FOUND"
  | "REPORT_ID_AMBIGUOUS"
  | "FORUM_SYNC_FAILED"
  | "AUDIT_COMMENT_FAILED"
  | "REACTION_SYNC_FAILED"
  | "PERMISSION_DENIED"
  | "INVALID_INPUT"
  | "UPSTREAM_UNAVAILABLE";

export interface FeedbackCardIdentity {
  reportId: FeedbackCardId;
  reportType: FeedbackReportType;
  shortDisplayId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackLifecycleState {
  status: FeedbackStatus;
  completionReviewStatus: FeedbackCompletionReviewStatus;
  statusUpdatedAt: string | null;
  statusUpdatedByDiscordUserId: string | null;
  statusNote: string | null;
  completionReviewedAt: string | null;
  completionReviewedByDiscordUserId: string | null;
  completionReviewNote: string | null;
}

export interface FeedbackAuditEvent {
  reportId: FeedbackCardId;
  action: FeedbackAuditAction;
  actorLabel: string | null;
  includeReporterMention: boolean;
  statusBefore: FeedbackStatus | null;
  statusAfter: FeedbackStatus | null;
  completionReviewStatus: FeedbackCompletionReviewStatus | null;
  note: string | null;
  duplicateCount: number | null;
}

export interface FeedbackCompletionReviewEvent {
  reportId: FeedbackCardId;
  status: FeedbackCompletionReviewStatus;
  reviewedByDiscordUserId: string;
  reviewedAt: string;
  note: string | null;
}

export interface FitnessReportReference {
  reportId: FeedbackCardId;
  reporterDiscordUserId: string;
  reporterFitnessUserId: string | null;
  reporterMemberNumber: number | null;
  reporterUserKind: FeedbackUserKind | null;
  forumChannelId: string | null;
  forumThreadId: string | null;
  forumMessageId: string | null;
}

export interface DiscordOSFeedbackRuntimeState {
  reportId: FeedbackCardId;
  forumTitle: string | null;
  forumAppliedTagIds: string[] | null;
  reporterMentionedAt: string | null;
  runtimeWarnings: string[];
  lastForumSyncAt: string | null;
}

export type DiscordOSFeedbackResult<T> =
  | {
    ok: true;
    value: T;
    warning: string | null;
  }
  | {
    ok: false;
    code: DiscordOSFeedbackErrorCode;
    message: string;
    warning: string | null;
  };

export interface FeedbackReportStorePort {
  getReportReference(reportId: FeedbackCardId): Promise<DiscordOSFeedbackResult<FitnessReportReference>>;
  getLifecycleState(reportId: FeedbackCardId): Promise<DiscordOSFeedbackResult<FeedbackLifecycleState>>;
}

export interface FeedbackLookupPort {
  findReportIdentity(reportIdOrPrefix: string): Promise<DiscordOSFeedbackResult<FeedbackCardIdentity>>;
}

export interface FeedbackThreadSyncPort {
  syncStarterMessage(reportId: FeedbackCardId): Promise<DiscordOSFeedbackResult<DiscordOSFeedbackRuntimeState>>;
  syncForumState(reportId: FeedbackCardId): Promise<DiscordOSFeedbackResult<DiscordOSFeedbackRuntimeState>>;
  syncResolvedReaction(reportId: FeedbackCardId): Promise<DiscordOSFeedbackResult<null>>;
}

export interface FeedbackAuditPort {
  postAuditEvent(event: FeedbackAuditEvent): Promise<DiscordOSFeedbackResult<{ messageId: string | null }>>;
}

export interface FeedbackPermissionPort {
  canAccessAnyFeedbackReport(permissions: string | null): boolean;
}
