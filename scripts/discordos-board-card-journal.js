const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: cardContract,
} = require("./discordos-board-card-contract");

const JOURNAL_ENV = "DISCORDOS_BOARD_CARD_JOURNAL";
const JOURNAL_ENV_VALUE = "enabled";
const CARD_START = cardContract.CANONICAL_CARD_START;
const CARD_END = cardContract.CANONICAL_CARD_END;
const MAX_MESSAGE_LENGTH = 2000;
const MESSAGE_PAGE_LIMIT = 100;
const MAX_MESSAGE_PAGES = 10;
const THREAD_PAGE_LIMIT = 100;
const MAX_THREAD_PAGES = 20;
const ACTIVE_STATES = new Set(["intake", "planning", "ready", "in_progress", "review", "blocked", "opened"]);
const ALLOWED_STATES = new Set([...ACTIVE_STATES, "completed", "archived", "closed"]);
const AUTONOMOUS_EXECUTION_STATE = "ready";
const LIFECYCLE_TRANSITIONS = Object.freeze({
  intake: new Set(["planning", "blocked"]),
  planning: new Set(["ready", "blocked"]),
  ready: new Set(["in_progress", "planning", "blocked"]),
  in_progress: new Set(["review", "blocked"]),
  review: new Set(["completed", "in_progress", "blocked"]),
  blocked: new Set(["planning", "ready"]),
  completed: new Set(["archived"]),
  archived: new Set(),
  opened: new Set(["planning", "in_progress", "blocked"]),
  closed: new Set(["archived"]),
});

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = { inputPath: null, json: false, allowApply: false, apply: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      options.inputPath = path.resolve(readValue(args, index, "missing_input_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else if (arg === "--allow-apply") options.allowApply = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.inputPath) throw new Error("input_path_missing");
  return options;
}

function resolveAdmission({ allowApply, env }) {
  const envEnabled = env?.[JOURNAL_ENV] === JOURNAL_ENV_VALUE;
  if (!allowApply && !envEnabled) {
    return { requested: false, admitted: false, status: "journal_guard_not_requested", reasonCodes: [] };
  }
  if (allowApply && envEnabled) {
    return { requested: true, admitted: true, status: "journal_admitted", reasonCodes: [] };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["board_card_journal_double_guard_missing"],
  };
}

function text(value) {
  return typeof value === "string" ? repairMojibakeText(value).trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function repairMojibakeText(value) {
  return String(value || "")
    .replace(/\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac[\u009d\ufffd]?/g, " - ")
    .replace(/\u00e2\u20ac[\u201c\u201d]/g, " - ")
    .replace(/[\u2013\u2014]/g, " - ")
    .replace(/\s+-\s+/g, " - ");
}

function findMojibakeRuns(value) {
  return String(value || "").match(/(?:\u00c3|\u00c2|\u00e2|\ufffd|[\u0080-\u009f])[^\x00-\x7f]*/g) || [];
}

function normalizeCardTitle(value) {
  return text(value);
}

function normalizeEvent(raw) {
  const card = raw?.card || {};
  const entry = raw?.entry || {};
  const correlation = raw?.correlation || {};
  return {
    schemaVersion: text(raw?.schemaVersion) || "atlas.board-card-journal.v1",
    eventId: text(raw?.eventId),
    occurredAt: text(raw?.occurredAt) || new Date().toISOString(),
    actor: text(raw?.actor) || "atlas",
    card: {
      id: text(card.id),
      project: text(card.project),
      sourceForumChannelId: text(card.sourceForumChannelId),
      threadId: text(card.threadId) || null,
      title: normalizeCardTitle(card.title),
      type: text(card.type) || "feature",
      state: text(card.state).toLowerCase(),
      previousState: text(card.previousState).toLowerCase() || null,
      priority: text(card.priority) || "Unspecified",
      owner: text(card.owner) || "Unassigned",
      progress: text(card.progress) || "Unmeasured",
      summary: text(card.summary),
      objective: text(card.objective),
      acceptanceCriteria: list(card.acceptanceCriteria),
      discoveries: list(card.discoveries),
      nextActions: list(card.nextActions),
      blockers: list(card.blockers),
      evidence: list(card.evidence),
    },
    entry: {
      kind: text(entry.kind) || "progress",
      headline: text(entry.headline) || "Work checkpoint",
      completed: list(entry.completed),
      discovered: list(entry.discovered),
      next: list(entry.next),
      blockers: list(entry.blockers),
      evidence: list(entry.evidence),
    },
    correlation: {
      taskId: text(correlation.taskId) || null,
      jobId: text(correlation.jobId) || null,
      branch: text(correlation.branch) || null,
      commit: text(correlation.commit) || null,
      receipt: text(correlation.receipt) || null,
    },
  };
}

function validateLifecycleTransition(previousState, nextState) {
  const from = text(previousState).toLowerCase();
  const to = text(nextState).toLowerCase();
  if (!from) return { allowed: true, status: "previous_state_not_declared", reasonCodes: [] };
  if (!ALLOWED_STATES.has(from)) {
    return { allowed: false, status: "blocked", reasonCodes: ["previous_card_state_unsupported"] };
  }
  if (!ALLOWED_STATES.has(to)) {
    return { allowed: false, status: "blocked", reasonCodes: ["card_state_unsupported"] };
  }
  if (from === to) return { allowed: true, status: "same_state_checkpoint", reasonCodes: [] };
  const allowed = LIFECYCLE_TRANSITIONS[from]?.has(to) === true;
  return {
    allowed,
    status: allowed ? "transition_admitted" : "blocked",
    reasonCodes: allowed ? [] : ["card_lifecycle_transition_not_admitted"],
  };
}

function evaluateAutonomyAdmission(card) {
  const reasonCodes = [];
  if (card?.state !== AUTONOMOUS_EXECUTION_STATE) reasonCodes.push("autonomy_state_not_ready");
  if (!card?.id) reasonCodes.push("autonomy_card_id_missing");
  if (!card?.project) reasonCodes.push("autonomy_project_missing");
  if (!card?.title) reasonCodes.push("autonomy_title_missing");
  if (!card?.summary) reasonCodes.push("autonomy_summary_missing");
  if (!card?.objective) reasonCodes.push("autonomy_objective_missing");
  if (!Array.isArray(card?.acceptanceCriteria) || card.acceptanceCriteria.length === 0) {
    reasonCodes.push("autonomy_acceptance_criteria_missing");
  }
  if (!Array.isArray(card?.nextActions) || card.nextActions.length === 0) {
    reasonCodes.push("autonomy_next_actions_missing");
  }
  if (!card?.owner || /^unassigned$/i.test(card.owner)) reasonCodes.push("autonomy_owner_unassigned");
  if (!card?.priority || /^unspecified$/i.test(card.priority)) reasonCodes.push("autonomy_priority_unassigned");
  if (Array.isArray(card?.blockers) && card.blockers.length > 0) reasonCodes.push("autonomy_blockers_present");
  return {
    admitted: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "ready_for_autonomous_execution" : "planning_required",
    requiredState: AUTONOMOUS_EXECUTION_STATE,
    reasonCodes,
  };
}

function validateEvent(event) {
  const reasonCodes = [];
  if (event.schemaVersion !== "atlas.board-card-journal.v1") reasonCodes.push("journal_schema_version_unsupported");
  if (!event.eventId) reasonCodes.push("journal_event_id_missing");
  if (!event.card.id) reasonCodes.push("card_id_missing");
  if (!event.card.project) reasonCodes.push("card_project_missing");
  if (!event.card.sourceForumChannelId) reasonCodes.push("source_forum_channel_id_missing");
  if (!event.card.title) reasonCodes.push("card_title_missing");
  if (!event.card.state) reasonCodes.push("card_state_missing");
  else if (!ALLOWED_STATES.has(event.card.state)) reasonCodes.push("card_state_unsupported");
  if (!event.card.summary) reasonCodes.push("card_summary_missing");
  if (!event.entry.headline) reasonCodes.push("journal_headline_missing");
  reasonCodes.push(...validateLifecycleTransition(event.card.previousState, event.card.state).reasonCodes);
  if (event.card.state === AUTONOMOUS_EXECUTION_STATE) {
    reasonCodes.push(...evaluateAutonomyAdmission(event.card).reasonCodes);
  }
  return [...new Set(reasonCodes)];
}

function cardMarker(cardId) {
  return `ATLAS-CARD-ID: \`${cardId}\``;
}

function eventMarker(eventId) {
  return `ATLAS-JOURNAL-EVENT-ID: \`${eventId}\``;
}

function legacySnapshotMarker(cardId, part, total) {
  return `ATLAS-LEGACY-SNAPSHOT-ID: \`${cardId}:${part}/${total}\``;
}

function buildLegacySnapshotMessages(cardId, content) {
  const value = String(content || "");
  if (!value) return [];
  const chunkSize = 1650;
  const chunks = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) chunks.push(value.slice(offset, offset + chunkSize));
  return chunks.map((chunk, index) => {
    const marker = legacySnapshotMarker(cardId, index + 1, chunks.length);
    return `${marker}\n## Preserved pre-contract starter body\n\n${chunk}`.slice(0, MAX_MESSAGE_LENGTH);
  });
}

function stripManagedCard(content) {
  const value = String(content || "").trim();
  const start = value.indexOf(CARD_START);
  const end = value.indexOf(CARD_END);
  let remainder = start >= 0 && end > start
    ? `${value.slice(0, start)}${value.slice(end + CARD_END.length)}`
    : value;
  remainder = remainder
    .replace(/^ATLAS-CARD-ID:\s*`[^`]+`\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return remainder;
}

function parseManagedCardBody(content) {
  return cardContract.parseCanonicalCardBody(content);
}

function appendSection(lines, heading, values) {
  const items = list(values);
  if (items.length === 0) return;
  lines.push("", `## ${heading}`);
  for (const item of items) lines.push(`- ${item}`);
}

function fitMessage(lines, suffix = "") {
  const accepted = [];
  for (const line of lines) {
    const candidate = [...accepted, line].join("\n");
    if (`${candidate}${suffix}`.length > MAX_MESSAGE_LENGTH) {
      const remaining = MAX_MESSAGE_LENGTH - accepted.join("\n").length - suffix.length - 6;
      if (remaining > 24) accepted.push(`${line.slice(0, remaining).trimEnd()}...`);
      break;
    }
    accepted.push(line);
  }
  return `${accepted.join("\n")}${suffix}`.slice(0, MAX_MESSAGE_LENGTH);
}

function truncateWithReference(value, maxLength) {
  const normalized = text(value);
  if (normalized.length <= maxLength) return normalized;
  const suffix = "... [see journal/source]";
  const available = Math.max(1, maxLength - suffix.length);
  return `${normalized.slice(0, available).trimEnd()}${suffix}`;
}

function compactSectionValues(values, {
  maxItems,
  maxLength,
  fallback = null,
}) {
  const normalized = list(values);
  if (normalized.length === 0) return fallback ? [fallback] : [];
  if (normalized.length <= maxItems) {
    return normalized.map((value) => truncateWithReference(value, maxLength));
  }
  const visibleCount = Math.max(1, maxItems - 1);
  return [
    ...normalized
      .slice(0, visibleCount)
      .map((value) => truncateWithReference(value, maxLength)),
    `${normalized.length - visibleCount} more item(s) in journal/source`,
  ];
}

function renderCanonicalBody({ metadataLines, sections }) {
  const lines = [...metadataLines];
  for (const section of sections) {
    if (section.values.length === 0) continue;
    lines.push("", `## ${section.heading}`);
    if (section.style === "plain") {
      lines.push(section.values[0]);
    } else {
      for (const value of section.values) lines.push(`- ${value}`);
    }
  }
  return `${lines.join("\n")}\n${CARD_END}`;
}

function buildCanonicalSections({ card, existingContent, maxLength = null }) {
  const boardLinks = card.evidence.filter((item) => /^(original|completed) card:/i.test(item));
  const evidence = card.evidence.filter((item) => !/^(original|completed) card:/i.test(item));
  const legacy = stripManagedCard(existingContent);
  if (maxLength === null) {
    return [
      { heading: "Board links", values: boardLinks, style: "list" },
      { heading: "Summary", values: [card.summary], style: "plain" },
      { heading: "Objective", values: card.objective ? [card.objective] : ["Not established"], style: "list" },
      { heading: "Acceptance criteria", values: card.acceptanceCriteria.length ? card.acceptanceCriteria : ["Not established"], style: "list" },
      { heading: "Discoveries", values: card.discoveries, style: "list" },
      { heading: "Next actions", values: card.nextActions.length ? card.nextActions : ["Not established"], style: "list" },
      { heading: "Blockers", values: card.blockers.length ? card.blockers : ["None"], style: "list" },
      { heading: "Evidence", values: evidence.length ? evidence : ["None"], style: "list" },
      { heading: "Original context", values: legacy ? [legacy] : [], style: "list" },
    ];
  }
  return [
    {
      heading: "Board links",
      values: compactSectionValues(boardLinks, { maxItems: 2, maxLength }),
      style: "list",
    },
    {
      heading: "Summary",
      values: compactSectionValues([card.summary], { maxItems: 1, maxLength: maxLength + 40, fallback: "Not established" }),
      style: "plain",
    },
    {
      heading: "Objective",
      values: compactSectionValues(card.objective ? [card.objective] : [], { maxItems: 1, maxLength: maxLength + 20, fallback: "Not established" }),
      style: "list",
    },
    {
      heading: "Acceptance criteria",
      values: compactSectionValues(card.acceptanceCriteria, { maxItems: 3, maxLength, fallback: "Not established" }),
      style: "list",
    },
    {
      heading: "Discoveries",
      values: compactSectionValues(card.discoveries, { maxItems: 2, maxLength }),
      style: "list",
    },
    {
      heading: "Next actions",
      values: compactSectionValues(card.nextActions, { maxItems: 3, maxLength, fallback: "Not established" }),
      style: "list",
    },
    {
      heading: "Blockers",
      values: compactSectionValues(card.blockers, { maxItems: 2, maxLength, fallback: "None" }),
      style: "list",
    },
    {
      heading: "Evidence",
      values: compactSectionValues(evidence, { maxItems: 2, maxLength, fallback: "None" }),
      style: "list",
    },
    {
      heading: "Original context",
      values: compactSectionValues(legacy ? [legacy] : [], { maxItems: 1, maxLength }),
      style: "list",
    },
  ];
}

function buildCanonicalBody(event, existingContent = "") {
  const { card } = event;
  const autonomy = evaluateAutonomyAdmission(card);
  const metadataLines = [
    CARD_START,
    cardMarker(card.id),
    `- project: \`${card.project}\``,
    `- type: \`${card.type}\``,
    `- state: \`${card.state}\``,
    `- priority: \`${card.priority}\``,
    `- owner: \`${card.owner}\``,
    `- progress: \`${card.progress}\``,
    `- autonomous implementation: \`${autonomy.admitted ? "admitted" : "not_admitted"}\``,
    `- updated: \`${event.occurredAt}\``,
  ];
  const fullBody = renderCanonicalBody({
    metadataLines,
    sections: buildCanonicalSections({ card, existingContent }),
  });
  if (fullBody.length <= MAX_MESSAGE_LENGTH) return fullBody;

  for (let maxLength = 140; maxLength >= 48; maxLength -= 4) {
    const compactBody = renderCanonicalBody({
      metadataLines,
      sections: buildCanonicalSections({ card, existingContent, maxLength }),
    });
    if (compactBody.length <= MAX_MESSAGE_LENGTH) return compactBody;
  }
  throw new Error("canonical_card_body_section_preserving_compaction_failed");
}

function appendCorrelation(lines, correlation) {
  const rows = [
    ["task", correlation.taskId],
    ["job", correlation.jobId],
    ["branch", correlation.branch],
    ["commit", correlation.commit],
    ["receipt", correlation.receipt],
  ].filter(([, value]) => value);
  if (rows.length === 0) return;
  lines.push("", "## Correlation");
  for (const [label, value] of rows) lines.push(`- ${label}: \`${value}\``);
}

function buildJournalMessage(event) {
  const { entry } = event;
  const lines = [
    eventMarker(event.eventId),
    `- card: \`${event.card.id}\``,
    `- idempotency: \`${event.eventId}\``,
    `## ${entry.headline}`,
    `- kind: \`${entry.kind}\``,
    `- state: \`${event.card.state}\``,
    `- actor: \`${event.actor}\``,
    `- occurred: \`${event.occurredAt}\``,
  ];
  appendSection(lines, "Completed", entry.completed);
  appendSection(lines, "Discovered", entry.discovered);
  appendSection(lines, "Next", entry.next);
  appendSection(lines, "Blockers", entry.blockers.length ? entry.blockers : ["None"]);
  appendSection(lines, "Evidence", entry.evidence);
  appendCorrelation(lines, event.correlation);
  return fitMessage(lines);
}

function summarizeThread(thread) {
  return {
    id: thread?.id || null,
    name: thread?.name || null,
    parentId: thread?.parent_id || null,
    archived: thread?.thread_metadata?.archived === true,
    locked: thread?.thread_metadata?.locked === true,
    appliedTags: Array.isArray(thread?.applied_tags) ? [...thread.applied_tags] : [],
  };
}

async function readArchivedForumThreads({ forumChannelId, token, fetchImpl = fetch }) {
  const threads = [];
  let before = null;
  let pageCount = 0;
  let status = null;

  while (pageCount < MAX_THREAD_PAGES) {
    const suffix = before ? `&before=${encodeURIComponent(before)}` : "";
    const response = await cardContract.discordRequest({
      path: `/channels/${forumChannelId}/threads/archived/public?limit=${THREAD_PAGE_LIMIT}${suffix}`,
      token,
      fetchImpl,
    });
    pageCount += 1;
    status = response.status;
    if (!response.ok || !Array.isArray(response.payload?.threads)) {
      return { ok: false, status, threads, pageCount, truncated: false, reasonCodes: ["archived_threads_read_failed"] };
    }
    threads.push(...response.payload.threads);
    if (response.payload.has_more !== true) {
      return { ok: true, status, threads, pageCount, truncated: false, reasonCodes: [] };
    }
    before = response.payload.threads.at(-1)?.thread_metadata?.archive_timestamp || null;
    if (!before) {
      return {
        ok: false,
        status,
        threads,
        pageCount,
        truncated: true,
        reasonCodes: ["archived_threads_pagination_cursor_missing"],
      };
    }
  }

  return {
    ok: false,
    status,
    threads,
    pageCount,
    truncated: true,
    reasonCodes: ["archived_threads_read_truncated"],
  };
}

async function listForumThreads({ forumChannelId, guildId, token, fetchImpl = fetch }) {
  const [active, archived] = await Promise.all([
    cardContract.discordRequest({ path: `/guilds/${guildId}/threads/active`, token, fetchImpl }),
    readArchivedForumThreads({ forumChannelId, token, fetchImpl }),
  ]);
  const reasonCodes = [];
  if (!active.ok) reasonCodes.push("active_threads_read_failed");
  reasonCodes.push(...archived.reasonCodes);
  const seen = new Set();
  const threads = [
    ...(active.payload?.threads || []).filter((thread) => thread.parent_id === forumChannelId),
    ...archived.threads,
  ].filter((thread) => thread?.id && !seen.has(thread.id) && seen.add(thread.id)).map(summarizeThread);
  return {
    ok: reasonCodes.length === 0,
    threads,
    archivedPageCount: archived.pageCount,
    truncated: archived.truncated,
    reasonCodes,
  };
}

async function findCardThread({ event, threads, token, fetchImpl = fetch }) {
  if (event.card.threadId) {
    const explicit = threads.find((thread) => thread.id === event.card.threadId);
    if (!explicit) return { match: null, reasonCodes: ["explicit_card_thread_not_found"] };
    return { match: explicit, matchedBy: "explicit_thread_id", reasonCodes: [] };
  }
  const identityMatches = [];
  const titleMatches = [];
  const expectedTitle = cardContract.normalizeThreadTitle(event.card.title);
  for (const thread of threads) {
    const starter = await cardContract.fetchMessage({ channelId: thread.id, messageId: thread.id, token, fetchImpl });
    if (starter.ok && String(starter.payload?.content || "").includes(cardMarker(event.card.id))) {
      identityMatches.push({ ...thread, starter: starter.payload });
    }
    if (cardContract.normalizeThreadTitle(thread.name) === expectedTitle) {
      titleMatches.push({ ...thread, starter: starter.payload });
    }
  }
  if (identityMatches.length > 1) return { match: null, reasonCodes: ["duplicate_stable_card_identity"] };
  if (identityMatches.length === 1) return { match: identityMatches[0], matchedBy: "stable_card_id", reasonCodes: [] };
  if (titleMatches.length > 1) return { match: null, reasonCodes: ["ambiguous_legacy_card_title"] };
  if (titleMatches.length === 1) return { match: titleMatches[0], matchedBy: "unique_legacy_title", reasonCodes: [] };
  return { match: null, matchedBy: "new_card", reasonCodes: [] };
}

async function readThreadMessages({ threadId, token, fetchImpl = fetch }) {
  const payload = [];
  let before = null;
  let pageCount = 0;
  let status = null;

  while (pageCount < MAX_MESSAGE_PAGES) {
    const suffix = before ? `&before=${encodeURIComponent(before)}` : "";
    const response = await cardContract.discordRequest({
      path: `/channels/${threadId}/messages?limit=${MESSAGE_PAGE_LIMIT}${suffix}`,
      token,
      fetchImpl,
    });
    pageCount += 1;
    status = response.status;
    if (!response.ok || !Array.isArray(response.payload)) {
      return { ok: false, status, payload, pageCount, truncated: false };
    }
    payload.push(...response.payload);
    if (response.payload.length < MESSAGE_PAGE_LIMIT) {
      return { ok: true, status, payload, pageCount, truncated: false };
    }
    before = response.payload.at(-1)?.id || null;
    if (!before) break;
  }

  return { ok: false, status, payload, pageCount, truncated: true };
}

async function postJournalMessage({ threadId, content, token, fetchImpl = fetch }) {
  return cardContract.discordRequest({
    path: `/channels/${threadId}/messages`,
    token,
    method: "POST",
    body: { content, allowed_mentions: { parse: [] } },
    fetchImpl,
  });
}

async function setThreadState({ threadId, archived, locked, token, fetchImpl = fetch }) {
  return cardContract.discordRequest({
    path: `/channels/${threadId}`,
    token,
    method: "PATCH",
    body: { archived, locked },
    fetchImpl,
  });
}

async function applyCardEvent({ event: rawEvent, apply, admission, token, fetchImpl = fetch }) {
  const event = normalizeEvent(rawEvent);
  const reasonCodes = validateEvent(event);
  if (apply && !admission.admitted) {
    if (!admission.reasonCodes.includes("board_card_journal_double_guard_missing")) {
      reasonCodes.push("board_card_journal_double_guard_missing");
    }
    reasonCodes.push("board_card_journal_not_admitted");
  }
  if (!token) reasonCodes.push("discord_bot_token_missing");
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, eventId: event.eventId || null, cardId: event.card.id || null, reasonCodes };
  }

  const forum = await cardContract.discordRequest({
    path: `/channels/${event.card.sourceForumChannelId}`,
    token,
    fetchImpl,
  });
  if (!forum.ok || !forum.payload?.guild_id) reasonCodes.push("source_forum_read_failed");
  const inventory = reasonCodes.length === 0
    ? await listForumThreads({
      forumChannelId: event.card.sourceForumChannelId,
      guildId: forum.payload.guild_id,
      token,
      fetchImpl,
    })
    : { ok: false, threads: [], reasonCodes: [] };
  reasonCodes.push(...inventory.reasonCodes);
  const located = inventory.ok
    ? await findCardThread({ event, threads: inventory.threads, token, fetchImpl })
    : { match: null, reasonCodes: [] };
  reasonCodes.push(...located.reasonCodes);
  let existingContent = located.match?.starter?.content || "";
  if (located.match && !located.match.starter) {
    const starter = await cardContract.fetchMessage({
      channelId: located.match.id,
      messageId: located.match.id,
      token,
      fetchImpl,
    });
    if (!starter.ok) reasonCodes.push("card_starter_message_read_failed");
    existingContent = starter.payload?.content || "";
  }
  const canonicalBody = buildCanonicalBody(event, existingContent);
  const journalBody = buildJournalMessage(event);
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, eventId: event.eventId, cardId: event.card.id, reasonCodes: [...new Set(reasonCodes)] };
  }
  const preview = {
    matchedBy: located.matchedBy,
    action: located.match ? "update_card_and_append_journal" : "create_card_and_append_journal",
    threadId: located.match?.id || null,
    canonicalBody,
    journalBody,
  };
  if (!apply) {
    return { ok: true, status: "dry_run", apply, eventId: event.eventId, cardId: event.card.id, preview, reasonCodes: [] };
  }

  let thread = located.match;
  const originalThreadState = thread
    ? { archived: thread.archived, locked: thread.locked }
    : null;
  let historicalThreadReopened = false;
  if (thread?.archived && ACTIVE_STATES.has(event.card.state)) {
    const reopened = await setThreadState({ threadId: thread.id, archived: false, locked: false, token, fetchImpl });
    if (!reopened.ok) reasonCodes.push("active_card_reopen_failed");
    else thread = { ...thread, archived: false, locked: false };
  } else if (thread?.archived) {
    const reopened = await setThreadState({ threadId: thread.id, archived: false, locked: false, token, fetchImpl });
    if (!reopened.ok) reasonCodes.push("historical_card_reopen_failed");
    else {
      historicalThreadReopened = true;
      thread = { ...thread, archived: false, locked: false };
    }
  }
  if (reasonCodes.length > 0) {
    return { ok: false, status: "blocked", apply, eventId: event.eventId, cardId: event.card.id, preview, reasonCodes };
  }

  let threadId = thread?.id || null;
  let starterMessageId = threadId;
  let cardAction = "updated";
  let legacySnapshot = { action: "not_required", messageIds: [], partCount: 0 };
  if (!thread) {
    const created = await cardContract.createForumThread({
      forumChannelId: event.card.sourceForumChannelId,
      token,
      payload: {
        name: event.card.title,
        auto_archive_duration: cardContract.DEFAULT_AUTO_ARCHIVE_DURATION,
        message: { content: canonicalBody, allowed_mentions: { parse: [] } },
      },
      fetchImpl,
    });
    threadId = created.payload?.id || null;
    starterMessageId = created.payload?.message?.id || threadId;
    cardAction = "created";
    if (!created.ok || !threadId || !starterMessageId) reasonCodes.push("card_thread_create_failed");
  } else {
    if (existingContent && !existingContent.includes(CARD_START)) {
      const snapshotMessages = buildLegacySnapshotMessages(event.card.id, existingContent);
      const history = await readThreadMessages({ threadId, token, fetchImpl });
      if (!history.ok || !Array.isArray(history.payload)) {
        reasonCodes.push("legacy_snapshot_history_read_failed");
      } else {
        const messageIds = [];
        let createdCount = 0;
        for (let index = 0; index < snapshotMessages.length; index += 1) {
          const marker = legacySnapshotMarker(event.card.id, index + 1, snapshotMessages.length);
          const existingSnapshot = history.payload.find((message) => String(message?.content || "").includes(marker));
          if (existingSnapshot) {
            messageIds.push(existingSnapshot.id);
            continue;
          }
          const posted = await postJournalMessage({ threadId, content: snapshotMessages[index], token, fetchImpl });
          if (!posted.ok || !posted.payload?.id) {
            reasonCodes.push("legacy_snapshot_create_failed");
            break;
          }
          createdCount += 1;
          messageIds.push(posted.payload.id);
        }
        legacySnapshot = {
          action: createdCount > 0 ? "created" : "reused",
          messageIds,
          partCount: snapshotMessages.length,
        };
      }
    }
    if (reasonCodes.length > 0) {
      if (historicalThreadReopened) {
        const restored = await setThreadState({
          threadId,
          archived: true,
          locked: originalThreadState.locked,
          token,
          fetchImpl,
        });
        if (!restored.ok) reasonCodes.push("historical_card_archive_restore_failed");
      }
      return {
        ok: false,
        status: "blocked",
        apply,
        eventId: event.eventId,
        cardId: event.card.id,
        threadId,
        legacySnapshot,
        reasonCodes: [...new Set(reasonCodes)],
      };
    }
    if (cardContract.normalizeThreadTitle(thread.name) !== cardContract.normalizeThreadTitle(event.card.title)) {
      const renamed = await cardContract.updateThreadName({ threadId, token, name: event.card.title, fetchImpl });
      if (!renamed.ok) reasonCodes.push("card_thread_rename_failed");
    }
    const updated = await cardContract.updateThreadMessage({
      threadId,
      messageId: starterMessageId,
      token,
      message: { content: canonicalBody, allowed_mentions: { parse: [] } },
      fetchImpl,
    });
    if (!updated.ok) reasonCodes.push("card_starter_message_update_failed");
  }

  let journalAction = "not_attempted";
  let journalMessageId = null;
  if (threadId && reasonCodes.length === 0) {
    const messages = await readThreadMessages({ threadId, token, fetchImpl });
    if (!messages.ok || !Array.isArray(messages.payload)) {
      reasonCodes.push("card_journal_history_read_failed");
    } else {
      const existing = messages.payload.find((message) => String(message?.content || "").includes(eventMarker(event.eventId)));
      if (existing) {
        journalAction = "reused";
        journalMessageId = existing.id;
      } else {
        const posted = await postJournalMessage({ threadId, content: journalBody, token, fetchImpl });
        if (!posted.ok || !posted.payload?.id) reasonCodes.push("card_journal_message_create_failed");
        else {
          journalAction = "created";
          journalMessageId = posted.payload.id;
        }
      }
    }
  }

  const starterReadback = threadId
    ? await cardContract.fetchMessage({ channelId: threadId, messageId: starterMessageId, token, fetchImpl })
    : { ok: false, status: null, payload: null };
  const journalReadback = threadId && journalMessageId
    ? await cardContract.fetchMessage({ channelId: threadId, messageId: journalMessageId, token, fetchImpl })
    : { ok: false, status: null, payload: null };
  if (!starterReadback.ok || !String(starterReadback.payload?.content || "").includes(cardMarker(event.card.id))) {
    reasonCodes.push("card_starter_readback_failed");
  }
  if (!journalReadback.ok || !String(journalReadback.payload?.content || "").includes(eventMarker(event.eventId))) {
    reasonCodes.push("card_journal_readback_failed");
  }
  let archiveRestore = "not_required";
  if (historicalThreadReopened) {
    const restored = await setThreadState({
      threadId,
      archived: true,
      locked: originalThreadState.locked,
      token,
      fetchImpl,
    });
    if (!restored.ok) reasonCodes.push("historical_card_archive_restore_failed");
    else archiveRestore = "restored";
  }

  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "journaled" : "partial_failure",
    apply,
    eventId: event.eventId,
    cardId: event.card.id,
    threadId,
    cardAction,
    journalAction,
    journalMessageId,
    legacySnapshot,
    archiveRestore,
    matchedBy: located.matchedBy,
    readback: {
      starter: starterReadback.ok && String(starterReadback.payload?.content || "").includes(cardMarker(event.card.id)),
      journal: journalReadback.ok && String(journalReadback.payload?.content || "").includes(eventMarker(event.eventId)),
    },
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildBoardCardJournal({ payload, allowApply = false, apply = false, env = process.env, fetchImpl = fetch } = {}) {
  const admission = resolveAdmission({ allowApply, env });
  const token = text(env?.DISCORDOS_BOT_TOKEN);
  const events = Array.isArray(payload?.events) ? payload.events : [payload];
  const results = [];
  for (const event of events) {
    results.push(await applyCardEvent({ event, apply, admission, token, fetchImpl }));
  }
  const reasonCodes = [...new Set(results.flatMap((result) => result.reasonCodes || []))];
  return {
    ok: results.every((result) => result.ok),
    status: results.every((result) => result.ok) ? (apply ? "journaled" : "dry_run") : "blocked",
    apply,
    admission,
    eventCount: events.length,
    results,
    reasonCodes,
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Board Card Journal",
    "",
    `- status: \`${result.status}\``,
    `- apply: \`${result.apply}\``,
    `- events: \`${result.eventCount}\``,
    `- reason codes: \`${result.reasonCodes.join(", ") || "none"}\``,
  ];
  for (const row of result.results) {
    lines.push("", `## ${row.cardId || "Unknown card"}`, `- status: \`${row.status}\``, `- thread: \`${row.threadId || "none"}\``, `- journal: \`${row.journalAction || "none"}\``);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(options.inputPath, "utf8"));
  const result = await buildBoardCardJournal({
    payload,
    allowApply: options.allowApply,
    apply: options.apply,
  });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
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
    JOURNAL_ENV,
    JOURNAL_ENV_VALUE,
    CARD_START,
    CARD_END,
    ACTIVE_STATES,
    ALLOWED_STATES,
    AUTONOMOUS_EXECUTION_STATE,
    LIFECYCLE_TRANSITIONS,
    parseArgs,
    resolveAdmission,
    normalizeEvent,
    normalizeCardTitle,
    repairMojibakeText,
    findMojibakeRuns,
    validateLifecycleTransition,
    evaluateAutonomyAdmission,
    validateEvent,
    cardMarker,
    eventMarker,
    legacySnapshotMarker,
    buildLegacySnapshotMessages,
    stripManagedCard,
    parseManagedCardBody,
    buildCanonicalBody,
    buildJournalMessage,
    readArchivedForumThreads,
    listForumThreads,
    readThreadMessages,
    findCardThread,
    applyCardEvent,
    buildBoardCardJournal,
  },
};
