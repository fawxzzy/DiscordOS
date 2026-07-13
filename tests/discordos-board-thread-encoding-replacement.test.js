const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-thread-encoding-replacement");
const { _internals: journal } = require("../scripts/discordos-board-card-journal");

function response({ ok = true, status = 200, payload = null } = {}) {
  return { ok, status, json: async () => payload };
}

const cleanTitle = "Feature: History - Progress";
const corruptedTitle = "Feature: History \u00e2\u20ac\u201d Progress";
const starter = `${journal.CARD_START}\nATLAS-CARD-ID: \`FIT-1\`\n- state: \`review\`\n- updated: \`2026-07-13\`\n${journal.CARD_END}`;

test("only canonical cards with bot-owned matching rename corruption are eligible", () => {
  const result = _internals.classifySource({
    thread: { id: "123", name: cleanTitle },
    starter: { content: starter },
    messages: [{ id: "rename", type: 4, content: corruptedTitle, author: { id: "bot", bot: true } }],
    botUserId: "bot",
  });
  assert.equal(result.candidate, true);
  assert.equal(result.eligible, true);
  assert.equal(result.cardId, "FIT-1");
});

test("replacement and superseded markers preserve one current stable identity", () => {
  const replacement = _internals.buildReplacementStarter(starter, "123");
  const superseded = _internals.buildSupersededBody({ guildId: "guild", replacementThreadId: "456" });
  assert(replacement.includes("ATLAS-CARD-ID: `FIT-1`"));
  assert(replacement.includes("ATLAS-ENCODING-REPLACEMENT-OF: `123`"));
  assert(superseded.includes("ATLAS-SUPERSEDED-CARD: `456`"));
  assert(!superseded.includes("ATLAS-CARD-ID"));
});

test("live replacement requires both mutation guards", async () => {
  const result = await _internals.buildBoardThreadEncodingReplacement({
    payload: { boards: [] },
    apply: true,
    allowApply: false,
    env: { DISCORDOS_BOT_TOKEN: "token" },
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("board_thread_replacement_not_admitted"));
});

test("dry run discovers one replacement without mutation", async () => {
  const calls = [];
  const result = await _internals.buildBoardThreadEncodingReplacement({
    payload: { boards: [{ id: "fitness", forumChannelId: "forum" }] },
    env: { DISCORDOS_BOT_TOKEN: "token" },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.endsWith("/users/@me")) return response({ payload: { id: "bot", bot: true } });
      if (url.endsWith("/channels/forum")) return response({ payload: { guild_id: "guild" } });
      if (url.endsWith("/guilds/guild/threads/active")) {
        return response({ payload: { threads: [{ id: "123", name: cleanTitle, parent_id: "forum", applied_tags: ["tag"], thread_metadata: { archived: false } }] } });
      }
      if (url.endsWith("/channels/forum/threads/archived/public?limit=100")) return response({ payload: { threads: [] } });
      if (url.endsWith("/channels/123/messages/123")) return response({ payload: { id: "123", content: starter } });
      if (url.endsWith("/channels/123/messages?limit=100")) {
        return response({ payload: [{ id: "rename", type: 4, content: corruptedTitle, author: { id: "bot", bot: true } }] });
      }
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.candidateCount, 1);
  assert(calls.every((call) => call.method === "GET"));
});
