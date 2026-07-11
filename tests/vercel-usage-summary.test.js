const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/vercel-usage-summary");

test("vercel usage summary parses team id argument", () => {
  assert.deepEqual(_internals.parseArgs(["--team-id", "team_123", "--scope", "fawxzzy"]), {
    json: false,
    scope: "fawxzzy",
    from: _internals.defaultPeriod().from,
    to: _internals.defaultPeriod().to,
    breakdown: null,
    teamId: "team_123",
  });
});

test("vercel usage summary builds deployment proxy fallback when costs are unavailable", async () => {
  const summary = await _internals.buildUsageSummary(
    {
      json: true,
      scope: "fawxzzy",
      from: "2026-06-09",
      to: "2026-07-09",
      breakdown: null,
      teamId: null,
    },
    {
      runVercelUsageImpl: async () => ({
        ok: false,
        stderr: "Error: Costs not found (404)",
        args: ["usage"],
      }),
      loadDefaultTeamIdImpl: async () => "team_123",
      buildDeploymentProxySummaryFromApiImpl: async (options, { teamId }) => ({
        ok: true,
        status: "proxy_ready",
        scope: options.scope,
        teamId,
        period: {
          from: options.from,
          to: options.to,
        },
        source: "deployment_proxy",
        reasonCodes: ["vercel_usage_costs_not_found"],
        projectCount: 1,
        topProjects: [
          {
            project: "DiscordOS",
            totalDeployments: 12,
            productionDeployments: 10,
            previewOrCustomDeployments: 2,
          },
        ],
        optimizationSignals: [],
        nextActions: [],
      }),
    }
  );

  assert.equal(summary.ok, true);
  assert.equal(summary.status, "proxy_ready");
  assert.equal(summary.teamId, "team_123");
  assert.equal(summary.topProjects[0].project, "DiscordOS");
});

test("vercel usage summary proxy computes repeated production deploy signals", () => {
  const summary = _internals.buildDeploymentProxySummary({
    options: {
      scope: "fawxzzy",
      from: "2026-06-09",
      to: "2026-07-09",
    },
    teamId: "team_123",
    projects: [
      { id: "prj_1", name: "DiscordOS" },
      { id: "prj_2", name: "Foundation" },
    ],
    deploymentsByProject: {
      prj_1: [
        {
          id: "a",
          created: 1,
          state: "READY",
          target: "production",
          meta: { githubCommitMessage: "Repeat me" },
        },
        {
          id: "b",
          created: 2,
          state: "READY",
          target: "production",
          meta: { githubCommitMessage: "Repeat me" },
        },
        {
          id: "c",
          created: 3,
          state: "READY",
          target: "production",
          meta: { githubCommitMessage: "Repeat me" },
        },
        {
          id: "d",
          created: 4,
          state: "READY",
          target: null,
          meta: { githubCommitMessage: "Preview change" },
        },
      ],
      prj_2: [],
    },
    reasonCodes: ["vercel_usage_costs_not_found"],
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.projectSummaries[0].project, "DiscordOS");
  assert.equal(summary.projectSummaries[0].productionDeployments, 3);
  assert.equal(summary.projectSummaries[0].previewOrCustomDeployments, 1);
  assert.equal(summary.optimizationSignals[0].type, "repeated_production_redeploys");
  assert.equal(summary.optimizationSignals[0].count, 3);
});

test("vercel usage summary renders proxy markdown", () => {
  const markdown = _internals.renderMarkdown({
    ok: true,
    status: "proxy_ready",
    source: "deployment_proxy",
    reasonCodes: ["vercel_usage_costs_not_found"],
    period: {
      from: "2026-06-09",
      to: "2026-07-09",
    },
    projectCount: 1,
    topProjects: [
      {
        project: "DiscordOS",
        totalDeployments: 10,
        productionDeployments: 8,
        previewOrCustomDeployments: 2,
      },
    ],
    optimizationSignals: [
      {
        project: "DiscordOS",
        type: "repeated_production_redeploys",
        count: 4,
        message: "Repeat me",
      },
    ],
  });

  assert.match(markdown, /proxy_ready/);
  assert.match(markdown, /DiscordOS/);
  assert.match(markdown, /repeated_production_redeploys/);
});
