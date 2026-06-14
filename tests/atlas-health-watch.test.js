const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/atlas-health-watch");

function configEnv(targets, schedule = null) {
  return {
    DISCORDOS_ATLAS_HEALTH_TARGETS_JSON: JSON.stringify({
      version: 1,
      ...(schedule ? { schedule } : {}),
      targets,
    }),
  };
}

test("atlas health watch args default to dry run config", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    configPath: _internals.DEFAULT_CONFIG_PATH,
    send: false,
    timeoutMs: _internals.DEFAULT_TIMEOUT_MS,
    cooldownHours: 24,
    suppressRepeats: true,
  });
});

test("atlas health target validation rejects unsupported kinds", () => {
  assert.throws(
    () => _internals.normalizeTarget({
      id: "bad",
      label: "Bad",
      owner: "ATLAS",
      url: "https://example.test",
      kind: "sql",
    }),
    /unsupported_atlas_health_target_kind/
  );
});

test("atlas health watch passes when all targets are healthy", async () => {
  const result = await _internals.buildAtlasHealthWatch({
    env: configEnv([
      {
        id: "runtime",
        label: "Runtime",
        owner: "DiscordOS",
        url: "https://example.test/api/runtime-health",
        kind: "json-ok",
      },
      {
        id: "web",
        label: "Web",
        owner: "Foundation",
        url: "https://example.test",
        kind: "http-ok",
      },
    ]),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/api/runtime-health")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("<html></html>", { status: 200 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.targetCount, 2);
  assert.equal(result.passCount, 2);
  assert.equal(result.alertDelivery.status, "skipped_clear");
  assert.equal(result.usageEstimate.targetChecksPerMonth, 60);
});

test("atlas health watch estimates monthly checks from configured schedule", () => {
  assert.equal(_internals.estimateRunsPerMonthFromCron("0 16 * * *"), 30);
  assert.equal(_internals.estimateRunsPerMonthFromCron("0 4,16 * * *"), 60);
  assert.equal(_internals.estimateRunsPerMonthFromCron("0 16 * * 1-5"), 21);
  assert.equal(_internals.estimateRunsPerMonthFromCron("0 4,16 * * 1-5"), 43);
  assert.deepEqual(_internals.runDaysFromCron("0 16 * * 1-5"), [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ]);
});

test("atlas health watch skips target checks when configured schedule is not due", async () => {
  const result = await _internals.buildAtlasHealthWatch({
    env: configEnv([
      {
        id: "runtime",
        label: "Runtime",
        owner: "DiscordOS",
        url: "https://example.test/api/runtime-health",
        kind: "json-ok",
      },
    ], {
      cron: "0 16 * * 1-5",
      timezone: "UTC",
    }),
    fetchImpl: async () => {
      throw new Error("target fetch should be skipped outside configured run days");
    },
    now: new Date("2026-06-13T16:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, "atlas_health_schedule_not_due");
  assert.equal(result.targetCount, 1);
  assert.equal(result.checks.length, 0);
  assert.equal(result.alertDelivery.status, "skipped_schedule");
  assert.deepEqual(result.alertDelivery.reasonCodes, ["atlas_health_schedule_not_due"]);
  assert.equal(result.usageEstimate.runsPerMonth, 21);
  assert.equal(result.usageEstimate.targetChecksPerMonth, 21);
});

test("atlas health watch marks json ok false as critical without sending in dry run", async () => {
  const result = await _internals.buildAtlasHealthWatch({
    env: configEnv([
      {
        id: "runtime",
        label: "Runtime",
        owner: "DiscordOS",
        url: "https://example.test/api/runtime-health",
        kind: "json-ok",
      },
    ]),
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 200 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.criticalCount, 1);
  assert.deepEqual(result.criticalTargets[0].reasonCodes, ["json_ok_not_true"]);
  assert.equal(result.alertDelivery.status, "dry_run");
  assert.equal(result.alertDelivery.sent, false);
  assert.equal(result.alertDelivery.payloadPreview.embeds[0].title, "ATLAS Critical Health Alert");
});

test("atlas health watch sends critical alert to bot channel when requested", async () => {
  const requests = [];
  const result = await _internals.buildAtlasHealthWatch({
    env: {
      ...configEnv([
        {
          id: "web",
          label: "Web",
          owner: "Trove",
          url: "https://example.test",
          kind: "http-ok",
        },
      ]),
      DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
      DISCORDOS_BOT_TOKEN: "bot-token",
    },
    send: true,
    suppressRepeats: false,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).includes("/channels/123/messages")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("server error", { status: 500 });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.alertDelivery.status, "sent");
  assert.equal(result.alertDelivery.sent, true);
  const discordRequest = requests.find((request) => request.url.includes("/channels/123/messages"));
  assert.ok(discordRequest);
  assert.equal(JSON.parse(discordRequest.options.body).allowed_mentions.parse.length, 0);
});

test("atlas health watch suppresses repeated critical fingerprint", async () => {
  const suppressionDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-health-watch-test-"));
  const env = {
    ...configEnv([
      {
        id: "web",
        label: "Web",
        owner: "Trove",
        url: "https://example.test",
        kind: "http-ok",
      },
    ]),
    DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID: "123",
    DISCORDOS_BOT_TOKEN: "bot-token",
  };
  const fetchImpl = async (url) => {
    if (String(url).includes("/channels/123/messages")) {
      return new Response("{}", { status: 200 });
    }
    return new Response("server error", { status: 500 });
  };

  const first = await _internals.buildAtlasHealthWatch({
    env,
    send: true,
    suppressionDir,
    fetchImpl,
    now: new Date("2026-06-13T04:00:00.000Z"),
  });
  const second = await _internals.buildAtlasHealthWatch({
    env,
    send: true,
    suppressionDir,
    fetchImpl,
    now: new Date("2026-06-13T05:00:00.000Z"),
  });

  assert.equal(first.alertDelivery.status, "sent");
  assert.equal(second.alertDelivery.status, "suppressed_repeat");
  assert.equal(second.alertDelivery.sent, false);
  assert.deepEqual(second.alertDelivery.reasonCodes, ["atlas_health_repeat_suppressed"]);
});

test("atlas health watch renders markdown without full target URLs", () => {
  const rendered = _internals.renderMarkdown({
    ok: false,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    event: {
      type: "atlas.health_watch.critical",
      severity: "error",
    },
    targetCount: 1,
    passCount: 0,
    failCount: 1,
    criticalCount: 1,
    criticalTargets: [
      {
        id: "web",
        reasonCodes: ["request_failed"],
      },
    ],
    alertDelivery: {
      status: "dry_run",
      targetType: "none",
      reasonCodes: ["send_flag_not_set"],
    },
  });

  assert(rendered.includes("# ATLAS Health Watch"));
  assert(rendered.includes("critical target: `web`"));
  assert(!rendered.includes("https://"));
});
