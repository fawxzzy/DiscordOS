import type {
  FeedbackLookupProviderRequest,
  FeedbackLookupProviderStubBoundary,
  FeedbackLookupProviderStubExpectation,
  FeedbackLookupStubProvider,
  RawFeedbackLookupProviderResult,
} from "./types";

function matchesFeedbackLookupProviderRequest(
  left: FeedbackLookupProviderRequest,
  right: FeedbackLookupProviderRequest
): boolean {
  return left.reportIdOrPrefix === right.reportIdOrPrefix;
}

function resolveFeedbackLookupStubExpectation(
  expectations: readonly FeedbackLookupProviderStubExpectation[],
  request: FeedbackLookupProviderRequest
): FeedbackLookupProviderStubExpectation | null {
  return (
    expectations.find((expectation) =>
      matchesFeedbackLookupProviderRequest(expectation.request, request)
    ) ?? null
  );
}

export function createFeedbackLookupStubProvider(
  boundary: FeedbackLookupProviderStubBoundary
): FeedbackLookupStubProvider {
  return {
    ...boundary,
    async findReportIdentity(
      request: FeedbackLookupProviderRequest
    ): Promise<RawFeedbackLookupProviderResult> {
      return (
        resolveFeedbackLookupStubExpectation(
          boundary.expectations,
          request
        )?.result ?? boundary.fallbackResult
      );
    },
  };
}
