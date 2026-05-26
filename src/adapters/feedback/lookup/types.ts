import type {
  FeedbackCardId,
  FeedbackReportType,
} from "../../../contracts";

export interface RawFeedbackLookupIdentity {
  reportId: FeedbackCardId;
  reportType: FeedbackReportType;
  shortDisplayId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RawFeedbackLookupProviderResult =
  | {
      kind: "found";
      identity: RawFeedbackLookupIdentity;
      warning: string | null;
    }
  | {
      kind: "not_found";
      warning: string | null;
    }
  | {
      kind: "ambiguous";
      warning: string | null;
    }
  | {
      kind: "invalid_input";
      warning: string | null;
    }
  | {
      kind: "unavailable";
      message: string;
      warning: string | null;
    };

export interface FeedbackLookupProvider {
  findReportIdentity(
    reportIdOrPrefix: string
  ): Promise<RawFeedbackLookupProviderResult>;
}
