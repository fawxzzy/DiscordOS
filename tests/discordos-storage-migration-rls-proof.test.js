const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-storage-migration-rls-proof");

async function writeSql(sql) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-storage-proof-"));
  const migrationPath = path.join(dir, "migration.sql");
  await fs.writeFile(migrationPath, sql, "utf8");
  return migrationPath;
}

test("storage migration RLS proof parses feature and migration args", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--feature",
    "moderation",
    "--migration-file",
    "tmp.sql",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.feature, "moderation");
  assert(parsed.migrationPath.endsWith("tmp.sql"));
});

test("storage migration RLS proof passes board migration", async () => {
  const result = await _internals.buildStorageMigrationRlsProof({ feature: "board" });

  assert.equal(result.ok, true);
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.status, "ready");
  assert.equal(result.table, "discordos.discordos_board_cards");
  assert.equal(result.idempotencyColumn, "card_id");
  assert.equal(result.rlsEnabled, true);
  assert.equal(result.serviceRoleOnly, true);
  assert.equal(result.publicPoliciesAllowed, false);
  assert.equal(result.dataApiPublicExposureAllowed, false);
  assert.equal(result.migrationApplied, false);
  assert.equal(result.event.type, "discordos.storage_migration.rls_proof_ready");
});

test("storage migration RLS proof passes moderation migration", async () => {
  const result = await _internals.buildStorageMigrationRlsProof({ feature: "moderation" });

  assert.equal(result.ok, true);
  assert.equal(result.table, "discordos.discordos_moderation_audit_log");
  assert.equal(result.idempotencyColumn, "case_id");
  assert.equal(result.rlsEnabled, true);
  assert.equal(result.serviceRoleOnly, true);
});

test("storage migration RLS proof blocks public policies", async () => {
  const migrationPath = await writeSql(`
    create table if not exists discordos.discordos_board_cards (card_id text primary key);
    alter table discordos.discordos_board_cards enable row level security;
    create policy board_public on discordos.discordos_board_cards for select to anon using (true);
  `);
  const result = await _internals.buildStorageMigrationRlsProof({
    feature: "board",
    migrationPath,
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("migration_forbidden_token_present"));
  assert(result.forbidden.present.includes("create policy "));
});

test("storage migration RLS proof renders bounded markdown", async () => {
  const result = await _internals.buildStorageMigrationRlsProof({ feature: "board" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Storage Migration RLS Proof"));
  assert(rendered.includes("service-role only: `true`"));
  assert(rendered.includes("migration applied: `false`"));
  assert(!rendered.includes("SUPABASE_SERVICE_ROLE_KEY="));
});
