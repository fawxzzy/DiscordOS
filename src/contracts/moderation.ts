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

export type DiscordOSModerationAuditLogSchemaAdmissionStatus =
  | "planning_ready"
  | "migration_drafted"
  | "migration_applied";

export interface DiscordOSModerationAuditLogSchemaAdmissionPlan {
  contract: DiscordOSDataContractIdentity & {
    domain: "moderation";
    storageSurface: "discordos_supabase";
  };
  status: DiscordOSModerationAuditLogSchemaAdmissionStatus;
  tableName: "discordos_moderation_audit_log";
  requiredColumns: string[];
  requiredIndexes: string[];
  idempotencyKeyField: "caseId";
  migrationAllowed: false;
  storageWritesAllowed: false;
  proof: DiscordOSDataProofContract;
  forbiddenBehaviors: string[];
}

export interface DiscordOSModerationAuditShadowPersistenceAdmission {
  contract: DiscordOSDataContractIdentity & {
    domain: "moderation";
    storageSurface: "discordos_supabase";
  };
  status: "shadow_ready";
  tableName: "discordos_moderation_audit_log";
  idempotencyKeyField: "caseId";
  storageWritesAllowed: false;
  schemaMigrationAllowed: false;
  liveModerationAllowed: false;
  proof: DiscordOSDataProofContract;
  forbiddenBehaviors: string[];
}

export type DiscordOSModerationEventEnvelope =
  DiscordOSDataEventEnvelope<DiscordOSModerationAction>;
