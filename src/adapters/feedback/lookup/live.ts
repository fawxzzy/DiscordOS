import {
  createInvalidInputFeedbackLookupProviderResultFixture,
  createUnavailableFeedbackLookupProviderResultFixture,
} from "./fixtures";
import type {
  FeedbackLookupLiveProvider,
  FeedbackLookupProviderLiveBoundary,
  FeedbackLookupProviderRequest,
  RawFeedbackLookupProviderResult,
} from "./types";

function resolveFeedbackLookupLiveBoundaryResult(
  boundary: FeedbackLookupProviderLiveBoundary,
  request: FeedbackLookupProviderRequest
): RawFeedbackLookupProviderResult {
  if (
    boundary.failureEnvelope.invalidInput &&
    request.reportIdOrPrefix.trim().length === 0
  ) {
    return createInvalidInputFeedbackLookupProviderResultFixture(
      "Lookup request must include a report id or prefix."
    );
  }

  return createUnavailableFeedbackLookupProviderResultFixture(
    boundary.unavailableMessage
  );
}

export function createFeedbackLookupLiveProvider(
  boundary: FeedbackLookupProviderLiveBoundary
): FeedbackLookupLiveProvider {
  return {
    ...boundary,
    async findReportIdentity(
      request: FeedbackLookupProviderRequest
    ): Promise<RawFeedbackLookupProviderResult> {
      return resolveFeedbackLookupLiveBoundaryResult(boundary, request);
    },
  };
}
