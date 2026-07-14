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

function mapLegacyState(state, boardRole) {
  if (boardRole === "completed") return "completed";
  const normalized = text(state).toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "blocked") return "blocked";
  if (normalized === "review") return "review";
  if (normalized === "open" || normalized === "in_progress") return "in_progress";
  return "planning";
}

function mapSourceState(source, boardRole) {
  if (source.sourceType === "fitness_export") {
    return mapFitnessState({ status: source.rawState }, boardRole);
  }
  if (source.sourceType === "mazer_board") {
    return mapMazerState({ state: source.rawState, completionPercent: Number.parseInt(source.progress, 10) }, boardRole);
  }
  return mapLegacyState(source.rawState, boardRole);
}

function parseJournalLifecycleMessage(message) {
  const content = typeof message?.content === "string" ? message.content : "";
  const eventId = content.match(/ATLAS-JOURNAL-EVENT-ID:\s*`([^`]+)`/i)?.[1]?.trim() || null;
  if (!eventId) return null;
  const metadata = (name) => content.match(new RegExp(`^- ${name}:\\s*` + "`([^`]+)`", "im"))?.[1]?.trim() || null;
  const cardMetadataMatch = content.match(/^- card:\s*`([^`]*)`/im);
  const timestamp = text(message?.timestamp) || metadata("occurred");
  return {
    messageId: text(message?.id) || null,
    eventId,
    cardId: cardMetadataMatch?.[1]?.trim() || null,
    cardMetadataPresent: Boolean(cardMetadataMatch),
    state: metadata("state")?.toLowerCase() || null,
    occurredAt: metadata("occurred"),
    timestamp,
    timestampMs: timestamp ? Date.parse(timestamp) : Number.NaN,
  };
}

function compareJournalLifecycle(left, right) {
  if (left.timestampMs !== right.timestampMs) return right.timestampMs - left.timestampMs;
  if (/^\d+$/.test(left.messageId || "") && /^\d+$/.test(right.messageId || "")) {
    const leftId = BigInt(left.messageId);
    const rightId = BigInt(right.messageId);
    if (leftId !== rightId) return leftId > rightId ? -1 : 1;
  }
  return 0;
}

function resolveJournalCardIdentity({ entries, cardId, matchedBy = null }) {
  const explicitCardIds = [...new Set(entries.map((entry) => entry.cardId).filter(Boolean))].sort();
  const missingCardIdCount = entries.filter((entry) => !entry.cardMetadataPresent).length;
  const matchingCardIdCount = entries.filter((entry) => entry.cardId?.toLowerCase() === cardId.toLowerCase()).length;
  const conflictingCardIdCount = entries.length - missingCardIdCount - matchingCardIdCount;
  const exactSourceThreadIdentity = matchedBy === "source_thread_id";
  const identity = {
    decision: "explicit_identity_match",
    matchedBy,
    exactSourceThreadIdentity,
    entryCount: entries.length,
    missingCardIdCount,
    matchingCardIdCount,
    conflictingCardIdCount,
    explicitCardIds,
    reasonCodes: ["journal_lifecycle_card_identity_explicit_match"],
  };

  if (entries.length === 0) {
    return {
      ...identity,
      decision: "journal_absent",
      reasonCodes: ["journal_lifecycle_card_identity_not_applicable"],
    };
  }
  if (conflictingCardIdCount > 0) {
    return {
      ...identity,
      decision: "explicit_identity_conflict",
      reasonCodes: ["journal_lifecycle_card_identity_conflict"],
    };
  }
  if (missingCardIdCount > 0 && !exactSourceThreadIdentity) {
    return {
      ...identity,
      decision: "legacy_identity_omission_blocked_non_exact_source",
      reasonCodes: ["journal_lifecycle_card_identity_omission_requires_exact_source_thread"],
    };
  }
  if (missingCardIdCount > 0 && matchingCardIdCount > 0) {
    return {
      ...identity,
      decision: "mixed_explicit_match_and_legacy_omission_admitted",
      reasonCodes: ["journal_lifecycle_card_identity_mixed_match_admitted_exact_source_thread"],
    };
  }
  if (missingCardIdCount > 0) {
    return {
      ...identity,
      decision: "legacy_identity_omission_admitted",
      reasonCodes: ["journal_lifecycle_card_identity_omission_admitted_exact_source_thread"],
    };
  }
  return identity;
}

function resolveJournalLifecycle({ messages, cardId, matchedBy = null }) {
  const entries = (Array.isArray(messages) ? messages : [])
    .map(parseJournalLifecycleMessage)
    .filter(Boolean);
  const identityDecision = resolveJournalCardIdentity({ entries, cardId, matchedBy });
  if (entries.length === 0) {
    return {
      ok: true,
      status: "journal_absent",
      state: null,
      eventId: null,
      identityDecision,
      reasonCodes: [],
    };
  }

  const reasonCodes = [];
  if (identityDecision.decision === "explicit_identity_conflict"
    || identityDecision.decision === "legacy_identity_omission_blocked_non_exact_source") {
    reasonCodes.push(...identityDecision.reasonCodes);
  }
  if (entries.some((entry) => !entry.state || !journal.ALLOWED_STATES.has(entry.state))) {
    reasonCodes.push("journal_lifecycle_state_unsupported");
  }
  if (entries.some((entry) => !Number.isFinite(entry.timestampMs))) {
    reasonCodes.push("journal_lifecycle_timestamp_missing");
  }

  const eventVariants = new Map();
  for (const entry of entries) {
    const variants = eventVariants.get(entry.eventId) || new Set();
    const effectiveCardId = entry.cardId
      || (identityDecision.exactSourceThreadIdentity ? cardId : "");
    variants.add(`${effectiveCardId}\u0000${entry.state || ""}\u0000${entry.occurredAt || ""}`);
    eventVariants.set(entry.eventId, variants);
  }
  if ([...eventVariants.values()].some((variants) => variants.size > 1)) {
    reasonCodes.push("journal_lifecycle_event_conflict");
  }

  if (reasonCodes.length > 0) {
    return {
      ok: false,
      status: "blocked",
      state: null,
      eventId: null,
      identityDecision,
      reasonCodes: [...new Set(reasonCodes)],
    };
  }

  entries.sort(compareJournalLifecycle);
  const latest = entries[0];
  const tied = entries.filter((entry) => compareJournalLifecycle(entry, latest) === 0);
  if (new Set(tied.map((entry) => entry.state)).size > 1) {
    return {
      ok: false,
      status: "blocked",
      state: null,
      eventId: null,
      identityDecision,
      reasonCodes: ["journal_lifecycle_latest_state_ambiguous"],
    };
  }
  return {
    ok: true,
    status: "journal_resolved",
    state: latest.state,
    eventId: latest.eventId,
    messageId: latest.messageId,
    occurredAt: latest.occurredAt,
    identityDecision,
    reasonCodes: [],
  };
}

function selectLifecycleTransition({ transitions, cardId, threadId }) {
  const candidates = (Array.isArray(transitions) ? transitions : []).filter((transition) => {
    const transitionCardId = text(transition?.cardId);
    const transitionThreadId = text(transition?.threadId);
    return transitionCardId.toLowerCase() === cardId.toLowerCase()
      || (transitionThreadId && transitionThreadId === threadId);
  });
  if (candidates.length === 0) return { transition: null, reasonCodes: [] };
  if (candidates.length > 1) return { transition: null, reasonCodes: ["lifecycle_transition_ambiguous"] };
  const transition = candidates[0];
  if (text(transition.cardId).toLowerCase() !== cardId.toLowerCase()
    || (text(transition.threadId) && text(transition.threadId) !== threadId)) {
    return { transition: null, reasonCodes: ["lifecycle_transition_identity_conflict"] };
  }
  return { transition, reasonCodes: [] };
}

function validateTransitionProof(proof) {
  const strength = text(proof?.strength).toLowerCase();
  const hasReference = Boolean(text(proof?.receiptPath) || text(proof?.messageId));
  return ["live_runtime", "human_verified"].includes(strength) && hasReference;
}

function mergeLifecycleState({ baselineState, journalLifecycle, transition = null }) {
  if (!journalLifecycle?.ok) {
    return { ok: false, state: null, previousState: null, decision: "blocked", reasonCodes: journalLifecycle?.reasonCodes || ["journal_lifecycle_unresolved"] };
  }
  const currentState = journalLifecycle.state || baselineState;
  if (!transition) {
    return {
      ok: true,
      state: journalLifecycle.state || baselineState,
      previousState: null,
      decision: journalLifecycle.state
        ? journalLifecycle.state === baselineState ? "journal_matches_baseline" : "journal_state_preserved"
        : "baseline_used_no_journal",
      reasonCodes: [],
    };
  }

  const fromState = text(transition.fromState).toLowerCase();
  const toState = text(transition.toState).toLowerCase();
  const reasonCodes = [];
  if (transition.authorized !== true) reasonCodes.push("lifecycle_transition_not_authorized");
  if (!text(transition.eventId)) reasonCodes.push("lifecycle_transition_event_id_missing");
  if (!text(transition.actor)) reasonCodes.push("lifecycle_transition_actor_missing");
  if (!text(transition.occurredAt) || !Number.isFinite(Date.parse(transition.occurredAt))) {
    reasonCodes.push("lifecycle_transition_timestamp_invalid");
  }
  if (!validateTransitionProof(transition.proof)) reasonCodes.push("lifecycle_transition_proof_invalid");
  if (fromState !== currentState) reasonCodes.push("lifecycle_transition_previous_state_mismatch");
  reasonCodes.push(...journal.validateLifecycleTransition(fromState, toState).reasonCodes);
  if (reasonCodes.length > 0) {
    return { ok: false, state: null, previousState: null, decision: "blocked", reasonCodes: [...new Set(reasonCodes)] };
  }
  return {
    ok: true,
    state: toState,
    previousState: fromState,
    decision: "authorized_transition",
    transition: {
      eventId: text(transition.eventId),
      cardId: text(transition.cardId),
      ...(text(transition.threadId) ? { threadId: text(transition.threadId) } : {}),
      fromState,
      toState,
      actor: text(transition.actor),
      note: text(transition.note) || null,
      occurredAt: text(transition.occurredAt),
      authorized: true,
      proof: {
        strength: text(transition.proof.strength),
        receiptPath: text(transition.proof.receiptPath) || null,
        messageId: text(transition.proof.messageId) || null,
        generatedAt: text(transition.proof.generatedAt) || null,
      },
    },
    reasonCodes: [],
  };
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

function buildMigrationEvent({ board, thread, source, guildId, existingContent = "", lifecycle = null }) {
  const baselineState = mapSourceState(source, board.role);
  const state = lifecycle?.state || baselineState;
  const transition = lifecycle?.transition || null;
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
  const progress = board.role === "completed" ? "100%" : source.progress;
  const nextActions = board.role === "completed"
    ? [
      "Retain this completed record as historical evidence",
      "Create or reopen active work only when new evidence changes the accepted outcome",
    ]
    : source.nextActions;
  return {
    schemaVersion: "atlas.board-card-journal.v1",
    eventId: transition?.eventId || `migration:${board.id}:${thread.id}:v1`,
    occurredAt: transition?.occurredAt || new Date().toISOString(),
    actor: transition?.actor || "discordos.board-migration",
    card: {
      id: source.cardId,
      project: source.project,
      sourceForumChannelId: board.forumChannelId,
      threadId: thread.id,
      title: thread.name,
      type: source.type,
      state,
      ...(lifecycle?.previousState ? { previousState: lifecycle.previousState } : {}),
      priority: source.priority,
      owner: source.owner,
      progress,
      summary: source.summary,
      objective: source.objective,
      acceptanceCriteria: source.acceptanceCriteria,
      discoveries: source.discoveries,
      nextActions,
      blockers: source.blockers,
      evidence,
    },
    entry: {
      kind: "correction",
      headline: transition ? "Authorized lifecycle transition" : "Historical card normalized",
      completed: ["Assigned stable card identity", "Refreshed the canonical starter summary", "Preserved the pre-contract starter body in the card thread"],
      discovered: source.discoveries,
      next: nextActions,
      blockers: source.blockers,
      evidence,
    },
    correlation: {
      taskId: "ATLAS-MIGRATION-BOARD-JOURNAL-V1",
      jobId: null,
      branch: null,
      commit: null,
      receipt: transition?.proof?.receiptPath || null,
    },
    ...(transition ? { transition } : {}),
  };
}

async function buildMigrationPlan({ boards, fitnessCards = [], mazerCards = [], lifecycleTransitions = [], env = process.env, fetchImpl = fetch } = {}) {
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
      const messages = await journal.readThreadMessages({ threadId: thread.id, token, fetchImpl });
      if (!messages.ok) {
        const code = messages.truncated ? "journal_lifecycle_history_truncated" : "journal_lifecycle_history_read_failed";
        rows.push({ boardId: board.id, threadId: thread.id, title: thread.name, cardId: source.cardId, eventCreated: false, reasonCodes: [code] });
        reasonCodes.push(`${code}:${thread.id}`);
        continue;
      }
      const journalLifecycle = resolveJournalLifecycle({
        messages: messages.payload,
        cardId: source.cardId,
        matchedBy: selected.matchedBy,
      });
      const selectedTransition = selectLifecycleTransition({ transitions: lifecycleTransitions, cardId: source.cardId, threadId: thread.id });
      const baselineState = mapSourceState(source, board.role);
      const lifecycle = selectedTransition.reasonCodes.length > 0
        ? { ok: false, state: null, previousState: null, decision: "blocked", reasonCodes: selectedTransition.reasonCodes }
        : mergeLifecycleState({ baselineState, journalLifecycle, transition: selectedTransition.transition });
      if (!lifecycle.ok) {
        rows.push({
          boardId: board.id,
          threadId: thread.id,
          title: thread.name,
          cardId: source.cardId,
          baselineState,
          journalState: journalLifecycle.state,
          journalLifecycleStatus: journalLifecycle.status,
          journalIdentityDecision: journalLifecycle.identityDecision,
          lifecycleDecision: lifecycle.decision,
          matchedBy: selected.matchedBy,
          sourceType: source.sourceType,
          eventCreated: false,
          reasonCodes: lifecycle.reasonCodes,
        });
        reasonCodes.push(...lifecycle.reasonCodes.map((code) => `${code}:${thread.id}`));
        continue;
      }
      const event = buildMigrationEvent({
        board,
        thread,
        source,
        guildId: channel.payload.guild_id,
        existingContent: starter.payload?.content,
        lifecycle,
      });
      events.push(event);
      rows.push({
        boardId: board.id,
        threadId: thread.id,
        title: thread.name,
        cardId: event.card.id,
        project: event.card.project,
        state: event.card.state,
        baselineState,
        journalState: journalLifecycle.state,
        journalLifecycleStatus: journalLifecycle.status,
        journalIdentityDecision: journalLifecycle.identityDecision,
        lifecycleDecision: lifecycle.decision,
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
    authorizedTransitionCount: rows.filter((row) => row.lifecycleDecision === "authorized_transition").length,
    journalPreservedCount: rows.filter((row) => row.lifecycleDecision === "journal_state_preserved").length,
    legacyJournalIdentityAdmissionCount: rows.filter((row) => [
      "legacy_identity_omission_admitted",
      "mixed_explicit_match_and_legacy_omission_admitted",
    ].includes(row.journalIdentityDecision?.decision)).length,
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
    lifecycleTransitions: boardPayload.lifecycleTransitions || [],
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
    mapLegacyState,
    mapSourceState,
    parseJournalLifecycleMessage,
    resolveJournalCardIdentity,
    resolveJournalLifecycle,
    selectLifecycleTransition,
    validateTransitionProof,
    mergeLifecycleState,
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
