const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-card-contract");

function response({ ok = true, status = 200, payload = null } = {}) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function canonicalBody({
  cardId = "FIT-42",
  updatedAt = "2026-07-14T22:00:00.000Z",
  summary = "Canonical summary",
} = {}) {
  return [
    _internals.CANONICAL_CARD_START,
    `ATLAS-CARD-ID: \`${cardId}\``,
    "- project: `Fitness`",
    "- type: `feature`",
    "- state: `planning`",
    "- priority: `High`",
    "- owner: `Fitness`",
    "- progress: `20%`",
    `- updated: \`${updatedAt}\``,
    "",
    "## Summary",
    summary,
    "",
    "## Objective",
    "- Deliver the governed outcome.",
    "",
    "## Acceptance criteria",
    "- The result is verified.",
    "",
    "## Next actions",
    "- Run focused verification.",
    _internals.CANONICAL_CARD_END,
  ].join("\n");
}

test("canonical formatter normalizes Mazer titles without double prefixes", () => {
  const board = {
    board: {
      id: "mazer",
      label: "mazer",
      titleContract: {
        style: "prefix",
        prefix: "mazer",
        separator: ": ",
        maxLength: 100,
      },
    },
  };

  assert.equal(
    _internals.formatCanonicalCardTitle({
      board,
      card: { id: "card-1", title: "AI level, rank, and maze progression contract" },
    }),
    "mazer: AI level, rank, and maze progression contract"
  );
  assert.equal(
    _internals.formatCanonicalCardTitle({
      board,
      card: { id: "card-1", title: "mazer: mazer: AI level, rank, and maze progression contract" },
    }),
    "mazer: AI level, rank, and maze progression contract"
  );
});

test("plain formatter keeps healthy-board title style deterministic", () => {
  const board = { board: { id: "music-sesh-feedback", label: "Music Sesh Feedback" } };

  assert.equal(
    _internals.formatCanonicalCardTitle({
      board,
      card: {
        id: "music-sesh-phase-8-cross-service-room-sync-simple-controls",
        title: "Music Sesh Phase 8 - Cross-Service Room Sync + Simple Controls",
      },
    }),
    "Music Sesh Phase 8 - Cross-Service Room Sync + Simple Controls"
  );
});

test("canonical starter inspection requires the full identity, ownership, body, and timestamp contract", () => {
  const complete = _internals.inspectCanonicalCardBody(canonicalBody());
  const incomplete = _internals.inspectCanonicalCardBody([
    _internals.CANONICAL_CARD_START,
    "ATLAS-CARD-ID: `FIT-42`",
    "- project: `Fitness`",
    "- state: `planning`",
    "- owner: `Fitness`",
    "- priority: `High`",
    "## Summary",
    "Summary only",
    _internals.CANONICAL_CARD_END,
  ].join("\n"));

  assert.equal(complete.complete, true);
  assert.equal(complete.card.id, "FIT-42");
  assert.equal(complete.card.updatedAt, "2026-07-14T22:00:00.000Z");
  assert.deepEqual(incomplete.missingFields, [
    "objective",
    "acceptance_criteria",
    "next_actions",
    "updated_timestamp",
  ]);
});

test("canonical starter update blocks incomplete, older, and equal-timestamp replacement bodies", () => {
  const existingContent = canonicalBody();
  const incomplete = _internals.evaluateStarterMessageUpdate({
    existingContent,
    proposedContent: "legacy config body",
  });
  const older = _internals.evaluateStarterMessageUpdate({
    existingContent,
    proposedContent: canonicalBody({ updatedAt: "2026-07-14T21:59:59.000Z", summary: "Older summary" }),
  });
  const equalTimestamp = _internals.evaluateStarterMessageUpdate({
    existingContent,
    proposedContent: canonicalBody({ summary: "Conflicting summary" }),
  });
  const newer = _internals.evaluateStarterMessageUpdate({
    existingContent,
    proposedContent: canonicalBody({ updatedAt: "2026-07-14T22:00:01.000Z", summary: "Newer summary" }),
  });

  assert.deepEqual(incomplete.reasonCodes, ["canonical_card_body_downgrade_prevented"]);
  assert(older.reasonCodes.includes("canonical_card_body_older_than_live"));
  assert(equalTimestamp.reasonCodes.includes("canonical_card_body_timestamp_conflict"));
  assert.equal(newer.ok, true);
  assert.equal(newer.action, "update");
});

test("generic forum-card preflight blocks noncanonical source bodies before any board writer mutation", async () => {
  const calls = [];
  const spec = {
    cardId: "FIT-42",
    canonicalTitle: "Feature: Governed Fitness card",
    proposedTitle: "Feature: Governed Fitness card",
    requiredReactions: [{ name: "failure", id: "1507384094424694785" }],
  };
  const result = await _internals.upsertDiscordForumCard({
    spec,
    existingThread: {
      id: "fitness-thread-42",
      name: spec.canonicalTitle,
      messageId: "fitness-thread-42",
    },
    forumChannelId: "fitness-forum",
    token: "token",
    apply: true,
    buildPayload: () => ({
      name: spec.canonicalTitle,
      message: { content: "stale noncanonical source body", allowed_mentions: { parse: [] } },
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      return response({
        payload: {
          id: "fitness-thread-42",
          content: canonicalBody(),
          reactions: [{
            emoji: { name: "failure", id: "1507384094424694785" },
            count: 1,
            me: true,
          }],
        },
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "blocked");
  assert.deepEqual(result.reasonCodes, ["canonical_card_body_downgrade_prevented"]);
  assert.deepEqual(calls, [{
    url: `${_internals.DISCORD_API_BASE}/channels/fitness-thread-42/messages/fitness-thread-42`,
    method: "GET",
  }]);
});

test("ensureRequiredReaction is idempotent when bot reaction already exists", async () => {
  const calls = [];
  const result = await _internals.ensureRequiredReaction({
    channelId: "thread-1",
    messageId: "message-1",
    token: "token",
    emoji: { name: "failure", id: "1507384094424694785" },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      assert(url.endsWith("/channels/thread-1/messages/message-1"));
      return response({
        payload: {
          reactions: [
            { emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true },
          ],
        },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "already_present");
  assert.equal(calls.length, 1);
});

test("ensureRequiredReaction retries rate-limited add and requires readback", async () => {
  const calls = [];
  const result = await _internals.ensureRequiredReaction({
    channelId: "thread-1",
    messageId: "message-1",
    token: "token",
    emoji: { name: "failure", id: "1507384094424694785" },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/channels/thread-1/messages/message-1") && init.method === "GET" && calls.length === 1) {
        return response({ payload: { reactions: [] } });
      }
      if (url.includes("/reactions/failure%3A1507384094424694785/@me") && calls.filter((call) => call.method === "PUT").length === 1) {
        return response({ ok: false, status: 429, payload: { retry_after: 0 } });
      }
      if (url.includes("/reactions/failure%3A1507384094424694785/@me")) {
        return response({ status: 204, payload: null });
      }
      return response({
        payload: {
          reactions: [
            { emoji: { name: "failure", id: "1507384094424694785" }, count: 1, me: true },
          ],
        },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "applied");
  assert.equal(calls.filter((call) => call.method === "PUT").length, 2);
});

test("upsertDiscordForumCard does not mark partial title success as complete when reaction fails", async () => {
  const calls = [];
  const spec = {
    cardId: "mazer-card-1",
    stableIdentity: "mazer-card-1",
    canonicalTitle: "mazer: card one",
    proposedTitle: "Card One",
    requiredReactions: [{ name: "failure", id: "1507384094424694785" }],
    card: {
      id: "mazer-card-1",
      title: "Card One",
      state: "open",
    },
  };
  const result = await _internals.upsertDiscordForumCard({
    spec,
    existingThread: {
      id: "thread-1",
      name: "Card One",
      messageId: "message-1",
    },
    forumChannelId: "forum-1",
    token: "token",
    apply: true,
    buildPayload: () => ({
      name: spec.canonicalTitle,
      message: { content: "body", allowed_mentions: { parse: [] } },
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/channels/thread-1") && init.method === "PATCH") {
        return response({ payload: { id: "thread-1", name: "mazer: card one" } });
      }
      if (url.endsWith("/channels/thread-1/messages/message-1") && init.method === "PATCH") {
        return response({ payload: { id: "message-1" } });
      }
      if (url.endsWith("/channels/thread-1/messages/message-1") && init.method === "GET") {
        return response({ payload: { content: "body", reactions: [] } });
      }
      if (url.endsWith("/channels/thread-1") && init.method === "GET") {
        return response({ payload: { id: "thread-1", name: "mazer: card one" } });
      }
      if (url.includes("/reactions/failure%3A1507384094424694785/@me")) {
        return response({ ok: false, status: 403, payload: { message: "Missing Permissions" } });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("required_reaction_permission_denied"));
  assert(calls.some((call) => call.url.endsWith("/channels/thread-1") && call.method === "PATCH"));
});

test("proposed corrupt card text blocks before any writer mutation", async () => {
  const calls = [];
  const spec = {
    cardId: "unicode-card",
    canonicalTitle: "Feature: corrupt \u00e2\u20ac\u201d title",
    proposedTitle: "Feature: corrupt title",
    requiredReactions: [{ name: "failure", id: "1507384094424694785" }],
  };
  const result = await _internals.upsertDiscordForumCard({
    spec,
    forumChannelId: "forum",
    token: "token",
    apply: true,
    buildPayload: () => ({
      name: spec.canonicalTitle,
      message: { content: "clean body", allowed_mentions: { parse: [] } },
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "blocked");
  assert(result.reasonCodes.includes("card_proposed_text_integrity_failed"));
  assert.deepEqual(calls, []);
});

test("Unicode writes require exact title and starter code-point readback", async () => {
  const title = "Feature: \u201cJos\u00e9\u201d \u2014 \u674e";
  const content = "Canonical \u2013 starter for Fran\u00e7ois";
  let reactionApplied = false;
  const spec = {
    cardId: "unicode-card",
    canonicalTitle: title,
    proposedTitle: title,
    requiredReactions: [{ name: "failure", id: "1507384094424694785" }],
  };
  const result = await _internals.upsertDiscordForumCard({
    spec,
    forumChannelId: "forum",
    token: "token",
    apply: true,
    buildPayload: () => ({
      name: title,
      message: { content, allowed_mentions: { parse: [] } },
    }),
    fetchImpl: async (url, init) => {
      if (url.endsWith("/channels/forum/threads") && init.method === "POST") {
        return response({ status: 201, payload: { id: "unicode-thread", message: { id: "unicode-message" } } });
      }
      if (url.endsWith("/channels/unicode-thread") && init.method === "GET") {
        return response({ payload: { id: "unicode-thread", name: title } });
      }
      if (url.endsWith("/channels/unicode-thread/messages/unicode-message") && init.method === "GET") {
        return response({ payload: {
          id: "unicode-message",
          content,
          reactions: reactionApplied ? [{
            emoji: { name: "failure", id: "1507384094424694785" },
            count: 1,
            me: true,
          }] : [],
        } });
      }
      if (url.includes("/reactions/failure%3A1507384094424694785/@me") && init.method === "PUT") {
        reactionApplied = true;
        return response({ status: 204 });
      }
      throw new Error(`unexpected request ${init.method} ${url}`);
    },
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.textReadback.titleExact, true);
  assert.equal(result.textReadback.starterExact, true);
  assert.deepEqual(result.textReadback.expectedTitleCodePoints, result.textReadback.actualTitleCodePoints);
  assert(result.textReadback.actualTitleCodePoints.includes("U+2014"));
  assert(result.textReadback.actualTitleCodePoints.includes("U+00E9"));
});

test("ASCII-substituted readback fails exact Unicode verification", async () => {
  const result = await _internals.readBackExactCardText({
    threadId: "thread",
    messageId: "thread",
    expectedTitle: "History \u2014 Jos\u00e9",
    expectedContent: "Quoted \u201cproof\u201d",
    token: "token",
    fetchImpl: async (url) => {
      if (url.endsWith("/channels/thread")) return response({ payload: { name: "History - Jose" } });
      if (url.endsWith("/channels/thread/messages/thread")) return response({ payload: { content: 'Quoted "proof"' } });
      throw new Error(`unexpected request ${url}`);
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, [
    "card_thread_title_exact_readback_failed",
    "card_starter_text_exact_readback_failed",
  ]);
  assert(result.expectedTitleCodePoints.includes("U+2014"));
  assert(!result.actualTitleCodePoints.includes("U+2014"));
});
