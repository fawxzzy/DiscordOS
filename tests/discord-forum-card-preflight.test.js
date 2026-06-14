const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-forum-card-preflight");
const {
  _internals: targetAdmissionInternals,
} = require("../scripts/discord-update-target-admission");
const { _internals: markerInternals } = require("../scripts/discordos-workflow-marker-progress");

function message({
  id = "1516000000000000000",
  channelId = "1504671871512346695",
  timestamp = "2026-06-14T20:00:00.000000+00:00",
  title = "Feedback Ops Card card-123 Opened",
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
    "- DiscordOS Forum/Card Operations: `52%`",
  ].join("\n");
}

async function writeMarkerBoard(markdown = markerBoardMarkdown()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-forum-card-preflight-markers-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

test("discord forum card preflight args default to local no-send validation", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    probeLive: false,
    expectedName: _internals.DEFAULT_EXPECTED_CHANNEL_NAME,
    workflow: null,
    cardId: null,
    state: null,
    stateNote: null,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    markers: [],
    markerFilePath: markerInternals.DEFAULT_MARKER_FILE_PATH,
    limit: _internals.DEFAULT_LIMIT,
  });
});

test("discord forum card preflight parses workflow card marker and live options", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--probe-live",
      "--expected-name",
      "Updates",
      "--workflow",
      "Feedback Ops",
      "--card-id",
      "card-123",
      "--state",
      "in-progress",
      "--state-note",
      "Preflight proof",
      "--body-file",
      "docs/ops/post.md",
      "--body-section",
      "Card Update",
      "--marker",
      "DiscordOS Forum/Card Operations",
      "--marker-file",
      "docs/ops/markers.md",
      "--limit",
      "10",
    ]),
    {
      json: true,
      probeLive: true,
      expectedName: "updates",
      workflow: "Feedback Ops",
      cardId: "card-123",
      state: "in-progress",
      stateNote: "Preflight proof",
      title: null,
      body: null,
      bodyFile: "docs/ops/post.md",
      bodySection: "Card Update",
      markers: ["DiscordOS Forum/Card Operations"],
      markerFilePath: "docs/ops/markers.md",
      limit: 10,
    }
  );
});

test("discord forum card preflight validates limit bounds", () => {
  assert.throws(() => _internals.parseArgs(["--limit", "0"]), /invalid_limit/);
  assert.throws(() => _internals.parseArgs(["--limit", "101"]), /invalid_limit/);
});

test("discord forum card preflight reports invalid payload without throwing", async () => {
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
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

test("discord forum card preflight passes locally and skips live duplicate lookup", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body: "Work has started.",
    markers: ["DiscordOS Forum/Card Operations"],
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
  assert(result.payload.bodyChars > "Work has started.".length);
  assert.equal(result.notificationRoute.routeId, "forum-card-lifecycle-info");
  assert.equal(result.notificationRoute.target, "updates");
  assert.equal(result.payload.markerProgress.summary.markerCount, 1);
  assert.equal(result.targetAdmission.liveProbe.status, "skipped");
  assert.equal(result.duplicateCheck.status, "skipped");
  assert.equal(result.event.type, "discordos.forum_card.preflight_ready");
});

test("discord forum card preflight live probe passes when no duplicate title is found", async () => {
  const requests = [];
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body: "Fresh forum-card body.",
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
            title: "Older Card Update",
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

test("discord forum card preflight blocks duplicate live titles", async () => {
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body: "Work has started.",
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
  assert.equal(result.event.type, "discordos.forum_card.preflight_blocked");
});

test("discord forum card preflight blocks target drift before duplicate lookup", async () => {
  let requestCount = 0;
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body: "Work has started.",
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

test("discord forum card preflight blocks when notification route is not admitted", async () => {
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body: "Work has started.",
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

test("discord forum card preflight renders markdown without token values or full body", async () => {
  const body = "Sensitive card body should not be rendered wholesale.";
  const result = await _internals.buildDiscordForumCardPreflight({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Forum Card Preflight"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("payload title: `Feedback Ops Card card-123 Opened`"));
  assert(rendered.includes("notification route: `forum-card-lifecycle-info`"));
  assert(rendered.includes(`payload body chars: \`${result.payload.bodyChars}\``));
  assert(!rendered.includes("bot-secret"));
  assert(!rendered.includes(body));
});
