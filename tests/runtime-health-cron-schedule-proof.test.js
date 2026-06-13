const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-cron-schedule-proof");

test("cron schedule proof args default to local vercel config and runtime path", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    vercelConfigPath: _internals.DEFAULT_VERCEL_CONFIG_PATH,
    expectedPath: _internals.DEFAULT_EXPECTED_PATH,
    expectedSchedule: null,
  });
});

test("cron schedule proof args support explicit expected schedule", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--vercel-config",
      "custom-vercel.json",
      "--expected-path",
      "/api/custom",
      "--expected-schedule",
      "15 9 * * *",
    ]),
    {
      json: true,
      vercelConfigPath: "custom-vercel.json",
      expectedPath: "/api/custom",
      expectedSchedule: "15 9 * * *",
    }
  );
});

test("cron schedule proof builds Vercel crons args", () => {
  assert.deepEqual(_internals.buildVercelCronsArgs(), ["crons", "ls", "--format", "json"]);
});

test("cron schedule proof resolves Vercel executable for platform", () => {
  assert.equal(_internals.getVercelExecutable("win32"), "vercel.cmd");
  assert.equal(_internals.getVercelExecutable("linux"), "vercel");
});

test("cron schedule proof extracts json from mixed Vercel output", () => {
  assert.deepEqual(
    _internals.extractJsonObject('Retrieving project...\n{"crons":[],"enabled":true}\nFetching cron jobs...'),
    {
      crons: [],
      enabled: true,
    }
  );
});

test("cron schedule proof reads expected schedule from vercel config", () => {
  const fsImpl = {
    readFileSync(filePath) {
      assert.equal(filePath, "vercel.json");
      return JSON.stringify({
        crons: [
          {
            path: "/api/cron/runtime-health",
            schedule: "0 8 * * *",
          },
        ],
      });
    },
  };

  assert.equal(
    _internals.readExpectedScheduleFromConfig({
      vercelConfigPath: "vercel.json",
      expectedPath: "/api/cron/runtime-health",
      fsImpl,
    }),
    "0 8 * * *"
  );
});

test("cron schedule proof passes on exact deployed schedule", () => {
  const proof = _internals.summarizeCronScheduleProof({
    expectedPath: "/api/cron/runtime-health",
    expectedSchedule: "0 8 * * *",
    registry: {
      crons: [
        {
          path: "/api/cron/runtime-health",
          schedule: "0 8 * * *",
          host: "fawxzzy-discordos.vercel.app",
        },
      ],
      undeployed: [],
      modified: [],
      enabled: true,
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.destructive, false);
  assert.equal(proof.sendsMessages, false);
  assert.equal(proof.writesArtifacts, false);
  assert.equal(proof.matchingCronCount, 1);
  assert.equal(proof.exactMatchingCronCount, 1);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_schedule_proof_pass");
});

test("cron schedule proof fails on schedule drift", () => {
  const proof = _internals.summarizeCronScheduleProof({
    expectedPath: "/api/cron/runtime-health",
    expectedSchedule: "0 8 * * *",
    registry: {
      crons: [
        {
          path: "/api/cron/runtime-health",
          schedule: "30 6 * * *",
          host: "fawxzzy-discordos.vercel.app",
        },
      ],
      undeployed: [],
      modified: [],
      enabled: true,
    },
  });

  assert.equal(proof.ok, false);
  assert.deepEqual(proof.reasonCodes, ["expected_cron_schedule_mismatch"]);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_schedule_proof_fail");
});

test("cron schedule proof fails on disabled or modified registry", () => {
  const proof = _internals.summarizeCronScheduleProof({
    expectedPath: "/api/cron/runtime-health",
    expectedSchedule: "0 8 * * *",
    registry: {
      crons: [],
      undeployed: [{ path: "/api/cron/runtime-health" }],
      modified: [{ path: "/api/cron/runtime-health" }],
      enabled: false,
    },
  });

  assert.equal(proof.ok, false);
  assert.deepEqual(proof.reasonCodes, [
    "vercel_crons_disabled",
    "expected_cron_not_deployed",
    "undeployed_crons_present",
    "modified_crons_present",
  ]);
});

test("cron schedule proof invokes Vercel and summarizes output", async () => {
  const proof = await _internals.buildRuntimeHealthCronScheduleProof({
    vercelConfigPath: "vercel.json",
    expectedPath: "/api/cron/runtime-health",
    expectedSchedule: "0 8 * * *",
    execFileImpl: async (executable, args) => {
      assert.equal(executable, _internals.getVercelExecutable());
      assert.deepEqual(args, ["crons", "ls", "--format", "json"]);
      return {
        stdout: JSON.stringify({
          crons: [
            {
              path: "/api/cron/runtime-health",
              schedule: "0 8 * * *",
              host: "fawxzzy-discordos.vercel.app",
            },
          ],
          undeployed: [],
          modified: [],
          enabled: true,
        }),
        stderr: "Fetching cron jobs...\n",
      };
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.command.executable, _internals.getVercelExecutable());
});

test("cron schedule proof renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    event: {
      type: "discordos.runtime_health.cron_schedule_proof_pass",
      severity: "info",
    },
    expectedPath: "/api/cron/runtime-health",
    expectedSchedule: "0 8 * * *",
    enabled: true,
    deployedCronCount: 1,
    matchingCronCount: 1,
    exactMatchingCronCount: 1,
    deployed: {
      host: "fawxzzy-discordos.vercel.app",
    },
    undeployedCount: 0,
    modifiedCount: 0,
    reasonCodes: [],
  });

  assert(rendered.includes("# DiscordOS Runtime Health Cron Schedule Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("expected schedule: `0 8 * * *`"));
});
