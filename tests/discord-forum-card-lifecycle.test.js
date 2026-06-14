const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-forum-card-lifecycle");
const { _internals: updatePostInternals } = require("../scripts/discord-update-post");
const { _internals: markerInternals } = require("../scripts/discordos-workflow-marker-progress");

function markerBoardMarkdown() {
  return [
    "# Lanes And Markers",
    "",
    "## Active Front-Page Marker Table",
    "",
    "- DiscordOS Forum/Card Operations: `0%`",
    "",
    "## Supporting Open Markers",
    "",
    "- DiscordOS Update-Post Workflow v2: `30%`",
  ].join("\n");
}

async function writeMarkerBoard(markdown = markerBoardMarkdown()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-forum-card-markers-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

function channelProbeBody(name = "updates") {
  return {
    name,
    type: 5,
  };
}

function message({
  id = "1516000000000000000",
  channelId = "1504671871512346695",
  timestamp = "2026-06-14T12:00:00.000000+00:00",
  title = "Older Card",
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

test("forum card lifecycle args default to no-send command", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    workflow: null,
    cardId: null,
    state: null,
    stateNote: null,
    title: null,
    body: null,
    bodyFile: null,
    bodySection: null,
    receiptFile: null,
    markers: [],
    markerFilePath: markerInternals.DEFAULT_MARKER_FILE_PATH,
    apply: false,
  });
});

test("forum card lifecycle args parse card state markers receipt and apply", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--workflow",
      "DiscordOS",
      "--card-id",
      "card-123",
      "--state",
      "in-progress",
      "--state-note",
      "Wiring lifecycle dry-run",
      "--title",
      "Lifecycle update",
      "--body-file",
      "docs/ops/post.md",
      "--body-section",
      "Update Post",
      "--receipt-file",
      "docs/ops/post.md",
      "--marker",
      "DiscordOS Forum/Card Operations",
      "--marker-file",
      "docs/ops/markers.md",
      "--apply",
    ]),
    {
      json: true,
      workflow: "DiscordOS",
      cardId: "card-123",
      state: "in-progress",
      stateNote: "Wiring lifecycle dry-run",
      title: "Lifecycle update",
      body: null,
      bodyFile: "docs/ops/post.md",
      bodySection: "Update Post",
      receiptFile: "docs/ops/post.md",
      markers: ["DiscordOS Forum/Card Operations"],
      markerFilePath: "docs/ops/markers.md",
      apply: true,
    }
  );
});

test("forum card lifecycle normalizes states and generated titles", () => {
  assert.equal(_internals.normalizeForumCardState("in-progress"), "in_progress");
  assert.equal(_internals.formatForumCardState("in_progress"), "In Progress");
  assert.equal(
    _internals.buildForumCardLifecycleTitle({
      workflow: "DiscordOS",
      cardId: "card-123",
      state: "completed",
    }),
    "DiscordOS Card card-123 Completed"
  );
  assert.throws(
    () => _internals.normalizeForumCardState("published"),
    /invalid_forum_card_state:published/
  );
});

test("forum card lifecycle builds metadata and marker body", () => {
  const body = _internals.buildForumCardLifecycleBody({
    workflow: "DiscordOS",
    cardId: "card-123",
    state: "in_progress",
    stateNote: "Dry-run ready",
    body: "Operator-facing body.",
    markerProgress: {
      sourceRef: "docs/atlas-book/02-lanes-and-markers.md",
      markers: [
        {
          name: "DiscordOS Forum/Card Operations",
          completionPercent: 0,
          sectionLabels: ["active front-page"],
        },
      ],
      summary: {
        markerCount: 1,
        openMarkerCount: 1,
        closedMarkerCount: 0,
        lowestCompletionPercent: 0,
        highestCompletionPercent: 0,
      },
    },
  });

  assert(body.includes("## Card Lifecycle"));
  assert(body.includes("workflow: `DiscordOS`"));
  assert(body.includes("state: `in_progress`"));
  assert(body.includes("Operator-facing body."));
  assert(body.includes("Workflow markers:"));
  assert(!body.includes("## Workflow Markers"));
  assert(body.includes("DiscordOS Forum/Card Operations"));
});

test("forum card lifecycle dry-run routes through attached notification policy", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordForumCardLifecycle({
    workflow: "DiscordOS",
    cardId: "card-123",
    state: "opened",
    stateNote: "Initial lifecycle command",
    body: "Forum card lifecycle dry-run.",
    markers: ["DiscordOS Forum/Card Operations"],
    markerFilePath,
    env: {},
    fetchImpl: async () => {
      throw new Error("dry-run should not fetch");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.notificationRoute.routeId, "forum-card-lifecycle-info");
  assert.equal(result.notificationRoute.target, "updates");
  assert.equal(result.markerProgress.summary.markerCount, 1);
  assert(result.payloadPreview.embeds[0].description.includes("## Card Lifecycle"));
  assert(result.payloadPreview.embeds[0].description.includes("Workflow markers:"));
  assert(!result.payloadPreview.embeds[0].description.includes("## Workflow Markers"));
});

test("forum card lifecycle blocks when notification route is not admitted", async () => {
  const result = await _internals.buildDiscordForumCardLifecycle({
    workflow: "DiscordOS",
    cardId: "card-123",
    state: "opened",
    body: "Route blocked proof.",
    apply: true,
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
      throw new Error("blocked route should not fetch");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.reasonCodes, [
    "notification_route_not_admitted",
    "notification_route_not_found",
  ]);
});

test("forum card lifecycle apply blocks without updates target", async () => {
  const result = await _internals.buildDiscordForumCardLifecycle({
    workflow: "DiscordOS",
    cardId: "card-123",
    state: "blocked",
    body: "Missing target proof.",
    apply: true,
    env: {},
    fetchImpl: async () => {
      throw new Error("missing target should not fetch");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.reasonCodes, ["updates_target_missing"]);
});

test("forum card lifecycle sends bot-channel payload after shared preflight passes", async () => {
  const markerFilePath = await writeMarkerBoard();
  const requests = [];
  const result = await _internals.buildDiscordForumCardLifecycle({
    workflow: "DiscordOS",
    cardId: "card-123",
    state: "completed",
    body: "Lifecycle send proof.",
    markers: ["DiscordOS Update-Post Workflow v2"],
    markerFilePath,
    apply: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: "1504671871512346695",
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      if (url === `${updatePostInternals.DISCORD_API_BASE}/channels/1504671871512346695`) {
        return {
          ok: true,
          status: 200,
          json: async () => channelProbeBody(),
        };
      }
      if (url === `${updatePostInternals.DISCORD_API_BASE}/channels/1504671871512346695/messages?limit=${updatePostInternals.DEFAULT_PREFLIGHT_LIMIT}`) {
        return {
          ok: true,
          status: 200,
          json: async () => [message()],
        };
      }
      const payload = JSON.parse(init.body);
      assert.equal(payload.embeds[0].title, "DiscordOS Card card-123 Completed");
      assert(payload.embeds[0].description.includes("state: `completed`"));
      assert(payload.embeds[0].description.includes("DiscordOS Update-Post Workflow v2"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "1517000000000000000",
          channel_id: "1504671871512346695",
          timestamp: "2026-06-14T12:00:00.000000+00:00",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "sent");
  assert.equal(result.sendsMessages, true);
  assert.equal(result.preflight.status, "ready");
  assert.equal(result.notificationRoute.routeId, "forum-card-lifecycle-info");
  assert.equal(requests.length, 3);
});

test("forum card lifecycle renders markdown without token values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    status: "dry_run",
    workflow: "DiscordOS",
    cardId: "card-123",
    state: "opened",
    stateNote: "Dry-run ready",
    target: {
      configured: true,
      type: "discord_bot_channel",
    },
    notificationRoute: {
      routeId: "forum-card-lifecycle-info",
      target: "updates",
    },
    reasonCodes: ["apply_flag_not_set"],
    receipt: {
      requested: true,
      written: false,
      path: "docs/ops/post.md",
    },
    markerProgress: {
      markers: [
        {
          name: "DiscordOS Forum/Card Operations",
          completionPercent: 0,
          sectionLabels: ["active front-page"],
        },
      ],
      summary: {
        markerCount: 1,
      },
    },
    payloadPreview: {
      embeds: [
        {
          title: "DiscordOS Card card-123 Opened",
          description: "Preview body",
        },
      ],
    },
  });

  assert(rendered.includes("# DiscordOS Forum Card Lifecycle"));
  assert(rendered.includes("notification route: `forum-card-lifecycle-info`"));
  assert(rendered.includes("workflow marker count: `1`"));
  assert(rendered.includes("receipt written: `false`"));
  assert(!rendered.includes("bot-secret"));
});
