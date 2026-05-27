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

export type FeedbackLookupNormalizationScenarioLabel =
  | "found"
  | "not_found"
  | "ambiguous"
  | "invalid_input"
  | "unavailable";

export interface FeedbackLookupNormalizationScenario {
  label: FeedbackLookupNormalizationScenarioLabel;
  request: FeedbackLookupProviderRequest;
  rawResult: RawFeedbackLookupProviderResult;
  normalizedResult: DiscordOSFeedbackResult<FeedbackCardIdentity>;
}

export const FEEDBACK_LOOKUP_NORMALIZATION_SCENARIO_LABELS: ReadonlyArray<FeedbackLookupNormalizationScenarioLabel> =
  ["found", "not_found", "ambiguous", "invalid_input", "unavailable"];

function createFeedbackLookupNormalizationScenario(
  label: FeedbackLookupNormalizationScenarioLabel,
  request: FeedbackLookupProviderRequest,
  rawResult: RawFeedbackLookupProviderResult
): FeedbackLookupNormalizationScenario {
  return {
    label,
    request,
    rawResult,
    normalizedResult: normalizeFeedbackLookupProviderResult(rawResult),
  };
}

export function createFoundFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  return createFeedbackLookupNormalizationScenario(
    "found",
    createFeedbackLookupProviderRequestFixture("FDB-001"),
    createFoundFeedbackLookupProviderResultFixture()
  );
}

export function createNotFoundFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  return createFeedbackLookupNormalizationScenario(
    "not_found",
    createFeedbackLookupProviderRequestFixture("FDB-404"),
    createNotFoundFeedbackLookupProviderResultFixture()
  );
}

export function createAmbiguousFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  return createFeedbackLookupNormalizationScenario(
    "ambiguous",
    createFeedbackLookupProviderRequestFixture("FDB"),
    createAmbiguousFeedbackLookupProviderResultFixture()
  );
}

export function createInvalidInputFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  return createFeedbackLookupNormalizationScenario(
    "invalid_input",
    createFeedbackLookupProviderRequestFixture(""),
    createInvalidInputFeedbackLookupProviderResultFixture()
  );
}

export function createUnavailableFeedbackLookupNormalizationScenario(): FeedbackLookupNormalizationScenario {
  return createFeedbackLookupNormalizationScenario(
    "unavailable",
    createFeedbackLookupProviderRequestFixture("FDB-503"),
    createUnavailableFeedbackLookupProviderResultFixture()
  );
}

export function createFeedbackLookupNormalizationScenarios(): ReadonlyArray<FeedbackLookupNormalizationScenario> {
  return FEEDBACK_LOOKUP_NORMALIZATION_SCENARIO_LABELS.map((label) => {
    switch (label) {
      case "found":
        return createFoundFeedbackLookupNormalizationScenario();
      case "not_found":
        return createNotFoundFeedbackLookupNormalizationScenario();
      case "ambiguous":
        return createAmbiguousFeedbackLookupNormalizationScenario();
      case "invalid_input":
        return createInvalidInputFeedbackLookupNormalizationScenario();
      case "unavailable":
        return createUnavailableFeedbackLookupNormalizationScenario();
    }
  });
}
