import type {
  DiscordOSDataContractIdentity,
  DiscordOSDataEventEnvelope,
  DiscordOSDataProofContract,
} from "./data";

export type DiscordOSMusicSeshSessionStatus =
  | "draft"
  | "open"
  | "locked"
  | "completed"
  | "archived";

export type DiscordOSMusicSeshQueueItemStatus =
  | "queued"
  | "upvoted"
  | "skipped"
  | "played"
  | "removed";

export interface DiscordOSMusicSeshSessionIdentity {
  sessionId: string;
  guildId: string;
  channelId: string;
  hostDiscordUserId: string;
  openedAt: string;
}

export interface DiscordOSMusicSeshQueueItem {
  sessionId: string;
  itemId: string;
  title: string;
  sourceUrl: string | null;
  submittedByDiscordUserId: string;
  status: DiscordOSMusicSeshQueueItemStatus;
  submittedAt: string;
  proof: DiscordOSDataProofContract;
}

export interface DiscordOSMusicSeshVote {
  sessionId: string;
  itemId: string;
  voterDiscordUserId: string;
  direction: "up" | "down";
  occurredAt: string;
  proof: DiscordOSDataProofContract;
}

export interface DiscordOSMusicSeshContract {
  contract: DiscordOSDataContractIdentity & {
    domain: "music_sesh";
  };
  session: DiscordOSMusicSeshSessionIdentity;
  status: DiscordOSMusicSeshSessionStatus;
  queueItems: DiscordOSMusicSeshQueueItem[];
  latestVote: DiscordOSMusicSeshVote | null;
  forbiddenBehaviors: string[];
}

export type DiscordOSMusicSeshEventEnvelope =
  DiscordOSDataEventEnvelope<DiscordOSMusicSeshQueueItem | DiscordOSMusicSeshVote>;
