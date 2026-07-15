const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { _internals: textIntegrity } = require("./discordos-board-text-integrity");

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");
const OWNER_EXPORT_CONTRACT = "atlas.project-board.owner-export.v1";
const BATCH_CONTRACT = "atlas.board-card-journal.batch.v1";
const TERMINAL_LIFECYCLES = new Set(["completed", "archived", "closed"]);
const LIFECYCLE_MAP = new Map([
  ["intake", "intake"],
  ["planning", "planning"],
  ["ready", "ready"],
  ["opened", "opened"],
  ["in-progress", "in_progress"],
  ["in_progress", "in_progress"],
  ["review", "review"],
  ["blocked", "blocked"],
]);

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = { registryPath: DEFAULT_REGISTRY_PATH, exportPaths: [], outputPath: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--registry") {
      options.registryPath = path.resolve(readValue(args, index, "missing_registry_value"));
      index += 1;
    } else if (arg === "--owner-export") {
      options.exportPaths.push(path.resolve(readValue(args, index, "missing_owner_export_value")));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_value"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (options.exportPaths.length === 0) throw new Error("owner_export_path_missing");
  if (!options.outputPath) throw new Error("output_path_missing");
  return options;
}

function text(value) {
  return typeof value === "string" ? textIntegrity.classifyText(value).normalizedText.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function activeBoardByProject(registry) {
  const result = new Map();
  for (const board of (registry?.boards || []).filter((candidate) => candidate?.required === true && candidate?.role === "active" && candidate?.status === "enabled")) {
    for (const key of [board.project, board.stableCardNamespace]) {
      if (text(key)) result.set(text(key).toLowerCase(), board);
    }
  }
  return result;
}

function validateExport({ ownerExport, registry, seenCardIds }) {
  const reasonCodes = [];
  if (ownerExport?.contract_version !== OWNER_EXPORT_CONTRACT) reasonCodes.push("owner_export_contract_unsupported");
  if (!text(ownerExport?.project_id)) reasonCodes.push("owner_export_project_id_missing");
  if (!text(ownerExport?.adapter_id)) reasonCodes.push("owner_export_adapter_id_missing");
  if (!Array.isArray(ownerExport?.cards)) reasonCodes.push("owner_export_cards_missing");

  const board = activeBoardByProject(registry).get(text(ownerExport?.project_id).toLowerCase()) || null;
  if (!board) reasonCodes.push("owner_export_enabled_board_missing");
  if (board && board.sourceAdapter !== ownerExport.adapter_id) reasonCodes.push("owner_export_adapter_mismatch");
  if (board && !text(board.forumChannelId)) reasonCodes.push("owner_export_forum_channel_missing");
  const expectedBoardId = board ? `discordos:project-feedback:${text(board.stableCardNamespace)}` : null;
  if (expectedBoardId && text(ownerExport?.board_id) !== expectedBoardId) reasonCodes.push("owner_export_board_id_mismatch");

  const textFindings = textIntegrity.inspectObjectText(ownerExport);
  if (textFindings.length > 0) reasonCodes.push("owner_export_text_integrity_failed");

  const idempotencyKeys = new Set();
  for (const card of ownerExport?.cards || []) {
    const cardId = text(card?.record?.card_id).toLowerCase();
    if (!cardId) reasonCodes.push("owner_export_card_id_missing");
    else if (seenCardIds.has(cardId)) reasonCodes.push(`owner_export_card_id_duplicate:${cardId}`);
    else seenCardIds.add(cardId);
    const idempotencyKey = text(card?.idempotency_key);
    if (!idempotencyKey) reasonCodes.push(`owner_export_idempotency_key_missing:${cardId || "unknown"}`);
    else if (idempotencyKeys.has(idempotencyKey)) reasonCodes.push(`owner_export_idempotency_key_duplicate:${idempotencyKey}`);
    else idempotencyKeys.add(idempotencyKey);
    if (text(card?.record?.project_id).toLowerCase() !== text(ownerExport?.project_id).toLowerCase()) {
      reasonCodes.push(`owner_export_card_project_mismatch:${cardId || "unknown"}`);
    }
    if (!text(card?.record?.title)) reasonCodes.push(`owner_export_card_title_missing:${cardId || "unknown"}`);
    if (expectedBoardId && text(card?.record?.board_id) !== expectedBoardId) {
      reasonCodes.push(`owner_export_card_board_mismatch:${cardId || "unknown"}`);
    }
    if (!text(card?.content?.summary)) reasonCodes.push(`owner_export_card_summary_missing:${cardId || "unknown"}`);
    const lifecycle = text(card?.record?.lifecycle).toLowerCase();
    if (!TERMINAL_LIFECYCLES.has(lifecycle) && !LIFECYCLE_MAP.has(lifecycle)) {
      reasonCodes.push(`owner_export_card_lifecycle_unsupported:${cardId || "unknown"}`);
    }
  }
  if (ownerExport?.adapter_id === "socials-os-roadmap-v1") {
    if ((ownerExport.cards || []).length !== 13) reasonCodes.push("socials_owner_export_event_count_mismatch");
    if (ownerExport?.extensions?.selection?.roadmap_record_count !== 22) reasonCodes.push("socials_owner_export_stable_record_count_mismatch");
    if (ownerExport?.extensions?.selection?.exported_nonterminal_count !== 13) reasonCodes.push("socials_owner_export_nonterminal_count_mismatch");
  }
  return { board, reasonCodes: [...new Set(reasonCodes)].sort() };
}

function eventId(ownerExport, card) {
  const material = `${ownerExport.export_id}\n${card.idempotency_key}\n${card.record.card_id}`;
  return `owner-seed-${text(ownerExport.project_id).toLowerCase()}-${crypto.createHash("sha256").update(material).digest("hex").slice(0, 20)}`;
}

function toJournalEvent({ ownerExport, card, board }) {
  const lifecycle = text(card.record.lifecycle).toLowerCase();
  return {
    schemaVersion: "atlas.board-card-journal.v1",
    eventId: eventId(ownerExport, card),
    occurredAt: text(card.record.updated_at) || text(ownerExport.generated_at),
    actor: `owner-export:${text(ownerExport.owner) || text(ownerExport.project_id)}`,
    card: {
      id: text(card.record.card_id),
      project: text(card.record.project_id),
      sourceForumChannelId: text(board.forumChannelId),
      threadId: null,
      title: text(card.record.title),
      type: text(card.record.card_type) || "feature",
      state: LIFECYCLE_MAP.get(lifecycle),
      previousState: null,
      priority: card.record.priority == null ? "Unspecified" : text(card.record.priority),
      owner: text(card.record.owner) || text(ownerExport.owner) || "Unassigned",
      progress: "Unmeasured",
      summary: text(card.content.summary),
      objective: text(card.content.objective) || text(card.content.summary),
      acceptanceCriteria: list(card.content.acceptance_criteria),
      discoveries: list(card.content.discoveries),
      nextActions: list(card.content.next_actions),
      blockers: list(card.content.blockers),
      evidence: [...new Set([text(card.record.source_ref), ...list(card.content.evidence)].filter(Boolean))],
    },
    entry: {
      kind: "owner_export_seed",
      headline: "Owner export admitted to the project board",
      completed: [],
      discovered: list(card.content.discoveries),
      next: list(card.content.next_actions),
      blockers: list(card.content.blockers),
      evidence: [...new Set([text(ownerExport.export_id), text(ownerExport.source_revision), text(card.record.source_ref)].filter(Boolean))],
    },
    correlation: {
      taskId: null,
      jobId: null,
      branch: null,
      commit: null,
      receipt: text(ownerExport.export_id),
    },
  };
}

function buildOwnerSeedBatch({ registry, ownerExports }) {
  if (registry?.schemaVersion !== "discordos.board-registry.v1") throw new Error("board_registry_invalid");
  const reasonCodes = [];
  const events = [];
  const excluded = [];
  const sources = [];
  const seenCardIds = new Set();

  for (const ownerExport of [...ownerExports].sort((left, right) => text(left.project_id).localeCompare(text(right.project_id)))) {
    const validation = validateExport({ ownerExport, registry, seenCardIds });
    reasonCodes.push(...validation.reasonCodes);
    sources.push({
      projectId: text(ownerExport.project_id),
      exportId: text(ownerExport.export_id),
      adapterId: text(ownerExport.adapter_id),
      sourceRevision: text(ownerExport.source_revision),
      cardCount: Array.isArray(ownerExport.cards) ? ownerExport.cards.length : 0,
    });
    if (validation.reasonCodes.length > 0 || !validation.board) continue;
    for (const card of ownerExport.cards) {
      const lifecycle = text(card.record.lifecycle).toLowerCase();
      if (TERMINAL_LIFECYCLES.has(lifecycle)) {
        excluded.push({ projectId: text(ownerExport.project_id), cardId: text(card.record.card_id), lifecycle, reason: "terminal_owner_history" });
        continue;
      }
      events.push(toJournalEvent({ ownerExport, card, board: validation.board }));
    }
  }

  events.sort((left, right) => left.card.project.localeCompare(right.card.project) || left.card.id.localeCompare(right.card.id));
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "seed_batch_ready" : "blocked",
    destructive: false,
    sendsMessages: false,
    mutatesDiscord: false,
    schemaVersion: BATCH_CONTRACT,
    sourceCount: sources.length,
    eventCount: events.length,
    excludedCount: excluded.length,
    sources,
    excluded,
    events,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}

async function readJson(filePath, fsImpl = fs) {
  return JSON.parse((await fsImpl.readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
}

async function buildOwnerSeedBatchFromPaths({ registryPath, exportPaths, fsImpl = fs }) {
  const registry = await readJson(registryPath, fsImpl);
  const ownerExports = [];
  for (const exportPath of exportPaths) ownerExports.push(await readJson(exportPath, fsImpl));
  return buildOwnerSeedBatch({ registry, ownerExports });
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Project Board Owner Seed",
    "",
    `- status: \`${result.status}\``,
    `- sources: \`${result.sourceCount}\``,
    `- journal events: \`${result.eventCount}\``,
    `- excluded terminal history: \`${result.excludedCount}\``,
    `- Discord mutation: \`false\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildOwnerSeedBatchFromPaths(options);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, output, "utf8");
  process.stdout.write(options.json ? output : renderMarkdown(result));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

module.exports = { _internals: {
  DEFAULT_REGISTRY_PATH,
  OWNER_EXPORT_CONTRACT,
  BATCH_CONTRACT,
  TERMINAL_LIFECYCLES,
  LIFECYCLE_MAP,
  parseArgs,
  activeBoardByProject,
  validateExport,
  eventId,
  toJournalEvent,
  buildOwnerSeedBatch,
  buildOwnerSeedBatchFromPaths,
  renderMarkdown,
} };
