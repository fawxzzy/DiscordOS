import type {
  FeedbackAuditPort,
  FeedbackLookupPort,
  FeedbackPermissionPort,
  FeedbackReportStorePort,
  FeedbackThreadSyncPort,
} from "../../contracts";

export type {
  FeedbackAuditPort,
  FeedbackLookupPort,
  FeedbackPermissionPort,
  FeedbackReportStorePort,
  FeedbackThreadSyncPort,
} from "../../contracts";
export type {
  FeedbackLookupProvider,
  RawFeedbackLookupIdentity,
  RawFeedbackLookupProviderResult,
} from "./lookup";
export {
  normalizeFeedbackLookupIdentity,
  normalizeFeedbackLookupProviderResult,
} from "./lookup";

export type FeedbackAdapterSlotName =
  | "reportStore"
  | "lookup"
  | "threadSync"
  | "audit"
  | "permission";

export interface FeedbackAdapterBundle {
  reportStore: FeedbackReportStorePort;
  lookup: FeedbackLookupPort;
  threadSync: FeedbackThreadSyncPort;
  audit: FeedbackAuditPort;
  permission: FeedbackPermissionPort;
}
