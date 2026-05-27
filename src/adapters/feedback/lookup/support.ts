import {
  createAmbiguousFeedbackLookupProviderResultFixture,
  createFeedbackLookupProviderRequestFixture,
  createFeedbackLookupProviderStubBoundaryFixture,
  createFeedbackLookupProviderStubExpectationFixture,
  createFoundFeedbackLookupProviderResultFixture,
  createInvalidInputFeedbackLookupProviderResultFixture,
  createNotFoundFeedbackLookupProviderResultFixture,
  createRawFeedbackLookupIdentityFixture,
  createUnavailableFeedbackLookupProviderResultFixture,
} from "./fixtures";
import {
  createAmbiguousFeedbackLookupNormalizationScenario,
  createFeedbackLookupNormalizationScenarios,
  createFoundFeedbackLookupNormalizationScenario,
  createInvalidInputFeedbackLookupNormalizationScenario,
  createNotFoundFeedbackLookupNormalizationScenario,
  createUnavailableFeedbackLookupNormalizationScenario,
  FEEDBACK_LOOKUP_NORMALIZATION_SCENARIO_LABELS,
} from "./scenarios";

export const FEEDBACK_LOOKUP_FIXTURE_BUILDERS = {
  createFeedbackLookupProviderRequestFixture,
  createFeedbackLookupProviderStubExpectationFixture,
  createFeedbackLookupProviderStubBoundaryFixture,
  createRawFeedbackLookupIdentityFixture,
  createFoundFeedbackLookupProviderResultFixture,
  createNotFoundFeedbackLookupProviderResultFixture,
  createAmbiguousFeedbackLookupProviderResultFixture,
  createInvalidInputFeedbackLookupProviderResultFixture,
  createUnavailableFeedbackLookupProviderResultFixture,
} as const;

export type FeedbackLookupFixtureBuilders =
  typeof FEEDBACK_LOOKUP_FIXTURE_BUILDERS;

export const FEEDBACK_LOOKUP_SCENARIO_BUILDERS = {
  createFoundFeedbackLookupNormalizationScenario,
  createNotFoundFeedbackLookupNormalizationScenario,
  createAmbiguousFeedbackLookupNormalizationScenario,
  createInvalidInputFeedbackLookupNormalizationScenario,
  createUnavailableFeedbackLookupNormalizationScenario,
  createFeedbackLookupNormalizationScenarios,
} as const;

export type FeedbackLookupScenarioBuilders =
  typeof FEEDBACK_LOOKUP_SCENARIO_BUILDERS;

export const FEEDBACK_LOOKUP_SUPPORT = {
  labels: FEEDBACK_LOOKUP_NORMALIZATION_SCENARIO_LABELS,
  fixtures: FEEDBACK_LOOKUP_FIXTURE_BUILDERS,
  scenarios: FEEDBACK_LOOKUP_SCENARIO_BUILDERS,
} as const;

export type FeedbackLookupSupport = typeof FEEDBACK_LOOKUP_SUPPORT;
