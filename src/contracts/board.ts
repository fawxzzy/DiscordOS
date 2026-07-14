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
  | "intake"
  | "planning"
  | "ready"
  | "opened"
  | "in_progress"
  | "review"
  | "blocked"
  | "completed"
  | "archived"
  | "closed";

export type DiscordOSBoardCardJournalKind =
  | "admitted"
  | "started"
  | "checkpoint"
  | "discovery"
  | "blocker"
  | "review"
  | "completed"
  | "correction";

export interface DiscordOSBoardCardSnapshot {
  id: string;
  project: string;
  sourceForumChannelId: string;
  threadId: string | null;
  title: string;
  type: DiscordOSBoardCardKind;
  state: DiscordOSBoardCardState;
  previousState?: DiscordOSBoardCardState;
  priority: string;
  owner: string;
  progress: string;
  summary: string;
  objective: string;
  acceptanceCriteria: string[];
  discoveries: string[];
  nextActions: string[];
  blockers: string[];
  evidence: string[];
}

export interface DiscordOSBoardCardJournalEntry {
  kind: DiscordOSBoardCardJournalKind;
  headline: string;
  completed: string[];
  discovered: string[];
  next: string[];
  blockers: string[];
  evidence: string[];
}

export interface DiscordOSBoardCardJournalEvent {
  schemaVersion: "atlas.board-card-journal.v1";
  eventId: string;
  occurredAt: string;
  actor: string;
  card: DiscordOSBoardCardSnapshot;
  entry: DiscordOSBoardCardJournalEntry;
  correlation: {
    taskId: string | null;
    jobId: string | null;
    branch: string | null;
    commit: string | null;
    receipt: string | null;
  };
  transition?: DiscordOSAuthorizedBoardCardTransition;
}

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

export interface DiscordOSAuthorizedBoardCardTransition
  extends DiscordOSBoardCardTransition {
  eventId: string;
  threadId?: string;
  authorized: true;
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

export type DiscordOSBoardCardPersistenceStatus =
  | "contract_only"
  | "admitted_for_schema"
  | "shadow_storage"
  | "active_storage";

export interface DiscordOSBoardCardPersistenceContract {
  contract: DiscordOSDataContractIdentity & {
    domain: "board";
    storageSurface: "discordos_supabase" | "none";
  };
  status: DiscordOSBoardCardPersistenceStatus;
  tableName: string | null;
  idempotencyKeyField: "cardId";
  requiredIndexes: string[];
  retentionClass: "product_state";
  proof: DiscordOSDataProofContract;
  forbiddenBehaviors: string[];
}

export type DiscordOSBoardCardSchemaAdmissionStatus =
  | "planning_ready"
  | "migration_drafted"
  | "migration_applied";

export interface DiscordOSBoardCardSchemaAdmissionPlan {
  contract: DiscordOSDataContractIdentity & {
    domain: "board";
    storageSurface: "discordos_supabase";
  };
  status: DiscordOSBoardCardSchemaAdmissionStatus;
  tableName: "discordos_board_cards";
  requiredColumns: string[];
  requiredIndexes: string[];
  idempotencyKeyField: "cardId";
  migrationAllowed: false;
  storageWritesAllowed: false;
  proof: DiscordOSDataProofContract;
  forbiddenBehaviors: string[];
}

export interface DiscordOSBoardCardShadowPersistencePlan {
  contract: DiscordOSDataContractIdentity & {
    domain: "board";
    storageSurface: "discordos_supabase";
  };
  status: "shadow_ready";
  tableName: "discordos_board_cards";
  idempotencyKeyField: "cardId";
  retentionClass: "product_state";
  storageWritesAllowed: false;
  schemaMigrationAllowed: false;
  liveBehaviorAllowed: false;
  proof: DiscordOSDataProofContract;
  forbiddenBehaviors: string[];
}

export type DiscordOSBoardCardEventEnvelope =
  DiscordOSDataEventEnvelope<DiscordOSBoardCardTransition>;
