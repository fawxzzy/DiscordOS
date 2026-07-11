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
        return response({ payload: { reactions: [] } });
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
