const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-operator-activation-runbook");

test("operator activation runbook parses json flag", () => {
  const parsed = _internals.parseArgs(["--json"]);

  assert.equal(parsed.json, true);
});

test("operator activation runbook reports pending gates without secrets", () => {
  const result = _internals.buildOperatorActivationRunbook({ env: {} });

  assert.equal(result.ok, true);
  assert.equal(result.activationReady, false);
  assert(result.reasonCodes.includes("missing_supabase_url"));
  assert(!JSON.stringify(result).includes("SERVICE_ROLE_KEY="));
});

test("operator activation runbook is activation ready with edge and gates", () => {
  const result = _internals.buildOperatorActivationRunbook({
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_ANON_KEY: "anon-key",
      DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE: "enabled",
      DISCORDOS_BOARD_ACTIVE_WRITE_ADAPTER: "enabled",
      DISCORDOS_MODERATION_AUDIT_WRITE_ADAPTER: "enabled",
    },
  });

  assert.equal(result.activationReady, true);
  assert.equal(result.gateStatus.transport, "edge_proxy");
  assert.equal(result.steps.every((step) => step.ready), true);
});

test("operator activation runbook renders bounded markdown", () => {
  const result = _internals.buildOperatorActivationRunbook({ env: {} });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Operator Activation Runbook"));
  assert(rendered.includes("sends messages: `false`"));
});
