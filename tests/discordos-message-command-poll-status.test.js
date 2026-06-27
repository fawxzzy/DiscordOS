const assert = require("node:assert/strict");
const test = require("node:test");

const {
  _internals,
} = require("../scripts/discordos-message-command-poll-status");

test("message command poll status args support repo workflow and stale overrides", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    repoFullName: _internals.DEFAULT_REPO_FULL_NAME,
    workflowId: _internals.DEFAULT_WORKFLOW_ID,
    workerWorkflowId: _internals.DEFAULT_WORKER_WORKFLOW_ID,
    maxStaleMinutes: _internals.DEFAULT_MAX_STALE_MINUTES,
    perPage: _internals.DEFAULT_RUNS_PER_PAGE,
  });

  const parsed = _internals.parseArgs([
    "--json",
    "--repo",
    "example/repo",
    "--workflow",
    "custom.yml",
    "--worker-workflow",
    "worker.yml",
    "--max-stale-minutes",
    "30",
    "--per-page",
    "9",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.repoFullName, "example/repo");
  assert.equal(parsed.workflowId, "custom.yml");
  assert.equal(parsed.workerWorkflowId, "worker.yml");
  assert.equal(parsed.maxStaleMinutes, 30);
  assert.equal(parsed.perPage, 9);
});

test("message command poll status passes when workflow is active and latest run is fresh", async () => {
  const status = await _internals.buildDiscordMessageCommandPollStatus({
    repoFullName: "example/repo",
    workflowId: "discord-message-command-poll.yml",
    maxStaleMinutes: 15,
    now: () => Date.parse("2026-06-27T21:45:00Z"),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/actions/workflows/discord-message-command-poll.yml")) {
        return new Response(JSON.stringify({
          name: "Discord Message Command Poll",
          state: "active",
        }), { status: 200 });
      }
      if (String(url).endsWith("/actions/workflows/discord-message-command-worker.yml")) {
        return new Response(JSON.stringify({
          name: "Discord Message Command Worker",
          state: "active",
        }), { status: 200 });
      }
      if (String(url).includes("/runs?per_page=5")) {
        if (String(url).includes("discord-message-command-worker.yml")) {
          return new Response(JSON.stringify({
            workflow_runs: [
              {
                id: 11,
                run_number: 4,
                event: "workflow_dispatch",
                status: "in_progress",
                conclusion: null,
                run_started_at: "2026-06-27T19:28:20Z",
                created_at: "2026-06-27T19:28:20Z",
                updated_at: "2026-06-27T19:28:23Z",
                html_url: "https://github.com/example/repo/actions/runs/11",
              },
            ],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          workflow_runs: [
            {
              id: 10,
              run_number: 3,
              event: "schedule",
              status: "completed",
              conclusion: "success",
              run_started_at: "2026-06-27T21:40:00Z",
              created_at: "2026-06-27T21:40:00Z",
              updated_at: "2026-06-27T21:40:10Z",
              html_url: "https://github.com/example/repo/actions/runs/10",
            },
          ],
        }), { status: 200 });
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });

  assert.equal(status.ok, true);
  assert.equal(status.status, "ready");
  assert.equal(status.workflowState, "active");
  assert.equal(status.workerWorkflowState, "active");
  assert.equal(status.latestRun.ageMinutes, 5);
  assert.equal(status.latestWorkerRun.ageMinutes, 136);
  assert.equal(status.healthySource, "poll_and_worker");
  assert.deepEqual(status.reasonCodes, []);
  assert.equal(status.event.type, "discordos.message_command_poll.ready");
});

test("message command poll status stays ready when the schedule fallback is stale but the worker is active", async () => {
  const status = await _internals.buildDiscordMessageCommandPollStatus({
    now: () => Date.parse("2026-06-27T22:10:00Z"),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/actions/workflows/discord-message-command-poll.yml")) {
        return new Response(JSON.stringify({
          name: "Discord Message Command Poll",
          state: "active",
        }), { status: 200 });
      }
      if (String(url).endsWith("/actions/workflows/discord-message-command-worker.yml")) {
        return new Response(JSON.stringify({
          name: "Discord Message Command Worker",
          state: "active",
        }), { status: 200 });
      }
      if (String(url).includes("/runs?per_page=5")) {
        if (String(url).includes("discord-message-command-worker.yml")) {
          return new Response(JSON.stringify({
            workflow_runs: [
              {
                id: 11,
                run_number: 2,
                event: "workflow_dispatch",
                status: "in_progress",
                conclusion: null,
                run_started_at: "2026-06-27T19:28:20Z",
                created_at: "2026-06-27T19:28:20Z",
                updated_at: "2026-06-27T19:28:23Z",
                html_url: "https://github.com/example/repo/actions/runs/11",
              },
            ],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          workflow_runs: [
            {
              id: 10,
              run_number: 3,
              event: "schedule",
              status: "completed",
              conclusion: "success",
              run_started_at: "2026-06-27T21:40:00Z",
              created_at: "2026-06-27T21:40:00Z",
              updated_at: "2026-06-27T21:40:10Z",
              html_url: "https://github.com/example/repo/actions/runs/10",
            },
          ],
        }), { status: 200 });
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });

  assert.equal(status.ok, true);
  assert.equal(status.status, "ready");
  assert.equal(status.healthySource, "worker");
  assert.deepEqual(status.pollReasonCodes, ["latest_run_stale"]);
  assert.deepEqual(status.workerReasonCodes, []);
  assert.deepEqual(status.reasonCodes, []);
});

test("message command poll status fails closed when both poll and worker are unhealthy", async () => {
  const status = await _internals.buildDiscordMessageCommandPollStatus({
    now: () => Date.parse("2026-06-28T03:10:00Z"),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/actions/workflows/discord-message-command-poll.yml")) {
        return new Response(JSON.stringify({
          name: "Discord Message Command Poll",
          state: "active",
        }), { status: 200 });
      }
      if (String(url).endsWith("/actions/workflows/discord-message-command-worker.yml")) {
        return new Response(JSON.stringify({
          name: "Discord Message Command Worker",
          state: "active",
        }), { status: 200 });
      }
      if (String(url).includes("/runs?per_page=5")) {
        if (String(url).includes("discord-message-command-worker.yml")) {
          return new Response(JSON.stringify({
            workflow_runs: [
              {
                id: 11,
                run_number: 2,
                event: "workflow_dispatch",
                status: "completed",
                conclusion: "success",
                run_started_at: "2026-06-27T19:28:20Z",
                created_at: "2026-06-27T19:28:20Z",
                updated_at: "2026-06-27T20:00:00Z",
                html_url: "https://github.com/example/repo/actions/runs/11",
              },
            ],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          workflow_runs: [
            {
              id: 10,
              run_number: 3,
              event: "schedule",
              status: "completed",
              conclusion: "success",
              run_started_at: "2026-06-27T21:40:00Z",
              created_at: "2026-06-27T21:40:00Z",
              updated_at: "2026-06-27T21:40:10Z",
              html_url: "https://github.com/example/repo/actions/runs/10",
            },
          ],
        }), { status: 200 });
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });

  assert.equal(status.ok, false);
  assert.equal(status.status, "action_required");
  assert.equal(status.healthySource, "none");
  assert.deepEqual(status.reasonCodes, [
    "latest_run_stale",
    "worker_run_stale",
    "worker_run_not_active",
  ]);
});

test("message command poll status renders markdown without secrets", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    repoFullName: "fawxzzy/DiscordOS",
    workflowId: "discord-message-command-poll.yml",
    workflowName: "Discord Message Command Poll",
    workflowState: "active",
    workerWorkflowId: "discord-message-command-worker.yml",
    workerWorkflowName: "Discord Message Command Worker",
    workerWorkflowState: "active",
    maxStaleMinutes: 15,
    healthySource: "poll_and_worker",
    latestRun: {
      id: 10,
      runNumber: 3,
      event: "schedule",
      status: "completed",
      conclusion: "success",
      ageMinutes: 5,
      runStartedAt: "2026-06-27T21:40:00Z",
      url: "https://github.com/example/repo/actions/runs/10",
    },
    latestWorkerRun: {
      id: 11,
      runNumber: 2,
      event: "workflow_dispatch",
      status: "in_progress",
      conclusion: null,
      ageMinutes: 136,
      runStartedAt: "2026-06-27T19:28:20Z",
      url: "https://github.com/example/repo/actions/runs/11",
    },
    pollReasonCodes: [],
    workerReasonCodes: [],
    reasonCodes: [],
    event: {
      type: "discordos.message_command_poll.ready",
    },
  });

  assert(rendered.includes("# DiscordOS Message Command Poll Status"));
  assert(rendered.includes("Discord Message Command Poll"));
  assert(!rendered.includes("secret"));
});
