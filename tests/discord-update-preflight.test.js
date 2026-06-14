const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-preflight");
const {
  _internals: targetAdmissionInternals,
} = require("../scripts/discord-update-target-admission");

function message({
  id = "1516000000000000000",
  channelId = "1504671871512346695",
  timestamp = "2026-06-13T20:00:00.000000+00:00",
  title = "DiscordOS Runtime Hardening Closed",
} = {}) {
  return {
    id,
    channel_id: channelId,
    timestamp,
    embeds: [
      {
        title,
      },
    ],
  };
}

function markerBoardMarkdown() {
  return [
    "# Lanes And Markers",
    "",
    "## Active Front-Page Marker Table",
    "",
    "- AI Long-Run Batch Orchestration: `49%`",
  ].join("\n");
}

async function writeMarkerBoard(markdown = markerBoardMarkdown()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-preflight-markers-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

test("discord update preflight args default to local no-send validation", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    probeLive: false,
    expectedName: _internals.DEFAULT_EXPECTED_CHANNEL_NAME,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    markers: [],
    limit: _internals.DEFAULT_LIMIT,
  });
});

test("discord update preflight parses post body target and lookup options", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--probe-live",
      "--expected-name",
      "Updates",
      "--title",
      "DiscordOS Runtime Hardening Closed",
      "--body-file",
      "docs/ops/post.md",
      "--body-section",
      "Update Post",
      "--marker",
      "AI Long-Run Batch Orchestration",
      "--limit",
      "10",
    ]),
    {
      json: true,
      probeLive: true,
      expectedName: "updates",
      title: "DiscordOS Runtime Hardening Closed",
      body: null,
      bodyFile: "docs/ops/post.md",
      bodySection: "Update Post",
      markers: ["AI Long-Run Batch Orchestration"],
      limit: 10,
    }
  );
});

test("discord update preflight validates limit bounds", () => {
  assert.throws(() => _internals.parseArgs(["--limit", "0"]), /invalid_limit/);
  assert.throws(() => _internals.parseArgs(["--limit", "101"]), /invalid_limit/);
});

test("discord update preflight reports invalid payload without throwing", async () => {
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "DiscordOS Runtime Hardening Closed",
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.payload.status, "invalid");
  assert.deepEqual(result.payload.reasonCodes, ["missing_body_or_body_file"]);
  assert.equal(result.duplicateCheck.status, "skipped");
  assert.equal(result.sendsMessages, false);
});

test("discord update preflight passes locally and skips live duplicate lookup", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "DiscordOS Runtime Hardening Closed",
    body: "Runtime hardening is closed.",
    markers: ["AI Long-Run Batch Orchestration"],
    markerFilePath,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.payload.status, "valid");
  assert(result.payload.bodyChars > "Runtime hardening is closed.".length);
  assert.equal(result.notificationRoute.routeId, "updates-publication-info");
  assert.equal(result.notificationRoute.target, "updates");
  assert.equal(result.payload.markerProgress.summary.markerCount, 1);
  assert.equal(result.targetAdmission.liveProbe.status, "skipped");
  assert.equal(result.duplicateCheck.status, "skipped");
  assert.equal(result.event.type, "discordos.updates.preflight_ready");
});

test("discord update preflight live probe passes when no duplicate title is found", async () => {
  const requests = [];
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "New DiscordOS Update",
    body: "Fresh update body.",
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: " 1504671871512346695\n",
      DISCORDOS_BOT_TOKEN: " bot-secret\n",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      if (url === `${targetAdmissionInternals.DISCORD_API_BASE}/channels/1504671871512346695`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "updates",
            type: 5,
          }),
        };
      }
      assert.equal(
        url,
        `${targetAdmissionInternals.DISCORD_API_BASE}/channels/1504671871512346695/messages?limit=${_internals.DEFAULT_LIMIT}`
      );
      return {
        ok: true,
        status: 200,
        json: async () => [
          message({
            title: "Older Update",
          }),
        ],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(requests.length, 2);
  assert.equal(result.notificationRoute.targetEnv, "DISCORDOS_UPDATES_CHANNEL_ID");
  assert.equal(result.targetAdmission.liveProbe.httpStatus, 200);
  assert.equal(result.duplicateCheck.status, "not_found");
  assert.equal(result.duplicateCheck.searchedMessages, 1);
});

test("discord update preflight blocks duplicate live update titles", async () => {
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "DiscordOS Runtime Hardening Closed",
    body: "Runtime hardening is closed.",
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url) => {
      if (url === `${targetAdmissionInternals.DISCORD_API_BASE}/channels/1504671871512346695`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: "updates",
            type: 5,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [message()],
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.duplicateCheck.status, "duplicate_found");
  assert.equal(result.duplicateCheck.duplicate.messageId, "1516000000000000000");
  assert.deepEqual(result.duplicateCheck.reasonCodes, ["updates_duplicate_title_found"]);
  assert.equal(result.event.type, "discordos.updates.preflight_blocked");
});

test("discord update preflight blocks target drift before duplicate lookup", async () => {
  let requestCount = 0;
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "New DiscordOS Update",
    body: "Fresh update body.",
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      requestCount += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "alerts",
          type: 5,
        }),
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(requestCount, 1);
  assert.deepEqual(result.targetAdmission.reasonCodes, ["updates_channel_points_to_alerts"]);
  assert.equal(result.duplicateCheck.status, "skipped");
  assert.deepEqual(result.duplicateCheck.reasonCodes, ["target_not_admitted"]);
});

test("discord update preflight blocks when notification route is not admitted", async () => {
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "New DiscordOS Update",
    body: "Fresh update body.",
    probeLive: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    notificationRouter: {
      buildNotificationRouteDecision: async () => ({
        ok: false,
        route: null,
        routeDecision: {
          status: "blocked",
        },
        reasonCodes: ["notification_route_not_found"],
      }),
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.notificationRoute.ok, false);
  assert.deepEqual(result.reasonCodes, [
    "notification_route_not_admitted",
    "notification_route_not_found",
  ]);
  assert.equal(result.duplicateCheck.status, "skipped");
  assert.deepEqual(result.duplicateCheck.reasonCodes, ["notification_route_not_admitted"]);
});

test("discord update preflight renders markdown without token values or full body", async () => {
  const body = "Sensitive body should not be rendered wholesale.";
  const result = await _internals.buildDiscordUpdatePreflight({
    title: "New DiscordOS Update",
    body,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Update Preflight"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("payload title: `New DiscordOS Update`"));
  assert(rendered.includes("notification route: `updates-publication-info`"));
  assert(rendered.includes(`payload body chars: \`${body.length}\``));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes(body));
});
