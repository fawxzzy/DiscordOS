const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-forum-card-release-check");
const {
  _internals: updatePostInternals,
} = require("../scripts/discord-update-post");

const UPDATES_CHANNEL_ID = "1504671871512346695";

function message({
  id = "1516000000000000000",
  title = "Older Card Update",
} = {}) {
  return {
    id,
    channel_id: UPDATES_CHANNEL_ID,
    timestamp: "2026-06-14T20:00:00.000000+00:00",
    embeds: [
      {
        title,
      },
    ],
  };
}

async function writeMarkerBoard(markdown = [
  "# Lanes And Markers",
  "",
  "## Active Front-Page Marker Table",
  "",
  "- DiscordOS Forum/Card Operations: `25%`",
].join("\n")) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-forum-card-release-markers-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

function liveFetch({ duplicate = false } = {}) {
  return async (url, init) => {
    assert.equal(init.method, "GET");
    assert.equal(init.headers.Authorization, "Bot bot-secret");
    if (url === `${updatePostInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
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
      `${updatePostInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}/messages?limit=${_internals.DEFAULT_LIMIT}`
    );
    return {
      ok: true,
      status: 200,
      json: async () => duplicate ? [message({ title: "Feedback Ops Card card-123 Completed" })] : [message()],
    };
  };
}

test("discord forum card release check args default to no-send readiness check", () => {
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
    limit: _internals.DEFAULT_LIMIT,
  });
});

test("discord forum card release check parses full card metadata", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--workflow",
      "Feedback Ops",
      "--card-id",
      "card-123",
      "--state",
      "in-progress",
      "--state-note",
      "Release-check proof",
      "--title",
      "Custom lifecycle title",
      "--body-file",
      "docs/ops/post.md",
      "--body-section",
      "Card Update",
      "--receipt-file",
      "docs/ops/post.md",
      "--marker",
      "DiscordOS Forum/Card Operations",
      "--limit",
      "10",
    ]),
    {
      json: true,
      workflow: "Feedback Ops",
      cardId: "card-123",
      state: "in-progress",
      stateNote: "Release-check proof",
      title: "Custom lifecycle title",
      body: null,
      bodyFile: "docs/ops/post.md",
      bodySection: "Card Update",
      receiptFile: "docs/ops/post.md",
      markers: ["DiscordOS Forum/Card Operations"],
      limit: 10,
    }
  );
});

test("discord forum card release check passes when lifecycle preview and live preflight pass", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordForumCardReleaseCheck({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "completed",
    body: "Forum card ready for publication.",
    markers: ["DiscordOS Forum/Card Operations"],
    markerFilePath,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: liveFetch(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.readyForApply, true);
  assert.equal(result.status, "ready_for_apply");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.lifecycle.status, "dry_run");
  assert.equal(result.preflight.status, "ready");
  assert.equal(result.preflight.duplicateCheck.status, "not_found");
  assert.equal(result.event.type, "discordos.forum_card.release_check_ready");
  assert(result.nextCommand.includes("npm run ops:discord:forum-card-lifecycle"));
  assert(result.nextCommand.includes('--marker "DiscordOS Forum/Card Operations"'));
});

test("discord forum card release check blocks duplicate live title without sending", async () => {
  const result = await _internals.buildDiscordForumCardReleaseCheck({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "completed",
    body: "Duplicate lifecycle proof.",
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: liveFetch({ duplicate: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.readyForApply, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.preflight.duplicateCheck.status, "duplicate_found");
  assert(result.reasonCodes.includes("updates_duplicate_title_found"));
  assert.equal(result.nextCommand, null);
});

test("discord forum card release check skips live preflight when notification route is blocked", async () => {
  const result = await _internals.buildDiscordForumCardReleaseCheck({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "opened",
    body: "Blocked route proof.",
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
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
  assert.equal(result.lifecycle.status, "dry_run");
  assert.equal(result.lifecycle.notificationRoute.ok, false);
  assert.equal(result.preflight.status, "skipped");
  assert.deepEqual(result.preflight.reasonCodes, [
    "notification_route_not_admitted",
    "notification_route_not_found",
  ]);
  assert(result.reasonCodes.includes("notification_route_not_admitted"));
});

test("discord forum card release check renders markdown without token values or full body", async () => {
  const result = await _internals.buildDiscordForumCardReleaseCheck({
    workflow: "Feedback Ops",
    cardId: "card-123",
    state: "completed",
    body: "Forum card ready for publication.",
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: liveFetch(),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Forum Card Release Check"));
  assert(rendered.includes("ready for apply: `true`"));
  assert(rendered.includes("duplicate check status: `not_found`"));
  assert(rendered.includes('--body "<redacted>"'));
  assert(!rendered.includes("Forum card ready for publication."));
  assert(!rendered.includes("bot-secret"));
});
