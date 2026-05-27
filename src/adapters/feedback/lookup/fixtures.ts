import type {
  FeedbackLookupLiveProviderCapabilities,
  FeedbackLookupProviderLiveBoundary,
  FeedbackLookupLiveProviderFailureEnvelope,
  FeedbackLookupProviderRequest,
  FeedbackLookupProviderStubBoundary,
  FeedbackLookupProviderStubExpectation,
  RawFeedbackLookupIdentity,
  RawFeedbackLookupProviderResult,
} from "./types";

const DEFAULT_RAW_FEEDBACK_LOOKUP_IDENTITY: RawFeedbackLookupIdentity = {
  reportId: "feedback-report-001",
  reportType: "bug",
  shortDisplayId: "FDB-001",
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

const DEFAULT_FEEDBACK_LOOKUP_LIVE_PROVIDER_CAPABILITIES: FeedbackLookupLiveProviderCapabilities =
  {
    identityLookup: true,
    batchLookup: false,
    auditEmission: false,
    threadMutation: false,
  };

const DEFAULT_FEEDBACK_LOOKUP_LIVE_PROVIDER_FAILURE_ENVELOPE: FeedbackLookupLiveProviderFailureEnvelope =
  {
    unavailable: true,
    invalidInput: true,
    ambiguousMatch: true,
    notFound: true,
  };

const DEFAULT_FEEDBACK_LOOKUP_LIVE_PROVIDER_UNAVAILABLE_MESSAGE =
  "Live lookup provider boundary is not connected.";

export function createFeedbackLookupProviderRequestFixture(
  reportIdOrPrefix = "FDB-001"
): FeedbackLookupProviderRequest {
  return {
    reportIdOrPrefix,
  };
}

export function createRawFeedbackLookupIdentityFixture(
  overrides: Partial<RawFeedbackLookupIdentity> = {}
): RawFeedbackLookupIdentity {
  return {
    ...DEFAULT_RAW_FEEDBACK_LOOKUP_IDENTITY,
    ...overrides,
  };
}

export function createFoundFeedbackLookupProviderResultFixture(
  identityOverrides: Partial<RawFeedbackLookupIdentity> = {},
  warning: string | null = null
): RawFeedbackLookupProviderResult {
  return {
    kind: "found",
    identity: createRawFeedbackLookupIdentityFixture(identityOverrides),
    warning,
  };
}

export function createNotFoundFeedbackLookupProviderResultFixture(
  warning: string | null = null
): RawFeedbackLookupProviderResult {
  return {
    kind: "not_found",
    warning,
  };
}

export function createAmbiguousFeedbackLookupProviderResultFixture(
  warning: string | null = null
): RawFeedbackLookupProviderResult {
  return {
    kind: "ambiguous",
    warning,
  };
}

export function createInvalidInputFeedbackLookupProviderResultFixture(
  warning: string | null = null
): RawFeedbackLookupProviderResult {
  return {
    kind: "invalid_input",
    warning,
  };
}

export function createUnavailableFeedbackLookupProviderResultFixture(
  message = "Lookup provider unavailable.",
  warning: string | null = null
): RawFeedbackLookupProviderResult {
  return {
    kind: "unavailable",
    message,
    warning,
  };
}

export function createFeedbackLookupProviderStubExpectationFixture(
  overrides: Partial<FeedbackLookupProviderStubExpectation> = {}
): FeedbackLookupProviderStubExpectation {
  return {
    request:
      overrides.request ?? createFeedbackLookupProviderRequestFixture(),
    result:
      overrides.result ?? createFoundFeedbackLookupProviderResultFixture(),
  };
}

export function createFeedbackLookupProviderStubBoundaryFixture(
  overrides: Partial<
    Omit<FeedbackLookupProviderStubBoundary, "boundaryKind">
  > = {}
): FeedbackLookupProviderStubBoundary {
  return {
    boundaryKind: "stub",
    expectations:
      overrides.expectations ?? [
        createFeedbackLookupProviderStubExpectationFixture(),
      ],
    fallbackResult:
      overrides.fallbackResult ??
      createUnavailableFeedbackLookupProviderResultFixture(),
  };
}

export function createFeedbackLookupLiveProviderCapabilitiesFixture(
  overrides: Partial<FeedbackLookupLiveProviderCapabilities> = {}
): FeedbackLookupLiveProviderCapabilities {
  return {
    ...DEFAULT_FEEDBACK_LOOKUP_LIVE_PROVIDER_CAPABILITIES,
    ...overrides,
  };
}

export function createFeedbackLookupLiveProviderFailureEnvelopeFixture(
  overrides: Partial<FeedbackLookupLiveProviderFailureEnvelope> = {}
): FeedbackLookupLiveProviderFailureEnvelope {
  return {
    ...DEFAULT_FEEDBACK_LOOKUP_LIVE_PROVIDER_FAILURE_ENVELOPE,
    ...overrides,
  };
}

export function createFeedbackLookupProviderLiveBoundaryFixture(
  overrides: Partial<FeedbackLookupProviderLiveBoundary> = {}
): FeedbackLookupProviderLiveBoundary {
  return {
    boundaryKind: "live",
    capabilities:
      overrides.capabilities ??
      createFeedbackLookupLiveProviderCapabilitiesFixture(),
    failureEnvelope:
      overrides.failureEnvelope ??
      createFeedbackLookupLiveProviderFailureEnvelopeFixture(),
    unavailableMessage:
      overrides.unavailableMessage ??
      DEFAULT_FEEDBACK_LOOKUP_LIVE_PROVIDER_UNAVAILABLE_MESSAGE,
  };
}
