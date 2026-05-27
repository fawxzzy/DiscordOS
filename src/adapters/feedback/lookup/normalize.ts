import type {
  DiscordOSFeedbackResult,
  FeedbackCardIdentity,
} from "../../../contracts";
import type {
  RawFeedbackLookupIdentity,
  RawFeedbackLookupProviderResult,
} from "./types";

export function normalizeFeedbackLookupIdentity(
  identity: RawFeedbackLookupIdentity
): FeedbackCardIdentity {
  return {
    reportId: identity.reportId,
    reportType: identity.reportType,
    shortDisplayId: identity.shortDisplayId,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  };
}

export function normalizeFeedbackLookupProviderResult(
  result: RawFeedbackLookupProviderResult
): DiscordOSFeedbackResult<FeedbackCardIdentity> {
  switch (result.kind) {
    case "found":
      return {
        ok: true,
        value: normalizeFeedbackLookupIdentity(result.identity),
        warning: result.warning,
      };
    case "not_found":
      return {
        ok: false,
        code: "REPORT_NOT_FOUND",
        message: "No feedback report matched the provided identifier.",
        warning: result.warning,
      };
    case "ambiguous":
      return {
        ok: false,
        code: "REPORT_ID_AMBIGUOUS",
        message: "Multiple feedback reports matched the provided identifier.",
        warning: result.warning,
      };
    case "invalid_input":
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "The provided feedback report identifier is invalid.",
        warning: result.warning,
      };
    case "unavailable":
      return {
        ok: false,
        code: "UPSTREAM_UNAVAILABLE",
        message: result.message,
        warning: result.warning,
      };
  }
}
