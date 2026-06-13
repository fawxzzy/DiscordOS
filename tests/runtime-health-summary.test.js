const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-summary");
const { _internals: proofInternals } = require("../scripts/runtime-health-proof");

function snapshot({ ok = true, generatedAt, posture = "operational", readinessPercent = 100, eventType }) {
  return {
    ok,
    summary: {
      posture,
      readinessPercent,
      blockedReasons: ok ? [] : ["discord_bot_not_verified"],
      generatedAt,
    },
    event: {
      type: eventType || (ok ? "discordos.runtime_health.operational" : "discordos.runtime_health.action_required"),
      severity: ok ? "info" : "warning",
    },
  };
}

async function writeSnapshot(dir, fileName, payload) {
  await fs.writeFile(path.join(dir, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("runtime health summary args default to runtime snapshot directory", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    limit: 10,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    requireLatestPass: true,
    requireFreshSnapshot: true,
    maxSnapshotAgeHours: 24,
  });
});

test("runtime health summary args support json limit and custom snapshot dir", () => {
  assert.deepEqual(_internals.parseArgs([
    "--json",
    "--limit",
    "2",
    "--snapshot-dir",
    "tmp/snapshots",
    "--max-age-hours",
    "6",
    "--allow-stale",
  ]), {
    json: true,
    limit: 2,
    snapshotDir: path.resolve("tmp/snapshots"),
    requireLatestPass: true,
    requireFreshSnapshot: false,
    maxSnapshotAgeHours: 6,
  });
});

test("runtime health summary loads newest snapshots first", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-summary-"));
  await writeSnapshot(dir, "older.json", snapshot({ generatedAt: "2026-06-13T01:00:00.000Z" }));
  await writeSnapshot(dir, "newer.json", snapshot({ generatedAt: "2026-06-13T02:00:00.000Z" }));

  const records = await _internals.loadRuntimeHealthSnapshots({ snapshotDir: dir, limit: 1 });

  assert.equal(records.length, 1);
  assert.equal(records[0].fileName, "newer.json");
});

test("runtime health summary reports passing latest health history", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-summary-"));
  await writeSnapshot(dir, "older-fail.json", snapshot({
    ok: false,
    posture: "action_required",
    readinessPercent: 83,
    generatedAt: "2026-06-13T01:00:00.000Z",
  }));
  await writeSnapshot(dir, "newer-pass.json", snapshot({ generatedAt: "2026-06-13T02:00:00.000Z" }));

  const records = await _internals.loadRuntimeHealthSnapshots({ snapshotDir: dir, limit: 10 });
  const summary = _internals.summarizeRuntimeHealthSnapshots(records, {
    snapshotDir: dir,
    now: new Date("2026-06-13T02:30:00.000Z"),
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.maxSnapshotAgeHours, 24);
  assert.equal(summary.totalSnapshots, 2);
  assert.equal(summary.passCount, 1);
  assert.equal(summary.failCount, 1);
  assert.equal(summary.latest.fileName, "newer-pass.json");
  assert.equal(summary.latest.fresh, true);
  assert.equal(summary.latest.staleReason, null);
  assert.equal(summary.latest.eventType, "discordos.runtime_health.operational");
  assert.deepEqual(summary.blockedReasons, ["discord_bot_not_verified"]);
});

test("runtime health summary fails closed when latest snapshot is failing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-summary-"));
  await writeSnapshot(dir, "older-pass.json", snapshot({ generatedAt: "2026-06-13T01:00:00.000Z" }));
  await writeSnapshot(dir, "newer-fail.json", snapshot({
    ok: false,
    posture: "action_required",
    readinessPercent: 83,
    generatedAt: "2026-06-13T02:00:00.000Z",
  }));

  const records = await _internals.loadRuntimeHealthSnapshots({ snapshotDir: dir, limit: 10 });
  const summary = _internals.summarizeRuntimeHealthSnapshots(records, {
    snapshotDir: dir,
    now: new Date("2026-06-13T02:30:00.000Z"),
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.latest.fileName, "newer-fail.json");
  assert.equal(summary.latest.posture, "action_required");
});

test("runtime health summary fails closed when latest snapshot is stale", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-summary-"));
  await writeSnapshot(dir, "older-pass.json", snapshot({ generatedAt: "2026-06-13T01:00:00.000Z" }));

  const records = await _internals.loadRuntimeHealthSnapshots({ snapshotDir: dir, limit: 10 });
  const summary = _internals.summarizeRuntimeHealthSnapshots(records, {
    snapshotDir: dir,
    maxSnapshotAgeHours: 1,
    now: new Date("2026-06-13T03:00:01.000Z"),
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.latest.fileName, "older-pass.json");
  assert.equal(summary.latest.fresh, false);
  assert.equal(summary.latest.staleReason, "latest_snapshot_stale");
});

test("runtime health summary can allow stale snapshots for history audits", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-runtime-health-summary-"));
  await writeSnapshot(dir, "older-pass.json", snapshot({ generatedAt: "2026-06-13T01:00:00.000Z" }));

  const records = await _internals.loadRuntimeHealthSnapshots({ snapshotDir: dir, limit: 10 });
  const summary = _internals.summarizeRuntimeHealthSnapshots(records, {
    snapshotDir: dir,
    requireFreshSnapshot: false,
    maxSnapshotAgeHours: 1,
    now: new Date("2026-06-13T03:00:01.000Z"),
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.latest.fresh, false);
  assert.equal(summary.latest.staleReason, "latest_snapshot_stale");
});

test("runtime health summary renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    snapshotDir: "runtime/discordos/runtime-health",
    maxSnapshotAgeHours: 24,
    totalSnapshots: 1,
    passCount: 1,
    failCount: 0,
    latest: {
      fileName: "snapshot-pass.json",
      posture: "operational",
      readinessPercent: 100,
      eventType: "discordos.runtime_health.operational",
      generatedAt: "2026-06-13T02:00:00.000Z",
      ageHours: 0.5,
      fresh: true,
      staleReason: null,
      blockedReasons: [],
    },
    statuses: [
      {
        fileName: "snapshot-pass.json",
        ok: true,
        posture: "operational",
        readinessPercent: 100,
      },
    ],
  });

  assert(rendered.includes("# DiscordOS Runtime Health Snapshot Summary"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("latest fresh: `true`"));
  assert(rendered.includes("latest event type: `discordos.runtime_health.operational`"));
});
