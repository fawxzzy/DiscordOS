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

test("computa poll ignores commands already marked by custom emoji id pairs", async () => {
  const result = await _internals.buildDiscordMessageCommandPollResponse({
    env: {
      DISCORDOS_MESSAGE_COMMAND_POLL_SECRET: "secret",
      DISCORDOS_BOT_TOKEN: "bot-token",
      DISCORDOS_MAIN_CHANNEL_ID: "1504674484068552784",
    },
    headers: {
      authorization: "Bearer secret",
    },
    fetchImpl: async (url) => {
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
              reactions: [
                {
                  emoji: {
                    id: "1507384062166302851",
                    name: "success",
                  },
                },
              ],
            },
          ]),
        };
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.body.processed, []);
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

test("computa feedback panel payload preserves the launcher buttons", () => {
  const payload = _internals.buildFeedbackPanelPayload();
  assert.equal(payload.embeds[0].title, "Feedback Submission");
  assert.equal(payload.components[0].components[0].custom_id, "discordos_feedback_submit_open");
  assert.equal(payload.components[0].components[1].custom_id, "discordos_feedback_update_open");
  assert.equal(_internals.discordMessageHasFeedbackPanel(payload), true);
});

test("computa setup-feedback interaction refreshes the feedback launcher from DiscordOS", async () => {
  const calls = [];
  const result = await _internals.handleComputaInteraction({
    interaction: {
      channel_id: "1504674484068552784",
      user: { id: "552278941159784460" },
      data: {
        options: [
          {
            type: 1,
            name: "setup-feedback",
            options: [],
          },
        ],
      },
    },
    env: {
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async (url, init = {}) => {
      const key = `${init.method || "GET"} ${String(url)}`;
      calls.push(key);
      if (key === "GET https://discord.com/api/v10/guilds/1504668396338413670/channels") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([]),
        };
      }
      if (key === "GET https://discord.com/api/v10/channels/1504674484068552784") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: "1504674484068552784",
            name: "main",
            type: 0,
            parent_id: "cat-1",
            position: 3,
          }),
        };
      }
      if (key === "POST https://discord.com/api/v10/guilds/1504668396338413670/channels") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: "feedback-chan",
            name: "feedback-submission",
            type: 0,
          }),
        };
      }
      if (key === "GET https://discord.com/api/v10/channels/feedback-chan/messages?limit=50") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([]),
        };
      }
      if (key === "POST https://discord.com/api/v10/channels/feedback-chan/messages") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "panel-1" }),
        };
      }
      throw new Error(`Unexpected fetch: ${key}`);
    },
  });

  assert.equal(result.data.content, "Feedback launcher created in <#feedback-chan>.");
  assert(calls.includes("POST https://discord.com/api/v10/channels/feedback-chan/messages"));
});

test("computa release-check interaction refreshes the release card when the forum is clean", async () => {
  const result = await _internals.handleComputaInteraction({
    interaction: {
      channel_id: "1504674484068552784",
      user: { id: "552278941159784460" },
      data: {
        options: [
          {
            type: 1,
            name: "release-check",
            options: [],
          },
        ],
      },
    },
    env: {
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    fetchImpl: async (url, init = {}) => {
      const key = `${init.method || "GET"} ${String(url)}`;
      if (key === "GET https://discord.com/api/v10/channels/1504673475489562744") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: "1504673475489562744",
            available_tags: [
              { id: "tag-1", name: "Resolved" },
            ],
          }),
        };
      }
      if (key === "GET https://discord.com/api/v10/guilds/1504668396338413670/threads/active") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            threads: [
              {
                id: "thread-1",
                parent_id: "1504673475489562744",
                applied_tags: ["tag-1"],
              },
            ],
          }),
        };
      }
      if (key === "GET https://discord.com/api/v10/channels/1504673475489562744/threads/archived/public?limit=100") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ threads: [] }),
        };
      }
      if (key === "GET https://discord.com/api/v10/channels/1504673475489562744/threads/archived/private?limit=100") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ threads: [] }),
        };
      }
      if (key === "GET https://discord.com/api/v10/channels/thread-1/messages/thread-1") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: "thread-1",
            reactions: [
              {
                emoji: {
                  id: "1507384062166302851",
                  name: "success",
                },
              },
            ],
          }),
        };
      }
      if (key === "GET https://discord.com/api/v10/channels/1504674484068552784/messages?limit=25") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([]),
        };
      }
      if (key === "POST https://discord.com/api/v10/channels/1504674484068552784/messages") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "release-1" }),
        };
      }
      throw new Error(`Unexpected fetch: ${key}`);
    },
  });

  assert.equal(result.data.content, "Release check is clean. Card refreshed in this channel.");
});
