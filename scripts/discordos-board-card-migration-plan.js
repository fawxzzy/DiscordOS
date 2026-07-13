const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");
const {
  _internals: journal,
} = require("./discordos-board-card-journal");
const {
  _internals: consistency,
} = require("./discordos-board-card-consistency");

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = {
    boardsPath: null,
    fitnessExportPath: null,
    mazerBoardPath: null,
    outputPath: null,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--boards") {
      options.boardsPath = path.resolve(readValue(args, index, "missing_boards_path"));
      index += 1;
    } else if (arg === "--fitness-export") {
      options.fitnessExportPath = path.resolve(readValue(args, index, "missing_fitness_export_path"));
      index += 1;
    } else if (arg === "--mazer-board") {
      options.mazerBoardPath = path.resolve(readValue(args, index, "missing_mazer_board_path"));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.boardsPath) throw new Error("boards_path_missing");
  return options;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function values(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function normalizeTitle(value) {
  return text(value)
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function threadIdFromUrl(value) {
  const match = text(value).match(/\/([0-9]+)\/?$/);
  return match?.[1] || null;
}

function firstUsefulLine(value) {
  const lines = text(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => !line.startsWith("#") && !line.startsWith("-") && !line.startsWith("Roadmap Type:")) || lines[0] || "";
}

function mapFitnessState(card, boardRole) {
  if (boardRole === "completed") return "completed";
  if (card?.status === "fawxzzy_review") return "review";
  if (card?.status === "confirmed") return "planning";
  if (card?.status === "new") return "intake";
  if (card?.status === "fixed") return "review";
  return "planning";
}

function mapMazerState(card, boardRole) {
  if (boardRole === "completed") return "completed";
  if (card?.state === "completed") return "completed";
  if (card?.state === "backlog") return "planning";
  if (card?.state === "blocked") return "blocked";
  if (Number(card?.completionPercent) >= 85) return "review";
  return "in_progress";
}

function fitnessProject(card) {
  const area = text(card?.area).toLowerCase();
  const title = text(card?.title).toLowerCase();
  if (area.includes("fawx den") || area.includes("music") || title.includes("music sesh") || area.includes("discord")) {
    return "DiscordOS";
  }
  return "Fitness";
}

function fitnessDisplayTitle(card) {
  const kind = text(card?.report_type_label) || "Feature";
  const area = text(card?.area);
  return area ? `${kind}: ${area} — ${text(card?.title)}` : `${kind}: ${text(card?.title)}`;
}

function normalizeFitnessSource(card) {
  const project = fitnessProject(card);
  const cardId = text(card?.card_id)
    || `${project.toLowerCase()}-${text(card?.short_id) || text(card?.id)}`;
  const sections = card?.card_sections || {};
  const latest = text(card?.latest_update_summary);
  const description = text(sections.description || card?.description);
  const summary = latest || firstUsefulLine(description) || text(card?.title);
  return {
    sourceType: "fitness_export",
    cardId,
    project,
    sourceThreadId: threadIdFromUrl(card?.forum_thread_link),
    title: fitnessDisplayTitle(card),
    plainTitle: text(card?.title),
    type: text(card?.report_type) || "feature",
    rawState: text(card?.status),
    priority: text(card?.card_priority) || "Unspecified",
    owner: project,
    progress: card?.status === "fixed" ? "Review required" : card?.status === "fawxzzy_review" ? "Review" : "Unmeasured",
    summary,
    objective: text(sections.user_story) || firstUsefulLine(description) || summary,
    acceptanceCriteria: values(sections.acceptance_criteria),
    discoveries: latest ? [latest] : [],
    nextActions: card?.status === "fawxzzy_review" || card?.status === "fixed"
      ? ["Operator manual review before terminal completion transfer"]
      : card?.status === "confirmed"
        ? ["Advance planning only when external dependencies are available"]
        : ["Confirm priority and next implementation slice"],
    blockers: card?.status === "confirmed" && latest ? [latest] : [],
    evidence: [text(sections.evidence_summary), latest].filter(Boolean),
  };
}

function normalizeMazerSource(card) {
  return {
    sourceType: "mazer_board",
    cardId: text(card?.id),
    project: "Mazer",
    sourceThreadId: text(card?.liveThreadId) || null,
    title: text(card?.title),
    plainTitle: text(card?.title).replace(/^mazer:\s*/i, ""),
    type: text(card?.category).toLowerCase().includes("bug") ? "bug" : "feature",
    rawState: text(card?.state),
    priority: text(card?.priority) || "Unspecified",
    owner: "Mazer",
    progress: Number.isFinite(Number(card?.completionPercent)) ? `${Number(card.completionPercent)}%` : "Unmeasured",
    summary: text(card?.summary) || text(card?.title),
    objective: text(card?.whyItMatters) || text(card?.summary) || text(card?.title),
    acceptanceCriteria: values(card?.acceptanceCriteria),
    discoveries: text(card?.currentStatus) ? [text(card.currentStatus)] : [],
    nextActions: values(card?.nextActions),
    blockers: text(card?.state) === "blocked" ? [text(card?.currentStatus) || "Blocked"] : [],
    evidence: values(card?.proofPlan),
  };
}

function sourceTitleMatches(threadTitle, source) {
  const live = normalizeTitle(threadTitle);
  const full = normalizeTitle(source.title);
  const plain = normalizeTitle(source.plainTitle);
  return live === full || (plain.length >= 12 && (live === plain || live.endsWith(` ${plain}`)));
}

function selectSource({ thread, boardRole, sources, existingCardId }) {
  if (existingCardId) {
    const byId = sources.filter((source) => source.cardId.toLowerCase() === existingCardId.toLowerCase());
    if (byId.length === 1) return { source: byId[0], matchedBy: "stable_card_id", reasonCodes: [] };
  }
  const byThread = sources.filter((source) => source.sourceThreadId === thread.id);
  if (byThread.length === 1) return { source: byThread[0], matchedBy: "source_thread_id", reasonCodes: [] };
  if (byThread.length > 1) return { source: null, matchedBy: null, reasonCodes: ["source_thread_identity_ambiguous"] };
  if (boardRole === "completed") {
    const byTitle = sources.filter((source) => sourceTitleMatches(thread.name, source));
    if (byTitle.length === 1) return { source: byTitle[0], matchedBy: "unique_source_title", reasonCodes: [] };
    if (byTitle.length > 1) return { source: null, matchedBy: null, reasonCodes: ["source_title_identity_ambiguous"] };
  }
  return { source: null, matchedBy: "thread_fallback", reasonCodes: [] };
}

function fallbackSource({ board, thread, starter }) {
  const existingState = consistency.parseCardState(starter?.content);
  const state = board.role === "completed" ? "completed" : existingState || "planning";
  return {
    sourceType: "thread_fallback",
    cardId: `legacy-${board.id}-${thread.id}`,
    project: text(board.project) || board.id,
    sourceThreadId: thread.id,
    title: thread.name,
    plainTitle: thread.name,
    type: /^bug:/i.test(thread.name) ? "bug" : "feature",
    rawState: state,
    priority: "Unspecified",
    owner: text(board.project) || board.id,
    progress: state === "completed" ? "100%" : "Unmeasured",
    summary: firstUsefulLine(starter?.content) || thread.name,
    objective: "Preserve and normalize this historical board card without inventing unverified scope.",
    acceptanceCriteria: ["Legacy content remains available inside the card", "Future work uses stable identity and journal checkpoints"],
    discoveries: [],
    nextActions: state === "completed" ? ["Retain for historical review"] : ["Reconcile with an owner-project source when evidence becomes available"],
    blockers: [],
    evidence: ["Migrated from the live Discord forum thread"],
  };
}

function buildMigrationEvent({ board, thread, source, guildId, existingContent = "" }) {
  const state = source.sourceType === "fitness_export"
    ? mapFitnessState({ status: source.rawState }, board.role)
    : source.sourceType === "mazer_board"
      ? mapMazerState({ state: source.rawState, completionPercent: Number.parseInt(source.progress, 10) }, board.role)
      : board.role === "completed" ? "completed" : source.rawState;
  const completedCardUrl = existingContent.match(/ATLAS-COMPLETED-CARD:\s*(https:\/\/discord\.com\/channels\/[^\s]+)/i)?.[1] || null;
  const sourceCardUrl = board.role === "completed"
    && source.sourceThreadId
    && source.sourceThreadId !== thread.id
    ? `https://discord.com/channels/${guildId}/${source.sourceThreadId}`
    : null;
  const sourceCardEvidence = board.role === "completed"
    ? sourceCardUrl
      ? `original card: ${sourceCardUrl}`
      : "original card: source thread unavailable in retained source data"
    : null;
  const evidence = [
    ...source.evidence,
    completedCardUrl ? `completed card: ${completedCardUrl}` : null,
    sourceCardEvidence,
  ].filter(Boolean);
  return {
    schemaVersion: "atlas.board-card-journal.v1",
    eventId: `migration:${board.id}:${thread.id}:v1`,
    occurredAt: new Date().toISOString(),
    actor: "discordos.board-migration",
    card: {
      id: source.cardId,
      project: source.project,
      sourceForumChannelId: board.forumChannelId,
      threadId: thread.id,
      title: thread.name,
      type: source.type,
      state,
      priority: source.priority,
      owner: source.owner,
      progress: source.progress,
      summary: source.summary,
      objective: source.objective,
      acceptanceCriteria: source.acceptanceCriteria,
      discoveries: source.discoveries,
      nextActions: source.nextActions,
      blockers: source.blockers,
      evidence,
    },
    entry: {
      kind: "correction",
      headline: "Historical card normalized",
      completed: ["Assigned stable card identity", "Refreshed the canonical starter summary", "Preserved the pre-contract starter body in the card thread"],
      discovered: source.discoveries,
      next: source.nextActions,
      blockers: source.blockers,
      evidence,
    },
    correlation: {
      taskId: "ATLAS-MIGRATION-BOARD-JOURNAL-V1",
      jobId: null,
      branch: null,
      commit: null,
      receipt: null,
    },
  };
}

async function buildMigrationPlan({ boards, fitnessCards = [], mazerCards = [], env = process.env, fetchImpl = fetch } = {}) {
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  const reasonCodes = [];
  if (!token) reasonCodes.push("discord_bot_token_missing");
  const sources = [
    ...fitnessCards.map(normalizeFitnessSource),
    ...mazerCards.map(normalizeMazerSource),
  ].filter((source) => source.cardId);
  const events = [];
  const rows = [];
  for (const board of boards || []) {
    const channel = await cardContract.discordRequest({ path: `/channels/${board.forumChannelId}`, token, fetchImpl });
    if (!channel.ok || !channel.payload?.guild_id) {
      reasonCodes.push(`board_forum_read_failed:${board.id}`);
      continue;
    }
    const inventory = await journal.listForumThreads({
      forumChannelId: board.forumChannelId,
      guildId: channel.payload.guild_id,
      token,
      fetchImpl,
    });
    reasonCodes.push(...inventory.reasonCodes.map((code) => `${code}:${board.id}`));
    for (const thread of inventory.threads) {
      const starter = await cardContract.fetchMessage({ channelId: thread.id, messageId: thread.id, token, fetchImpl });
      if (!starter.ok) {
        reasonCodes.push(`card_starter_read_failed:${thread.id}`);
        continue;
      }
      const existingCardId = consistency.parseCardId(starter.payload?.content);
      const selected = selectSource({ thread, boardRole: board.role, sources, existingCardId });
      if (selected.reasonCodes.length > 0) {
        rows.push({ boardId: board.id, threadId: thread.id, title: thread.name, eventCreated: false, reasonCodes: selected.reasonCodes });
        reasonCodes.push(...selected.reasonCodes.map((code) => `${code}:${thread.id}`));
        continue;
      }
      const source = selected.source || fallbackSource({ board, thread, starter: starter.payload });
      const event = buildMigrationEvent({
        board,
        thread,
        source,
        guildId: channel.payload.guild_id,
        existingContent: starter.payload?.content,
      });
      events.push(event);
      rows.push({
        boardId: board.id,
        threadId: thread.id,
        title: thread.name,
        cardId: event.card.id,
        project: event.card.project,
        state: event.card.state,
        matchedBy: selected.matchedBy,
        sourceType: source.sourceType,
        eventCreated: true,
        reasonCodes: [],
      });
    }
  }
  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "planned" : "blocked",
    schemaVersion: "atlas.board-card-migration-plan.v1",
    generatedAt: new Date().toISOString(),
    boardCount: (boards || []).length,
    sourceCount: sources.length,
    eventCount: events.length,
    fallbackIdentityCount: rows.filter((row) => row.sourceType === "thread_fallback").length,
    rows,
    events,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const boardPayload = JSON.parse(await fs.readFile(options.boardsPath, "utf8"));
  const fitnessCards = options.fitnessExportPath
    ? JSON.parse(await fs.readFile(options.fitnessExportPath, "utf8"))
    : [];
  const mazerPayload = options.mazerBoardPath
    ? JSON.parse(await fs.readFile(options.mazerBoardPath, "utf8"))
    : { cards: [] };
  const result = await buildMigrationPlan({
    boards: boardPayload.boards || [],
    fitnessCards: Array.isArray(fitnessCards) ? fitnessCards : fitnessCards.cards || [],
    mazerCards: mazerPayload.cards || [],
  });
  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${JSON.stringify({ events: result.events }, null, 2)}\n`, "utf8");
  }
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.status}: ${result.eventCount} events\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  _internals: {
    parseArgs,
    normalizeTitle,
    threadIdFromUrl,
    firstUsefulLine,
    mapFitnessState,
    mapMazerState,
    fitnessDisplayTitle,
    normalizeFitnessSource,
    normalizeMazerSource,
    sourceTitleMatches,
    selectSource,
    fallbackSource,
    buildMigrationEvent,
    buildMigrationPlan,
  },
};
