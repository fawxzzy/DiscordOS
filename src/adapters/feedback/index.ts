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
  FeedbackLookupLiveProvider,
  FeedbackLookupProvider,
  FeedbackLookupProviderBoundaryKind,
  FeedbackLookupProviderLiveBoundary,
  FeedbackLookupProviderRequest,
  FeedbackLookupProviderStubBoundary,
  FeedbackLookupProviderStubExpectation,
  FeedbackLookupStubProvider,
  RawFeedbackLookupIdentity,
  RawFeedbackLookupProviderResult,
} from "./lookup";
export {
  createAmbiguousFeedbackLookupProviderResultFixture,
  createAmbiguousFeedbackLookupNormalizationScenario,
  createFeedbackLookupNormalizationScenarios,
  createFeedbackLookupPort,
  createFeedbackLookupProviderRequestFixture,
  createFeedbackLookupProviderStubBoundaryFixture,
  createFeedbackLookupProviderStubExpectationFixture,
  createFeedbackLookupStubProvider,
  createFoundFeedbackLookupProviderResultFixture,
  createFoundFeedbackLookupNormalizationScenario,
  createInvalidInputFeedbackLookupProviderResultFixture,
  createInvalidInputFeedbackLookupNormalizationScenario,
  createNotFoundFeedbackLookupProviderResultFixture,
  createNotFoundFeedbackLookupNormalizationScenario,
  createRawFeedbackLookupIdentityFixture,
  createUnavailableFeedbackLookupProviderResultFixture,
  createUnavailableFeedbackLookupNormalizationScenario,
  FEEDBACK_LOOKUP_FIXTURE_BUILDERS,
  FEEDBACK_LOOKUP_NORMALIZATION_SCENARIO_LABELS,
  FEEDBACK_LOOKUP_SCENARIO_BUILDERS,
  FEEDBACK_LOOKUP_SUPPORT,
  normalizeFeedbackLookupIdentity,
  normalizeFeedbackLookupProviderResult,
} from "./lookup";
export type {
  FeedbackLookupFixtureBuilders,
  FeedbackLookupNormalizationScenario,
  FeedbackLookupNormalizationScenarioLabel,
  FeedbackLookupScenarioBuilders,
  FeedbackLookupSupport,
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
