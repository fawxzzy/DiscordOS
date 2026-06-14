export type DiscordOSDataDomain =
  | "feedback"
  | "publication"
  | "moderation"
  | "music_sesh"
  | "board"
  | "operator";

export type DiscordOSDataOwner =
  | "discordos"
  | "fitness"
  | "atlas"
  | "external";

export type DiscordOSDataLifecycle =
  | "contract_only"
  | "shadow"
  | "active"
  | "archived";

export type DiscordOSDataStorageSurface =
  | "discordos_supabase"
  | "discord_api"
  | "atlas_docs"
  | "atlas_runtime"
  | "external_runtime"
  | "none";

export type DiscordOSDataProofStrength =
  | "none"
  | "local_contract"
  | "shadow_runtime"
  | "live_runtime"
  | "human_verified";

export interface DiscordOSDataContractIdentity {
  domain: DiscordOSDataDomain;
  entityName: string;
  schemaVersion: number;
  owner: DiscordOSDataOwner;
  lifecycle: DiscordOSDataLifecycle;
  sourceSystem: DiscordOSDataOwner;
  storageSurface: DiscordOSDataStorageSurface;
}

export interface DiscordOSDataFieldContract {
  name: string;
  type: string;
  required: boolean;
  nullable: boolean;
  pii: boolean;
  description: string;
}

export interface DiscordOSDataProofContract {
  strength: DiscordOSDataProofStrength;
  receiptPath: string | null;
  messageId: string | null;
  generatedAt: string | null;
}

export interface DiscordOSDataContract {
  identity: DiscordOSDataContractIdentity;
  fields: DiscordOSDataFieldContract[];
  proof: DiscordOSDataProofContract;
  migrationNotes: string[];
  forbiddenBehaviors: string[];
}

export interface DiscordOSDataEventEnvelope<TPayload = unknown> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  producer: string;
  contract: DiscordOSDataContractIdentity;
  payload: TPayload;
  proof: DiscordOSDataProofContract;
  idempotencyKey: string | null;
}

export interface DiscordOSDataContractRegistry {
  version: 1;
  contracts: DiscordOSDataContract[];
}
