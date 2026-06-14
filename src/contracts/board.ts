import type {
  DiscordOSDataContractIdentity,
  DiscordOSDataEventEnvelope,
  DiscordOSDataProofContract,
} from "./data";

export type DiscordOSBoardCardKind =
  | "feature"
  | "bug"
  | "ops"
  | "release"
  | "moderation";

export type DiscordOSBoardCardState =
  | "opened"
  | "in_progress"
  | "blocked"
  | "completed"
  | "closed";

export interface DiscordOSBoardCardIdentity {
  cardId: string;
  workflow: string;
  kind: DiscordOSBoardCardKind;
  sourceThreadId: string | null;
  createdAt: string;
}

export interface DiscordOSBoardCardTransition {
  cardId: string;
  fromState: DiscordOSBoardCardState | null;
  toState: DiscordOSBoardCardState;
  actor: string;
  note: string | null;
  occurredAt: string;
  proof: DiscordOSDataProofContract;
}

export interface DiscordOSBoardCardContract {
  contract: DiscordOSDataContractIdentity & {
    domain: "board";
  };
  identity: DiscordOSBoardCardIdentity;
  currentState: DiscordOSBoardCardState;
  latestTransition: DiscordOSBoardCardTransition | null;
  publicationThreadId: string | null;
  forbiddenBehaviors: string[];
}

export type DiscordOSBoardCardEventEnvelope =
  DiscordOSDataEventEnvelope<DiscordOSBoardCardTransition>;
