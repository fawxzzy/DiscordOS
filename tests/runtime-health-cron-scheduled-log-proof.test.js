const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/runtime-health-cron-scheduled-log-proof");

test("scheduled cron log proof args default to production log search", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    project: _internals.DEFAULT_PROJECT,
    since: _internals.DEFAULT_SINCE,
    until: null,
    limit: _internals.DEFAULT_LIMIT,
    expectedPath: _internals.CRON_PATH,
  });
});

test("scheduled cron log proof args support json project range and limit", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--project",
      "custom-project",
      "--since",
      "2026-06-13T07:55:00Z",
      "--until",
      "2026-06-13T08:10:00Z",
      "--limit",
      "25",
    ]),
    {
      json: true,
      project: "custom-project",
      since: "2026-06-13T07:55:00Z",
      until: "2026-06-13T08:10:00Z",
      limit: 25,
      expectedPath: _internals.CRON_PATH,
    }
  );
});

test("scheduled cron log proof builds Vercel log args", () => {
  assert.deepEqual(
    _internals.buildVercelLogArgs({
      project: "fawxzzy-discordos",
      since: "1h",
      until: "now",
      limit: 10,
      expectedPath: "/api/cron/runtime-health",
    }),
    [
      "logs",
      "--environment",
      "production",
      "--no-branch",
      "--project",
      "fawxzzy-discordos",
      "--since",
      "1h",
      "--limit",
      "10",
      "--query",
      "/api/cron/runtime-health",
      "--json",
      "--until",
      "now",
    ]
  );
});

test("scheduled cron log proof resolves Vercel executable for platform", () => {
  assert.equal(_internals.getVercelExecutable("win32"), "vercel.cmd");
  assert.equal(_internals.getVercelExecutable("linux"), "vercel");
});

test("scheduled cron log proof parses JSON lines", () => {
  assert.deepEqual(
    _internals.parseJsonLines('{"statusCode":200}\n{"status":401}\n'),
    [{ statusCode: 200 }, { status: 401 }]
  );
});

test("scheduled cron log proof normalizes flexible Vercel log records", () => {
  assert.deepEqual(
    _internals.normalizeLogRecord(
      {
        timestamp: "2026-06-13T08:00:01.000Z",
        requestId: "req_123",
        method: "GET",
        path: "/api/cron/runtime-health",
        statusCode: 200,
      },
      "/api/cron/runtime-health"
    ),
    {
      timestamp: "2026-06-13T08:00:01.000Z",
      requestId: "req_123",
      method: "GET",
      path: "/api/cron/runtime-health",
      statusCode: 200,
      containsExpectedPath: true,
    }
  );
});

test("scheduled cron log proof normalizes current Vercel JSON log records", () => {
  assert.deepEqual(
    _internals.normalizeLogRecord(
      {
        id: "z4bcd-1781366111100-4b31a8702e55",
        timestamp: 1781366111100,
        requestMethod: "GET",
        requestPath: "/api/cron/runtime-health",
        responseStatusCode: 200,
      },
      "/api/cron/runtime-health"
    ),
    {
      timestamp: "2026-06-13T15:55:11.100Z",
      requestId: "z4bcd-1781366111100-4b31a8702e55",
      method: "GET",
      path: "/api/cron/runtime-health",
      statusCode: 200,
      containsExpectedPath: true,
    }
  );
});

test("scheduled cron log proof passes with a 200 cron path candidate", () => {
  const proof = _internals.summarizeScheduledCronLogProof({
    project: "fawxzzy-discordos",
    since: "2026-06-13T07:55:00Z",
    until: "2026-06-13T08:10:00Z",
    expectedPath: "/api/cron/runtime-health",
    records: [
      {
        timestamp: "2026-06-13T08:00:04.000Z",
        method: "GET",
        path: "/api/cron/runtime-health",
        statusCode: 200,
      },
      {
        timestamp: "2026-06-13T07:59:01.000Z",
        method: "GET",
        path: "/api/runtime-health",
        statusCode: 200,
      },
    ],
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.destructive, false);
  assert.equal(proof.sendsMessages, false);
  assert.equal(proof.writesArtifacts, false);
  assert.equal(proof.candidateCount, 1);
  assert.equal(proof.passingCandidateCount, 1);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_scheduled_log_proof_pass");
});

test("scheduled cron log proof fails closed without a 200 cron path candidate", () => {
  const proof = _internals.summarizeScheduledCronLogProof({
    project: "fawxzzy-discordos",
    since: "2026-06-13T07:55:00Z",
    until: "2026-06-13T08:10:00Z",
    expectedPath: "/api/cron/runtime-health",
    records: [
      {
        timestamp: "2026-06-13T08:00:04.000Z",
        method: "GET",
        path: "/api/cron/runtime-health",
        statusCode: 401,
      },
    ],
  });

  assert.equal(proof.ok, false);
  assert.deepEqual(proof.reasonCodes, ["scheduled_cron_log_not_found"]);
  assert.equal(proof.event.type, "discordos.runtime_health.cron_scheduled_log_proof_missing");
});

test("scheduled cron log proof invokes Vercel logs and summarizes output", async () => {
  const proof = await _internals.buildRuntimeHealthCronScheduledLogProof({
    project: "fawxzzy-discordos",
    since: "1h",
    until: null,
    limit: 100,
    expectedPath: "/api/cron/runtime-health",
    execFileImpl: async (executable, args) => {
      assert.equal(executable, _internals.getVercelExecutable());
      assert(args.includes("logs"));
      assert(args.includes("--json"));
      return {
        stdout: [
          JSON.stringify({
            timestamp: "2026-06-13T08:00:04.000Z",
            method: "GET",
            path: "/api/cron/runtime-health",
            statusCode: 200,
          }),
          "",
        ].join("\n"),
        stderr: "",
      };
    },
  });

  assert.equal(proof.ok, true);
  assert.equal(proof.command.executable, _internals.getVercelExecutable());
});

test("scheduled cron log proof renders markdown", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    event: {
      type: "discordos.runtime_health.cron_scheduled_log_proof_pass",
      severity: "info",
    },
    project: "fawxzzy-discordos",
    since: "1h",
    until: null,
    expectedPath: "/api/cron/runtime-health",
    totalLogRecords: 1,
    candidateCount: 1,
    passingCandidateCount: 1,
    latestPassing: {
      timestamp: "2026-06-13T08:00:04.000Z",
      statusCode: 200,
    },
    reasonCodes: [],
  });

  assert(rendered.includes("# DiscordOS Runtime Health Cron Scheduled Log Proof"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("passing candidate count: `1`"));
});
