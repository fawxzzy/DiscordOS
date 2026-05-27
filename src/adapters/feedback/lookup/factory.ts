import type { FeedbackLookupPort } from "../../../contracts";
import { normalizeFeedbackLookupProviderResult } from "./normalize";
import type { FeedbackLookupProvider } from "./types";

export function createFeedbackLookupPort(
  provider: FeedbackLookupProvider
): FeedbackLookupPort {
  return {
    async findReportIdentity(reportIdOrPrefix) {
      const result = await provider.findReportIdentity(reportIdOrPrefix);
      return normalizeFeedbackLookupProviderResult(result);
    },
  };
}
