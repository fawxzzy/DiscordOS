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

export interface FeedbackLookupProviderRequest {
  reportIdOrPrefix: string;
}

export type FeedbackLookupProviderBoundaryKind = "stub" | "live";

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

export interface FeedbackLookupProviderStubExpectation {
  request: FeedbackLookupProviderRequest;
  result: RawFeedbackLookupProviderResult;
}

export interface FeedbackLookupProviderStubBoundary {
  boundaryKind: "stub";
  expectations: readonly FeedbackLookupProviderStubExpectation[];
  fallbackResult: RawFeedbackLookupProviderResult;
}

export interface FeedbackLookupProviderLiveBoundary {
  boundaryKind: "live";
}

export interface FeedbackLookupProvider {
  findReportIdentity(
    request: FeedbackLookupProviderRequest
  ): Promise<RawFeedbackLookupProviderResult>;
}

export interface FeedbackLookupStubProvider
  extends FeedbackLookupProvider,
    FeedbackLookupProviderStubBoundary {}

export interface FeedbackLookupLiveProvider
  extends FeedbackLookupProvider,
    FeedbackLookupProviderLiveBoundary {}
