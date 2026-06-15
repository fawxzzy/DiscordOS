const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-supabase-apply-readback-proof");

test("supabase apply readback proof parses json flag", () => {
  const parsed = _internals.parseArgs(["--json"]);

  assert.equal(parsed.json, true);
});

test("supabase apply readback proof validates applied private tables", () => {
  const result = _internals.buildSupabaseApplyReadbackProof();

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.appliesDatabaseMigrations, false);
  assert.equal(result.status, "readback_proven");
  assert.equal(result.projectRef, "nwexsktuuenfdegzrbut");
  assert.equal(result.tableChecks.length, 2);
  assert.equal(result.migrationChecks.length, 2);
  assert(result.tableChecks.every((table) => table.exists));
  assert(result.tableChecks.every((table) => table.privateSchema));
  assert(result.tableChecks.every((table) => table.rlsEnabled));
  assert(result.tableChecks.every((table) => table.noPublicPolicies));
  assert(result.tableChecks.every((table) => table.noPublicGrants));
  assert(result.tableChecks.every((table) => table.serviceRoleGranted));
  assert(result.migrationChecks.every((migration) => migration.applied));
  assert.equal(result.event.type, "discordos.supabase.apply_readback_proof_ready");
});

test("supabase apply readback proof blocks missing public grant posture", () => {
  const readback = structuredClone(_internals.DEFAULT_READBACK);
  readback.tables[0].publicGrantCount = 1;
  const result = _internals.buildSupabaseApplyReadbackProof({ readback });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.reasonCodes.includes("discordos_board_cards_noPublicGrants_failed"));
});

test("supabase apply readback proof renders bounded markdown", () => {
  const result = _internals.buildSupabaseApplyReadbackProof();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Supabase Apply Readback Proof"));
  assert(rendered.includes("discordos_board_cards: exists `true`"));
  assert(rendered.includes("discordos_moderation_audit_log: exists `true`"));
  assert(rendered.includes("public grants `none`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
