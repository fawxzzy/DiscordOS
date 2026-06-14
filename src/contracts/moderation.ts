import type {
  DiscordOSDataContractIdentity,
  DiscordOSDataEventEnvelope,
  DiscordOSDataProofContract,
} from "./data";

export type DiscordOSModerationCaseStatus =
  | "open"
  | "triaged"
  | "actioned"
  | "appealed"
  | "closed";

export type DiscordOSModerationActionType =
  | "note"
  | "warn"
  | "timeout"
  | "remove_content"
  | "escalate"
  | "close";

export interface DiscordOSModerationCaseIdentity {
  caseId: string;
  guildId: string;
  channelId: string | null;
  subjectDiscordUserId: string;
  openedAt: string;
}

export interface DiscordOSModerationCaseState {
  identity: DiscordOSModerationCaseIdentity;
  status: DiscordOSModerationCaseStatus;
  reason: string;
  latestActionAt: string | null;
  assignedDiscordUserId: string | null;
}

export interface DiscordOSModerationAction {
  caseId: string;
  actionType: DiscordOSModerationActionType;
  actorDiscordUserId: string;
  note: string | null;
  occurredAt: string;
  proof: DiscordOSDataProofContract;
}

export interface DiscordOSModerationContract {
  contract: DiscordOSDataContractIdentity & {
    domain: "moderation";
  };
  caseState: DiscordOSModerationCaseState;
  latestAction: DiscordOSModerationAction | null;
  forbiddenBehaviors: string[];
}

export type DiscordOSModerationEventEnvelope =
  DiscordOSDataEventEnvelope<DiscordOSModerationAction>;
