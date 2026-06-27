const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-testing-surface-provision");

test("testing surface provision parses guarded apply args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--guild-id",
    "1504668396338413670",
    "--allow-provision",
    "--apply",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.guildId, "1504668396338413670");
  assert.equal(parsed.allowProvision, true);
  assert.equal(parsed.apply, true);
});

test("testing surface provision defaults to the committed DiscordOS guild", () => {
  const parsed = _internals.parseArgs([]);

  assert.equal(parsed.guildId, "1504668396338413670");
  assert.equal(parsed.categoryName, "testing");
  assert.equal(parsed.channelName, "discordos-testing");
});

test("testing surface provision dry run does not call Discord", async () => {
  const result = await _internals.buildTestingSurfaceProvision({
    guildId: "1504668396338413670",
    env: {},
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.status, "dry_run");
});

test("testing surface provision blocks partial guard", async () => {
  const result = await _internals.buildTestingSurfaceProvision({
    guildId: "1504668396338413670",
    allowProvision: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("testing_surface_double_guard_missing"));
});

test("testing surface provision reuses existing testing category and channel", async () => {
  const result = await _internals.buildTestingSurfaceProvision({
    guildId: "1504668396338413670",
    allowProvision: true,
    apply: true,
    env: {
      DISCORDOS_TESTING_SURFACE_PROVISION: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { id: "cat-1", name: "testing", type: 4 },
        { id: "chan-1", name: "discordos-testing", type: 0, parent_id: "cat-1" },
      ],
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.testingChannelId, "chan-1");
  assert.equal(result.channelState.createdChannel, false);
});

test("testing surface provision creates missing channel under testing category", async () => {
  const calls = [];
  const result = await _internals.buildTestingSurfaceProvision({
    guildId: "1504668396338413670",
    allowProvision: true,
    apply: true,
    env: {
      DISCORDOS_TESTING_SURFACE_PROVISION: "enabled",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "cat-1", name: "testing", type: 4 }],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "chan-1", name: "discordos-testing", type: 0, parent_id: "cat-1" }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.channelState.createdChannel, true);
  assert.equal(JSON.parse(calls[1].init.body).parent_id, "cat-1");
});
