const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_BOARD_PATH = path.resolve(process.cwd(), "config", "discordos-mazer-feedback-board.json");
const STATES = new Set(["open", "ready", "blocked", "completed", "backlog"]);
const PRIORITIES = new Set(["low", "medium", "high"]);
const REACTION_STATUSES = new Set(["success", "failure"]);
const STATUS_REACTIONS = {
  success: {
    name: "success",
    id: "1507384062166302851",
  },
  failure: {
    name: "failure",
    id: "1507384094424694785",
  },
};
const EXPECTED_BOARD_ID = "mazer";
const EXPECTED_BOARD_LABEL = "mazer";
const EXPECTED_PLACEMENT_FAMILY = "project-feedback";
const EXPECTED_EPIC_IDS = [
  "core-gameplay",
  "feel-and-polish",
  "progression-systems",
  "maze-systems",
  "player-systems",
  "online-and-social",
  "telemetry-and-analytics",
  "ai-systems",
  "dev-platform-integration",
];

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    boardPath: DEFAULT_BOARD_PATH,
    cardId: null,
    state: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--board") {
      options.boardPath = path.resolve(readValue(args, index, "missing_board_value"));
      index += 1;
    } else if (arg === "--card-id") {
      options.cardId = readValue(args, index, "missing_card_id_value");
      index += 1;
    } else if (arg === "--state") {
      options.state = readValue(args, index, "missing_state_value");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function readBoard(boardPath = DEFAULT_BOARD_PATH, fsImpl = fs) {
  const raw = await fsImpl.readFile(boardPath, "utf8");
  return JSON.parse(raw);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildMazerBoardPlanning(board) {
  const reasonCodes = [];
  const planning = board?.board?.planning;
  const cards = Array.isArray(board?.cards) ? board.cards : [];
  const cardIds = new Set(cards.map((card) => card?.id).filter(hasText));
  const hasReadyCards = cards.some((card) => card?.state === "ready");
  const epics = Array.isArray(planning?.epics) ? planning.epics : [];
  const primaryEpicByCard = {};
  const supportingEpicIdsByCard = {};
  const dependsOnCardIdsByCard = {};

  if (planning?.version !== 1) {
    reasonCodes.push("board_planning_version_invalid");
  }
  if (
    planning?.activeCardId !== null
    && (!hasText(planning?.activeCardId) || !cardIds.has(planning.activeCardId))
  ) {
    reasonCodes.push("board_planning_active_card_invalid");
  }
  if (planning?.activeCardId === null && hasReadyCards) {
    reasonCodes.push("board_planning_active_card_missing_for_ready_work");
  }
  if (epics.length !== EXPECTED_EPIC_IDS.length) {
    reasonCodes.push("board_planning_epic_count_invalid");
  }

  const seenEpicIds = new Set();
  for (const [index, epic] of epics.entries()) {
    if (!hasText(epic?.id) || seenEpicIds.has(epic.id)) {
      reasonCodes.push("board_planning_epic_id_invalid");
      continue;
    }
    seenEpicIds.add(epic.id);
    if (epic.id !== EXPECTED_EPIC_IDS[index] || epic.order !== index + 1 || !hasText(epic.title)) {
      reasonCodes.push("board_planning_epic_order_invalid");
    }
    if (!Array.isArray(epic.primaryCardIds)) {
      reasonCodes.push("board_planning_epic_primary_cards_missing");
    }
    for (const cardId of Array.isArray(epic.primaryCardIds) ? epic.primaryCardIds : []) {
      if (!cardIds.has(cardId)) {
        reasonCodes.push("board_planning_unknown_primary_card");
      } else if (primaryEpicByCard[cardId]) {
        reasonCodes.push("board_planning_duplicate_primary_card");
      } else {
        primaryEpicByCard[cardId] = epic.id;
      }
    }
    for (const cardId of Array.isArray(epic.supportingCardIds) ? epic.supportingCardIds : []) {
      if (!cardIds.has(cardId)) {
        reasonCodes.push("board_planning_unknown_supporting_card");
        continue;
      }
      supportingEpicIdsByCard[cardId] = [
        ...(supportingEpicIdsByCard[cardId] || []),
        epic.id,
      ];
    }
  }

  for (const cardId of cardIds) {
    if (!primaryEpicByCard[cardId]) {
      reasonCodes.push("board_planning_primary_card_missing");
    }
  }

  const dependencies = Array.isArray(planning?.dependencies) ? planning.dependencies : [];
  const seenDependencyCards = new Set();
  for (const dependency of dependencies) {
    if (!cardIds.has(dependency?.cardId) || seenDependencyCards.has(dependency.cardId)) {
      reasonCodes.push("board_planning_dependency_card_invalid");
      continue;
    }
    seenDependencyCards.add(dependency.cardId);
    const dependencyIds = Array.isArray(dependency.dependsOnCardIds) ? dependency.dependsOnCardIds : [];
    if (
      dependencyIds.length === 0
      || dependencyIds.some((cardId) => !cardIds.has(cardId) || cardId === dependency.cardId)
      || !hasText(dependency.reason)
    ) {
      reasonCodes.push("board_planning_dependency_contract_invalid");
      continue;
    }
    dependsOnCardIdsByCard[dependency.cardId] = [...new Set(dependencyIds)];
  }

  const parallelTracks = Array.isArray(planning?.parallelTracks) ? planning.parallelTracks : [];
  for (const track of parallelTracks) {
    if (
      !hasText(track?.id)
      || track.criticalPath !== false
      || !Array.isArray(track.cardIds)
      || track.cardIds.length === 0
      || track.cardIds.some((cardId) => !cardIds.has(cardId))
    ) {
      reasonCodes.push("board_planning_parallel_track_invalid");
    }
  }

  return {
    ok: reasonCodes.length === 0,
    activeCardId: planning?.activeCardId || null,
    epicCount: epics.length,
    mappedCardCount: Object.keys(primaryEpicByCard).length,
    dependencyCount: dependencies.length,
    parallelTrackCount: parallelTracks.length,
    primaryEpicByCard,
    supportingEpicIdsByCard,
    dependsOnCardIdsByCard,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function classifyCard(card) {
  const reasonCodes = [];
  if (!card || !hasText(card.id)) {
    reasonCodes.push("card_id_missing");
  }
  if (!hasText(card.title)) {
    reasonCodes.push("card_title_missing");
  }
  if (!STATES.has(card.state)) {
    reasonCodes.push("card_state_invalid");
  }
  if (!PRIORITIES.has(card.priority)) {
    reasonCodes.push("card_priority_invalid");
  }
  if (!hasText(card.category)) {
    reasonCodes.push("card_category_missing");
  }
  const isBacklogCard = card?.state === "backlog";
  if (isBacklogCard) {
    if (hasText(card.markerName)) {
      reasonCodes.push("card_backlog_marker_name_present");
    }
    if (Object.prototype.hasOwnProperty.call(card, "completionPercent")) {
      reasonCodes.push("card_backlog_completion_percent_present");
    }
  } else {
    if (!hasText(card.markerName)) {
      reasonCodes.push("card_marker_name_missing");
    }
    if (!Number.isFinite(card.completionPercent) || card.completionPercent < 0 || card.completionPercent > 100) {
      reasonCodes.push("card_completion_percent_invalid");
    }
  }
  if (!hasText(card.reference)) {
    reasonCodes.push("card_reference_missing");
  }
  if (!hasText(card.nextCommand) || !card.nextCommand.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("card_next_command_invalid");
  }
  if (!hasText(card.summary)) {
    reasonCodes.push("card_summary_missing");
  }
  if (!hasText(card.whyItMatters)) {
    reasonCodes.push("card_why_it_matters_missing");
  }
  if (!hasText(card.currentStatus)) {
    reasonCodes.push("card_current_status_missing");
  }
  if (!Array.isArray(card.workBreakdown) || card.workBreakdown.length === 0 || card.workBreakdown.some((item) => !hasText(item))) {
    reasonCodes.push("card_work_breakdown_missing");
  }
  if (!Array.isArray(card.nextActions) || card.nextActions.length === 0 || card.nextActions.some((item) => !hasText(item))) {
    reasonCodes.push("card_next_actions_missing");
  }
  if (!Array.isArray(card.acceptanceCriteria) || card.acceptanceCriteria.length === 0 || card.acceptanceCriteria.some((item) => !hasText(item))) {
    reasonCodes.push("card_acceptance_criteria_missing");
  }
  if (!Array.isArray(card.proofPlan) || card.proofPlan.length === 0 || card.proofPlan.some((item) => !hasText(item))) {
    reasonCodes.push("card_proof_plan_missing");
  }
  if (card.state === "completed") {
    if (!hasText(card.liveThreadId)) {
      reasonCodes.push("card_live_thread_id_missing");
    }
    if (!hasText(card.liveMessageId)) {
      reasonCodes.push("card_live_message_id_missing");
    }
  }

  const expectedReactionStatus = card.state === "completed" ? "success" : "failure";
  if (!REACTION_STATUSES.has(card.reactionStatus) || card.reactionStatus !== expectedReactionStatus) {
    reasonCodes.push("card_reaction_status_invalid");
  }
  const expectedReaction = STATUS_REACTIONS[expectedReactionStatus];
  if (!expectedReaction || card.reactionEmojiName !== expectedReaction.name) {
    reasonCodes.push("card_reaction_emoji_name_invalid");
  }
  if (!expectedReaction || card.reactionEmojiId !== expectedReaction.id) {
    reasonCodes.push("card_reaction_emoji_id_invalid");
  }

  return {
    ok: reasonCodes.length === 0,
    id: card?.id || null,
    title: card?.title || null,
    state: card?.state || null,
    priority: card?.priority || null,
    category: card?.category || null,
    classification: card?.state === "backlog" ? "backlog" : "active",
    primaryEpicId: card?.primaryEpicId || null,
    supportingEpicIds: Array.isArray(card?.supportingEpicIds) ? card.supportingEpicIds : [],
    dependsOnCardIds: Array.isArray(card?.dependsOnCardIds) ? card.dependsOnCardIds : [],
    markerName: card?.markerName || null,
    completionPercent: Number.isFinite(card?.completionPercent) ? card.completionPercent : null,
    summary: card?.summary || null,
    whyItMatters: card?.whyItMatters || null,
    currentStatus: card?.currentStatus || null,
    workBreakdown: Array.isArray(card?.workBreakdown) ? card.workBreakdown : [],
    nextActions: Array.isArray(card?.nextActions) ? card.nextActions : [],
    acceptanceCriteria: Array.isArray(card?.acceptanceCriteria) ? card.acceptanceCriteria : [],
    proofPlan: Array.isArray(card?.proofPlan) ? card.proofPlan : [],
    reference: card?.reference || null,
    nextCommand: card?.nextCommand || null,
    liveThreadId: card?.liveThreadId || null,
    liveMessageId: card?.liveMessageId || null,
    reactionStatus: card?.reactionStatus || null,
    reactionEmojiName: card?.reactionEmojiName || null,
    reactionEmojiId: card?.reactionEmojiId || null,
    reasonCodes,
  };
}

function buildMazerFeedbackBoardReadModel(board, { cardId = null, state = null } = {}) {
  const reasonCodes = [];
  const planning = buildMazerBoardPlanning(board);
  if (!board || board.version !== 1) {
    reasonCodes.push("board_version_invalid");
  }
  if (board?.board?.id !== EXPECTED_BOARD_ID) {
    reasonCodes.push("board_id_invalid");
  }
  if (board?.board?.label !== EXPECTED_BOARD_LABEL) {
    reasonCodes.push("board_label_invalid");
  }
  if (board?.board?.placement?.channelFamily !== EXPECTED_PLACEMENT_FAMILY) {
    reasonCodes.push("board_placement_channel_family_invalid");
  }
  if (!hasText(board?.board?.placement?.forumChannelId)) {
    reasonCodes.push("board_placement_forum_channel_id_missing");
  }
  if (!hasText(board?.board?.placement?.sortKey)) {
    reasonCodes.push("board_placement_sort_key_missing");
  }
  if (!Array.isArray(board?.cards)) {
    reasonCodes.push("board_cards_missing");
  }
  if (state && !STATES.has(state)) {
    reasonCodes.push("state_filter_invalid");
  }

  reasonCodes.push(...planning.reasonCodes);
  const cards = (Array.isArray(board?.cards) ? board.cards : []).map((card) => classifyCard({
    ...card,
    primaryEpicId: planning.primaryEpicByCard[card?.id] || null,
    supportingEpicIds: planning.supportingEpicIdsByCard[card?.id] || [],
    dependsOnCardIds: planning.dependsOnCardIdsByCard[card?.id] || [],
  }));
  const filteredCards = cards.filter((card) =>
    (!cardId || card.id === cardId) && (!state || card.state === state)
  );
  const nextEligibleCards = filteredCards.filter((card) => card.state === "ready");
  const activeCard = cards.find((card) => card.id === planning.activeCardId && card.state !== "completed") || null;
  if (cardId && filteredCards.length === 0) {
    reasonCodes.push("card_not_found");
  }
  reasonCodes.push(...cards.flatMap((card) => card.reasonCodes));

  return {
    ok: reasonCodes.length === 0,
    boardId: board?.board?.id || null,
    boardLabel: board?.board?.label || null,
    sendsMessages: board?.board?.sendsMessages === true,
    placement: board?.board?.placement || null,
    liveForumChannelId: board?.board?.liveForumChannelId || null,
    legacyForumChannelId: board?.board?.legacyForumChannelId || null,
    liveGuildId: board?.board?.liveGuildId || null,
    liveSyncedAt: board?.board?.liveSyncedAt || null,
    planning: {
      ok: planning.ok,
      activeCardId: planning.activeCardId,
      epicCount: planning.epicCount,
      mappedCardCount: planning.mappedCardCount,
      dependencyCount: planning.dependencyCount,
      parallelTrackCount: planning.parallelTrackCount,
    },
    cardCount: cards.length,
    filteredCardCount: filteredCards.length,
    readyCardCount: cards.filter((card) => card.state === "ready").length,
    openCardCount: cards.filter((card) => card.state === "open").length,
    completedCardCount: cards.filter((card) => card.state === "completed").length,
    blockedCardCount: cards.filter((card) => card.state === "blocked").length,
    backlogCardCount: cards.filter((card) => card.state === "backlog").length,
    reactionReadyCardCount: cards.filter((card) => {
      const expectedStatus = card.state === "completed" ? "success" : "failure";
      const expectedReaction = STATUS_REACTIONS[expectedStatus];
      return card.reactionStatus === expectedStatus
        && card.reactionEmojiName === expectedReaction.name
        && card.reactionEmojiId === expectedReaction.id;
    }).length,
    averageCompletionPercent: cards.filter((card) => card.state !== "backlog").length
      ? Math.round(
        cards
          .filter((card) => card.state !== "backlog")
          .reduce((sum, card) => sum + (card.completionPercent || 0), 0)
        / cards.filter((card) => card.state !== "backlog").length
      )
      : 0,
    nextCard: activeCard || nextEligibleCards.find((card) => card.priority === "high") || nextEligibleCards[0] || null,
    cards: filteredCards,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildMazerFeedbackBoard({
  boardPath = DEFAULT_BOARD_PATH,
  cardId = null,
  state = null,
  fsImpl = fs,
} = {}) {
  const board = await readBoard(boardPath, fsImpl);
  const readModel = buildMazerFeedbackBoardReadModel(board, { cardId, state });
  const result = {
    destructive: false,
    writesArtifacts: false,
    status: readModel.ok ? "feedback_board_ready" : "blocked",
    ...readModel,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.mazer.feedback_board_ready"
        : "discordos.mazer.feedback_board_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.mazer.feedback_board",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        cardCount: result.cardCount,
        readyCardCount: result.readyCardCount,
        openCardCount: result.openCardCount,
        completedCardCount: result.completedCardCount,
        blockedCardCount: result.blockedCardCount,
        backlogCardCount: result.backlogCardCount,
        reactionReadyCardCount: result.reactionReadyCardCount,
        averageCompletionPercent: result.averageCompletionPercent,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Mazer Feedback Board",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- board: \`${result.boardId || "unknown"}\``,
    `- label: \`${result.boardLabel || "unknown"}\``,
    `- placement: \`${result.placement?.channelFamily || "unknown"}\``,
    `- placement forum channel id: \`${result.placement?.forumChannelId || "none"}\``,
    `- live forum channel id: \`${result.liveForumChannelId || "none"}\``,
    `- legacy forum channel id: \`${result.legacyForumChannelId || "none"}\``,
    `- live synced at: \`${result.liveSyncedAt || "none"}\``,
    `- cards: \`${result.cardCount}\``,
    `- filtered cards: \`${result.filteredCardCount}\``,
    `- ready cards: \`${result.readyCardCount}\``,
    `- open cards: \`${result.openCardCount}\``,
    `- completed cards: \`${result.completedCardCount}\``,
    `- blocked cards: \`${result.blockedCardCount}\``,
    `- backlog cards: \`${result.backlogCardCount}\``,
    `- reaction-ready cards: \`${result.reactionReadyCardCount}\``,
    `- average marker: \`${result.averageCompletionPercent}%\``,
    `- next card: \`${result.nextCard?.id || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const card of result.cards) {
    const markerSummary = card.state === "backlog"
      ? "backlog `no active marker`"
      : `marker \`${card.markerName}\` \`${card.completionPercent}%\``;
    lines.push(`- card ${card.id}: state \`${card.state}\`, priority \`${card.priority}\`, ${markerSummary}, reaction \`${card.reactionStatus || "none"}\`, command \`${card.nextCommand}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildMazerFeedbackBoard(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    DEFAULT_BOARD_PATH,
    STATES,
    PRIORITIES,
    REACTION_STATUSES,
    STATUS_REACTIONS,
    EXPECTED_BOARD_ID,
    EXPECTED_BOARD_LABEL,
    EXPECTED_PLACEMENT_FAMILY,
    parseArgs,
    readBoard,
    classifyCard,
    buildMazerFeedbackBoardReadModel,
    buildMazerBoardPlanning,
    buildMazerFeedbackBoard,
    renderMarkdown,
  },
};
