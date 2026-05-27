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
  FeedbackLookupProviderRequest,
  RawFeedbackLookupIdentity,
  RawFeedbackLookupProviderResult,
} from "./lookup";
export {
  createAmbiguousFeedbackLookupProviderResultFixture,
  createAmbiguousFeedbackLookupNormalizationScenario,
  createFeedbackLookupPort,
  createFeedbackLookupProviderRequestFixture,
  createFoundFeedbackLookupProviderResultFixture,
  createFoundFeedbackLookupNormalizationScenario,
  createInvalidInputFeedbackLookupProviderResultFixture,
  createInvalidInputFeedbackLookupNormalizationScenario,
  createNotFoundFeedbackLookupProviderResultFixture,
  createNotFoundFeedbackLookupNormalizationScenario,
  createRawFeedbackLookupIdentityFixture,
  createUnavailableFeedbackLookupProviderResultFixture,
  createUnavailableFeedbackLookupNormalizationScenario,
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
