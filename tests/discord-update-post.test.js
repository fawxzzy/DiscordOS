const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-post");
const { _internals: markerInternals } = require("../scripts/discordos-workflow-marker-progress");

const UPDATES_CHANNEL_ID = "1504671871512346695";

function channelProbeBody(name = "updates") {
  return {
    name,
    type: 5,
  };
}

function message({
  id = "1516000000000000000",
  channelId = UPDATES_CHANNEL_ID,
  timestamp = "2026-06-13T20:00:00.000000+00:00",
  title = "Runtime hardening closed",
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
    "",
    "## Supporting Open Markers",
    "",
    "- Manual Deploy Exception Burn-Down: `84%`",
    "",
    "## Closed / Locked Ratchets",
    "",
    "- Duplicate Surface Decommission: `100%`",
  ].join("\n");
}

async function writeMarkerBoard(markdown = markerBoardMarkdown()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-marker-board-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

test("discord update post args default to dry-run publication", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
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

test("discord update post args parse title body file section receipt and apply", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--title",
      "Runtime hardening closed",
      "--body-file",
      "docs/ops/post.md",
      "--body-section",
      "Update Post",
      "--receipt-file",
      "docs/ops/receipt.md",
      "--marker",
      "AI Long-Run Batch Orchestration",
      "--marker",
      "Manual Deploy Exception Burn-Down",
      "--marker-file",
      "docs/ops/markers.md",
      "--apply",
    ]),
    {
      json: true,
      title: "Runtime hardening closed",
      body: null,
      bodyFile: "docs/ops/post.md",
      bodySection: "Update Post",
      receiptFile: "docs/ops/receipt.md",
      markers: [
        "AI Long-Run Batch Orchestration",
        "Manual Deploy Exception Burn-Down",
      ],
      markerFilePath: "docs/ops/markers.md",
      apply: true,
    }
  );
});

test("workflow marker progress resolves open and closed marker snapshots", async () => {
  const progress = await markerInternals.resolveWorkflowMarkerProgress({
    markers: [
      "AI Long-Run Batch Orchestration",
      "Duplicate Surface Decommission",
    ],
    markerFilePath: await writeMarkerBoard(),
  });

  assert(progress.sourceRef.endsWith("02-lanes-and-markers.md"));
  assert.equal(progress.summary.markerCount, 2);
  assert.equal(progress.summary.openMarkerCount, 1);
  assert.equal(progress.summary.closedMarkerCount, 1);
  assert.equal(progress.summary.lowestCompletionPercent, 49);
  assert.equal(progress.summary.highestCompletionPercent, 100);
  assert.deepEqual(progress.markers[0].sectionLabels, ["active front-page"]);
  assert.deepEqual(progress.markers[1].sectionLabels, ["closed / locked"]);
});

test("discord update post extracts a named markdown section", () => {
  const markdown = [
    "# Receipt",
    "",
    "intro",
    "",
    "## Update Post",
    "",
    "Published body.",
    "",
    "### Detail",
    "",
    "- proof",
    "",
    "## Durable Receipts",
    "",
    "- internal",
  ].join("\n");

  assert.equal(
    _internals.extractMarkdownSection(markdown, "Update Post"),
    ["Published body.", "", "### Detail", "", "- proof"].join("\n")
  );
});

test("discord update post payload is green embed with mentions disabled", () => {
  const payload = _internals.buildDiscordUpdatePayload({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
  });

  assert.equal(payload.content, "");
  assert.equal(payload.embeds[0].title, "Runtime hardening closed");
  assert.equal(payload.embeds[0].description, "DiscordOS runtime hardening is closed.");
  assert.equal(payload.embeds[0].color, _internals.UPDATE_EMBED_COLOR);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
});

test("discord update post payload appends workflow marker progress", () => {
  const payload = _internals.buildDiscordUpdatePayload({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    markerProgress: {
      sourceRef: "docs/atlas-book/02-lanes-and-markers.md",
      markers: [
        {
          name: "AI Long-Run Batch Orchestration",
          completionPercent: 49,
          sectionLabels: ["active front-page"],
        },
      ],
      summary: {
        markerCount: 1,
        openMarkerCount: 1,
        closedMarkerCount: 0,
        lowestCompletionPercent: 49,
        highestCompletionPercent: 49,
      },
    },
  });

  assert(payload.embeds[0].description.includes("Workflow markers:"));
  assert(!payload.embeds[0].description.includes("## Workflow Markers"));
  assert(payload.embeds[0].description.includes("AI Long-Run Batch Orchestration"));
  assert(payload.embeds[0].description.includes("49%"));
});

test("discord update post dry-run does not require target env and previews payload", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    markers: ["AI Long-Run Batch Orchestration"],
    env: {},
    receiptFile: "docs/ops/receipt.md",
    markerFilePath,
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.target.type, "none");
  assert.equal(result.notificationRoute.routeId, "updates-publication-info");
  assert.equal(result.notificationRoute.target, "updates");
  assert.equal(result.markerProgress.summary.markerCount, 1);
  assert(result.payloadPreview.embeds[0].description.includes("Workflow markers:"));
  assert(!result.payloadPreview.embeds[0].description.includes("## Workflow Markers"));
  assert.deepEqual(result.receipt, {
    requested: true,
    written: false,
    path: "docs/ops/receipt.md",
  });
  assert.equal(result.payloadPreview.embeds[0].title, "Runtime hardening closed");
});

test("discord update post apply blocks without DiscordOS target env", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
    env: {},
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.notificationRoute.routeId, "updates-publication-info");
  assert.deepEqual(result.reasonCodes, ["updates_target_missing"]);
});

test("discord update post apply blocks when notification route is not admitted", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
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
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.reasonCodes, [
    "notification_route_not_admitted",
    "notification_route_not_found",
  ]);
  assert.equal(result.notificationRoute.ok, false);
});

test("discord update post sends bot-channel payload with DiscordOS env only", async () => {
  const requests = [];
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: ` ${UPDATES_CHANNEL_ID}\n`,
      DISCORDOS_BOT_TOKEN: " bot-secret\n",
      DISCORD_UPDATES_CHANNEL_ID: "fitness-channel",
      DISCORD_BOT_TOKEN: "fitness-token",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.headers.Authorization, "Bot bot-secret");
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
        assert.equal(init.method, "GET");
        assert.equal(init.body, undefined);
        return {
          ok: true,
          status: 200,
          json: async () => channelProbeBody(),
        };
      }
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}/messages?limit=${_internals.DEFAULT_PREFLIGHT_LIMIT}`) {
        assert.equal(init.method, "GET");
        assert.equal(init.body, undefined);
        return {
          ok: true,
          status: 200,
          json: async () => [
            message({
              title: "Older Update",
            }),
          ],
        };
      }
      assert.equal(url, `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}/messages`);
      assert.equal(init.method, "POST");
      const parsed = JSON.parse(init.body);
      assert.equal(parsed.content, "");
      assert.equal(parsed.embeds[0].title, "Runtime hardening closed");
      assert.deepEqual(parsed.allowed_mentions, { parse: [] });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "1516000000000000000",
          channel_id: UPDATES_CHANNEL_ID,
          timestamp: "2026-06-13T20:00:00.000000+00:00",
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "sent");
  assert.equal(result.sendsMessages, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(result.messageId, "1516000000000000000");
  assert.equal(result.channelId, UPDATES_CHANNEL_ID);
  assert.equal(result.timestamp, "2026-06-13T20:00:00.000000+00:00");
  assert.equal(result.notificationRoute.routeId, "updates-publication-info");
  assert.equal(result.notificationRoute.targetEnv, "DISCORDOS_UPDATES_CHANNEL_ID");
  assert.equal(result.preflight.status, "ready");
  assert.equal(result.preflight.duplicateCheck.status, "not_found");
  assert.equal(requests.length, 3);
  assert.deepEqual(result.receipt, {
    requested: false,
    written: false,
    path: null,
  });
});

test("discord update post apply blocks duplicate titles before sending", async () => {
  const requests = [];
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.equal(init.method, "GET");
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
        return {
          ok: true,
          status: 200,
          json: async () => channelProbeBody(),
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
  assert.equal(result.status, "preflight_blocked");
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.reasonCodes, ["updates_duplicate_title_found"]);
  assert.equal(result.preflight.duplicateCheck.status, "duplicate_found");
  assert.equal(result.preflight.duplicateCheck.duplicate.messageId, "1516000000000000000");
  assert.equal(requests.length, 2);
});

test("discord update post apply blocks target drift before sending", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    apply: true,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url, init) => {
      assert.equal(url, `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`);
      assert.equal(init.method, "GET");
      return {
        ok: true,
        status: 200,
        json: async () => channelProbeBody("alerts"),
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "preflight_blocked");
  assert.equal(result.sendsMessages, false);
  assert.deepEqual(result.reasonCodes, ["updates_channel_points_to_alerts"]);
  assert.equal(result.preflight.status, "target_blocked");
  assert.equal(result.preflight.duplicateCheck.status, "skipped");
});

test("discord update post send tolerates missing response json while preserving status", async () => {
  const result = await _internals.sendDiscordBotChannel({
    channelId: "123",
    token: "bot-secret",
    payload: _internals.buildDiscordUpdatePayload({
      title: "Runtime hardening closed",
      body: "DiscordOS runtime hardening is closed.",
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.messageId, null);
  assert.equal(result.channelId, "123");
  assert.equal(result.timestamp, null);
});

test("discord update post builds bounded receipt block from sent result", () => {
  const block = _internals.buildDiscordPublicationReceiptBlock({
    status: "sent",
    sendsMessages: true,
    httpStatus: 200,
    channelId: "123",
    messageId: "1516000000000000000",
    timestamp: "2026-06-13T20:00:00.000000+00:00",
    markerProgress: {
      markers: [
        {
          name: "AI Long-Run Batch Orchestration",
          completionPercent: 49,
          sectionLabels: ["active front-page"],
        },
      ],
      summary: {
        markerCount: 1,
      },
    },
  });

  assert(block.includes(_internals.RECEIPT_BLOCK_START));
  assert(block.includes("## Discord Publication"));
  assert(block.includes("message id: `1516000000000000000`"));
  assert(block.includes("mentions disabled: `true`"));
  assert(block.includes("workflow marker: `AI Long-Run Batch Orchestration` `49%` `active front-page`"));
  assert(block.includes(_internals.RECEIPT_BLOCK_END));
});

test("discord update post upserts publication receipt block idempotently", () => {
  const initial = ["# Receipt", "", "Body."].join("\n");
  const firstBlock = _internals.buildDiscordPublicationReceiptBlock({
    status: "sent",
    sendsMessages: true,
    httpStatus: 200,
    channelId: "123",
    messageId: "1516000000000000000",
    timestamp: "2026-06-13T20:00:00.000000+00:00",
  });
  const secondBlock = _internals.buildDiscordPublicationReceiptBlock({
    status: "sent",
    sendsMessages: true,
    httpStatus: 200,
    channelId: "123",
    messageId: "1516000000000000001",
    timestamp: "2026-06-13T20:01:00.000000+00:00",
  });

  const withFirstBlock = _internals.upsertDiscordPublicationReceiptBlock(initial, firstBlock);
  const withSecondBlock = _internals.upsertDiscordPublicationReceiptBlock(withFirstBlock, secondBlock);

  assert(withSecondBlock.includes("message id: `1516000000000000001`"));
  assert(!withSecondBlock.includes("message id: `1516000000000000000`"));
  assert.equal(withSecondBlock.match(/discordos-update-post-receipt:start/g).length, 1);
});

test("discord update post writes receipt file only after successful send", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-receipt-"));
  await fs.mkdir(path.join(dir, "docs", "ops"), { recursive: true });
  const receiptPath = path.join(dir, "docs", "ops", "receipt.md");
  await fs.writeFile(receiptPath, "# Receipt\n\nExisting proof.\n", "utf8");

  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    receiptFile: "docs/ops/receipt.md",
    apply: true,
    cwd: dir,
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url) => {
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
        return {
          ok: true,
          status: 200,
          json: async () => channelProbeBody(),
        };
      }
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}/messages?limit=${_internals.DEFAULT_PREFLIGHT_LIMIT}`) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "1516000000000000000",
          channel_id: UPDATES_CHANNEL_ID,
          timestamp: "2026-06-13T20:00:00.000000+00:00",
        }),
      };
    },
  });
  const updatedReceipt = await fs.readFile(receiptPath, "utf8");

  assert.equal(result.ok, true);
  assert.equal(result.status, "sent");
  assert.deepEqual(result.receipt, {
    requested: true,
    written: true,
    path: "docs/ops/receipt.md",
  });
  assert(updatedReceipt.includes("## Discord Publication"));
  assert(updatedReceipt.includes("message id: `1516000000000000000`"));
});

test("discord update post reports sent receipt write failures without hiding send", async () => {
  const result = await _internals.buildDiscordUpdatePost({
    title: "Runtime hardening closed",
    body: "DiscordOS runtime hardening is closed.",
    receiptFile: "docs/ops/missing.md",
    apply: true,
    cwd: await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-receipt-missing-")),
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async (url) => {
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
        return {
          ok: true,
          status: 200,
          json: async () => channelProbeBody(),
        };
      }
      if (url === `${_internals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}/messages?limit=${_internals.DEFAULT_PREFLIGHT_LIMIT}`) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "1516000000000000000",
          channel_id: UPDATES_CHANNEL_ID,
          timestamp: "2026-06-13T20:00:00.000000+00:00",
        }),
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.sendsMessages, true);
  assert.equal(result.status, "sent_receipt_write_failed");
  assert.deepEqual(result.reasonCodes, ["receipt_write_failed"]);
});

test("discord update post resolves body-file sections from repo-relative paths", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-post-"));
  await fs.mkdir(path.join(dir, "docs", "ops"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "docs", "ops", "post.md"),
    ["# Receipt", "", "## Update Post", "", "Public update.", "", "## Internal", "", "Receipt."].join("\n"),
    "utf8"
  );

  const body = await _internals.resolveBody({
    bodyFile: "docs/ops/post.md",
    bodySection: "Update Post",
    cwd: dir,
  });

  assert.equal(body, "Public update.");
});

test("discord update post renders markdown without target values", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    status: "dry_run",
    target: {
      configured: true,
      type: "discord_bot_channel",
    },
    reasonCodes: ["apply_flag_not_set"],
    messageId: "1516000000000000000",
    channelId: "123",
    timestamp: "2026-06-13T20:00:00.000000+00:00",
    receipt: {
      requested: true,
      written: true,
      path: "docs/ops/receipt.md",
    },
    markerProgress: {
      markers: [
        {
          name: "AI Long-Run Batch Orchestration",
          completionPercent: 49,
          sectionLabels: ["active front-page"],
        },
      ],
      summary: {
        markerCount: 1,
        lowestCompletionPercent: 49,
        highestCompletionPercent: 49,
      },
    },
    payloadPreview: {
      embeds: [
        {
          title: "Runtime hardening closed",
          description: "Public update.",
        },
      ],
    },
  });

  assert(rendered.includes("# DiscordOS Update Post"));
  assert(rendered.includes("status: `dry_run`"));
  assert(rendered.includes("message id: `1516000000000000000`"));
  assert(rendered.includes("timestamp: `2026-06-13T20:00:00.000000+00:00`"));
  assert(rendered.includes("receipt file: `docs/ops/receipt.md`"));
  assert(rendered.includes("receipt written: `true`"));
  assert(rendered.includes("workflow marker count: `1`"));
  assert(!rendered.includes("bot-secret"));
});
