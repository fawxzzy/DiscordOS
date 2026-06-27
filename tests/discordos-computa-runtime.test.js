const assert = require("node:assert/strict");
const test = require("node:test");

const {
  _internals,
} = require("../scripts/discordos-computa-runtime");

test("computa guild command definitions expose the hosted computa surface", () => {
  const commands = _internals.buildGuildCommandsDefinition();
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "computa");
  assert(commands[0].options.some((option) => option.name === "menu"));
  assert(commands[0].options.some((option) => option.name === "post-update"));
  assert(commands[0].options.some((option) => option.name === "goodnight"));
});

test("computa runtime parses legacy message update commands", () => {
  assert.deepEqual(
    _internals.parseMessageUpdateCommand("computa post update [ATLAS | DiscordOS is live]"),
    {
      title: "ATLAS",
      body: "DiscordOS is live",
    },
  );
  assert.equal(_internals.parseMessageUpdateCommand("computa post update bad format"), null);
});

test("computa runtime admits common wake-word typos", () => {
  assert.equal(_internals.resolveMessageCommandKind({ content: "comp0uta" }), "menu");
  assert.equal(_internals.resolveMessageCommandKind({ content: "goodmorning comp0uta" }), "grand-rising");
});

test("computa poll processes a greeting command and marks it successful", async () => {
  const calls = [];
  const result = await _internals.buildDiscordMessageCommandPollResponse({
    env: {
      DISCORDOS_MESSAGE_COMMAND_POLL_SECRET: "secret",
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_MAIN_CHANNEL_ID: "1504674484068552784",
      DISCORDOS_APPLICATION_ID: "1504700208251146371",
      DISCORDOS_GRAND_RISING_CONTENT: "Grand Rising",
    },
    headers: {
      authorization: "Bearer secret",
    },
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/messages?limit=")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([
            {
              id: "msg-1",
              channel_id: "1504674484068552784",
              content: "goodmorning computa",
              author: { id: "123", bot: false },
              reactions: [],
            },
          ]),
        };
      }
      if (init.method === "POST") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "reply-1" }),
        };
      }
      if (init.method === "PUT") {
        return {
          ok: true,
          status: 204,
          text: async () => "",
        };
      }
      throw new Error(`Unexpected fetch: ${String(url)} ${init.method || "GET"}`);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.processed.length, 1);
  assert.equal(result.body.processed[0].commandKind, "grand-rising");
  assert(calls.some((call) => call.init.method === "POST"));
  assert(calls.some((call) => call.init.method === "PUT"));
});
