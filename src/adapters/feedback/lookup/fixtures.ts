import type {
  FeedbackLookupProviderRequest,
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
