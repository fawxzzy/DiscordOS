import type {
  DiscordOSFeedbackResult,
  FeedbackCardIdentity,
} from "../../../contracts";
import {
  createAmbiguousFeedbackLookupProviderResultFixture,
  createFeedbackLookupProviderRequestFixture,
  createFoundFeedbackLookupProviderResultFixture,
  createInvalidInputFeedbackLookupProviderResultFixture,
  createNotFoundFeedbackLookupProviderResultFixture,
  createUnavailableFeedbackLookupProviderResultFixture,
} from "./fixtures";
import { normalizeFeedbackLookupProviderResult } from "./normalize";
import type {
  FeedbackLookupProviderRequest,
  RawFeedbackLookupProviderResult,
} from "./types";

export interface FeedbackLookupNormalizationScenario {
  label:
    | "found"
    | "not_found"
    | "ambiguous"
    | "invalid_input"
    | "unavailable";
  request: FeedbackLookupProviderRequest;
  rawResult: RawFeedbackLookupProviderResult;
  normalizedResult: DiscordOSFeedbackResult<FeedbackCardIdentity>;
}

export function createFoundFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  const request = createFeedbackLookupProviderRequestFixture("FDB-001");
  const rawResult = createFoundFeedbackLookupProviderResultFixture();

  return {
    label: "found",
    request,
    rawResult,
    normalizedResult: normalizeFeedbackLookupProviderResult(rawResult),
  };
}

export function createNotFoundFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  const request = createFeedbackLookupProviderRequestFixture("FDB-404");
  const rawResult = createNotFoundFeedbackLookupProviderResultFixture();

  return {
    label: "not_found",
    request,
    rawResult,
    normalizedResult: normalizeFeedbackLookupProviderResult(rawResult),
  };
}

export function createAmbiguousFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  const request = createFeedbackLookupProviderRequestFixture("FDB");
  const rawResult = createAmbiguousFeedbackLookupProviderResultFixture();

  return {
    label: "ambiguous",
    request,
    rawResult,
    normalizedResult: normalizeFeedbackLookupProviderResult(rawResult),
  };
}

export function createInvalidInputFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  const request = createFeedbackLookupProviderRequestFixture("");
  const rawResult = createInvalidInputFeedbackLookupProviderResultFixture();

  return {
    label: "invalid_input",
    request,
    rawResult,
    normalizedResult: normalizeFeedbackLookupProviderResult(rawResult),
  };
}

export function createUnavailableFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  const request = createFeedbackLookupProviderRequestFixture("FDB-503");
  const rawResult = createUnavailableFeedbackLookupProviderResultFixture();

  return {
    label: "unavailable",
    request,
    rawResult,
    normalizedResult: normalizeFeedbackLookupProviderResult(rawResult),
  };
}
