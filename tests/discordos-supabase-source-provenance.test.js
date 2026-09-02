const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "supabase", "source-provenance.manifest.json");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const EXPECTED_EDGE_BUNDLE_SHA256 = Object.freeze({
  "discordos-feedback-persist": "4104192cdfb221aff0b7e032285981734703fd6f6bf005c2876dabce19c8f4ee",
  "discordos-live-transfer-status": "f33c8eb977af62537aee1af9d6293297b15beaabd837611849b94a580d9a4fcf",
  "discordos-product-workflow-rpc": "394d0a7d8e69a62accd684a02083e84c18812081f3b64fe916fd9a2f2b1a82d4",
  "discordos-readiness": "cfee6853e6757690885c23c647a07851f8a01f90478fe42f61680b83949423a9",
  "discordos-runtime-health-cron-audit": "dc1617fbc45d8d5ce6e14bdf564d3614bd1413d4b929d7e4a98a181c77982931",
  "discordos-update-drafts": "fc366e5b614f9a776ff15f291a41d8dc3173375a6fa5dcd86e5e5b65eec229fa",
});

function canonicalSourceBuffer(relativePath) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  const source = fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n*$/, "\n");
  return Buffer.from(source, "utf8");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertProviderRawSource(relativePath, expected, label) {
  const canonical = canonicalSourceBuffer(relativePath);
  const candidates = [canonical];
  if (canonical.at(-1) === 0x0a) {
    candidates.push(canonical.subarray(0, -1));
  }
  const matched = candidates.some(
    (candidate) => candidate.length === expected.bytes && sha256(candidate) === expected.sha256,
  );
  assert.equal(matched, true, `${label} provider raw source bytes and SHA-256`);
}

test("source provenance binds the complete live denominators", () => {
  assert.equal(manifest.schemaVersion, "discordos.supabase-source-provenance.v1");
  assert.deepEqual(manifest.project, {
    ref: "nwexsktuuenfdegzrbut",
    name: "DiscordOS",
  });
  assert.equal(manifest.migrations.length, 17);
  assert.equal(manifest.edgeFunctions.length, 6);
  assert.equal(new Set(manifest.migrations.map(({ liveVersion }) => liveVersion)).size, 17);
  assert.equal(new Set(manifest.migrations.map(({ sourcePath }) => sourcePath)).size, 17);
  for (const { liveVersion, sourcePath } of manifest.migrations) {
    assert.equal(
      path.basename(sourcePath).slice(0, 14),
      liveVersion,
      `${liveVersion} filename identity`,
    );
  }
  assert.equal(new Set(manifest.edgeFunctions.map(({ slug }) => slug)).size, 6);
  assert.equal(new Set(manifest.edgeFunctions.map(({ sourcePath }) => sourcePath)).size, 6);
  assert.equal(manifest.provenance.mutationsPerformed, false);
  assert.equal(manifest.provenance.secretsCaptured, false);
  assert.equal(manifest.provenance.cronCommandCaptured, false);
  assert.equal(manifest.provenance.machinePathsCaptured, false);
  assert.deepEqual(manifest.comparisonPolicy.migrations, {
    lineEndings: "lf",
    terminalNewline: "exactly_one",
  });
  assert.deepEqual(manifest.comparisonPolicy.edgeProviderRawSource, {
    bytes: "preserve_exact_authenticated_provider_bytes",
  });
  assert.deepEqual(manifest.comparisonPolicy.edgeCanonicalSource, {
    lineEndings: "lf",
    terminalNewline: "exactly_one",
  });
});

test("all 17 migration sources match provider history after repository normalization", () => {
  for (const migration of manifest.migrations) {
    const source = canonicalSourceBuffer(migration.sourcePath);
    assert.equal(
      source.length,
      migration.canonicalSource.bytes,
      `${migration.liveVersion} byte length`,
    );
    assert.equal(
      sha256(source),
      migration.canonicalSource.sha256,
      `${migration.liveVersion} SHA-256`,
    );
    assertProviderRawSource(
      migration.sourcePath,
      migration.providerRawSource,
      migration.liveVersion,
    );
  }
});

test("the six recovered migration versions have exact source identities", () => {
  const expected = [
    "20260612082854",
    "20260627201353",
    "20260627202737",
    "20260627202816",
    "20260627210302",
    "20260627211548",
  ];
  const recovered = manifest.migrations.filter(({ liveVersion, sourcePath }) =>
    expected.includes(liveVersion) && path.basename(sourcePath).startsWith(liveVersion),
  );

  assert.deepEqual(
    recovered.map(({ liveVersion }) => liveVersion),
    expected,
  );

  const baseline = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260612082758_discordos_feedback_runtime_schema_v1.sql",
    ),
    "utf8",
  );
  const searchPathFix = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260612082854_discordos_set_updated_at_search_path.sql",
    ),
    "utf8",
  );
  assert.doesNotMatch(baseline, /set search_path = discordos, pg_temp/);
  assert.match(
    searchPathFix,
    /alter function discordos\.set_updated_at\(\) set search_path = discordos, pg_temp;/,
  );
});

test("all six Edge sources match the provider source catalog", () => {
  for (const edge of manifest.edgeFunctions) {
    const source = canonicalSourceBuffer(edge.sourcePath);
    assert.equal(source.length, edge.canonicalSource.bytes, `${edge.slug} byte length`);
    assert.equal(sha256(source), edge.canonicalSource.sha256, `${edge.slug} SHA-256`);
    assert.equal(edge.verifyJwt, true, `${edge.slug} verify_jwt`);
    assertProviderRawSource(edge.sourcePath, edge.providerRawSource, edge.slug);
  }
  assert.deepEqual(
    Object.fromEntries(
      manifest.edgeFunctions
        .map(({ slug, providerBundleSha256 }) => [slug, providerBundleSha256])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    EXPECTED_EDGE_BUNDLE_SHA256,
  );
});

test("update-drafts separates exact source and provider bundle digest classes", () => {
  const edge = manifest.edgeFunctions.find(({ slug }) => slug === "discordos-update-drafts");
  assert(edge);
  assert.deepEqual(edge.providerRawSource, {
    bytes: 6703,
    sha256: "b0658e5a52534a34cb14abec5776cdaab8969c0fa04f7c3b64b4652c83272050",
  });
  assert.deepEqual(edge.canonicalSource, edge.providerRawSource);
  assert.equal(
    edge.providerBundleSha256,
    "fc366e5b614f9a776ff15f291a41d8dc3173375a6fa5dcd86e5e5b65eec229fa",
  );
  assert.notEqual(edge.providerBundleSha256, edge.providerRawSource.sha256);

  const raw = fs.readFileSync(path.join(REPO_ROOT, edge.sourcePath));
  assert.equal(raw.length, 6703);
  assert.equal(sha256(raw), edge.providerRawSource.sha256);
});

test("scheduler recovery preserves the parameterized secret-reference contract", () => {
  const extensionSource = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260627202737_enable_discordos_message_poll_scheduler.sql",
    ),
    "utf8",
  );
  const helperSource = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260627202816_add_discordos_message_poll_scheduler_helper.sql",
    ),
    "utf8",
  );

  assert.match(extensionSource, /create extension if not exists pg_cron;/);
  assert.match(extensionSource, /create extension if not exists pg_net;/);
  assert.match(helperSource, /bearer_token text/);
  assert.match(helperSource, /security invoker/);
  assert.match(helperSource, /net\.http_get/);
  assert.match(helperSource, /concat\('Bearer ', bearer_token\)/);
  assert.doesNotMatch(helperSource, /cron\.schedule/);
});

test("update-draft storage remains RLS-enabled and service-role-only", () => {
  const tableSource = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260627210302_discordos_update_drafts_runtime.sql",
    ),
    "utf8",
  );
  const rpcSource = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260627211548_discordos_update_draft_rpcs.sql",
    ),
    "utf8",
  );

  assert.match(tableSource, /alter table discordos\.discord_update_drafts enable row level security;/);
  assert.match(
    tableSource,
    /revoke all on discordos\.discord_update_drafts from public, anon, authenticated;/,
  );
  assert.match(
    tableSource,
    /grant all privileges on discordos\.discord_update_drafts to service_role;/,
  );
  assert.equal((rpcSource.match(/security invoker/g) || []).length, 6);
  assert.equal((rpcSource.match(/grant execute on function/g) || []).length, 6);
  assert.equal((rpcSource.match(/revoke all on function/g) || []).length, 6);
  assert.doesNotMatch(rpcSource, /security definer/);
});

test("recovered migrations represent the exact live table, function, and trigger identities", () => {
  const migrationSource = manifest.migrations
    .map(({ sourcePath }) => fs.readFileSync(path.join(REPO_ROOT, sourcePath), "utf8"))
    .join("\n");

  const identities = (pattern) =>
    [...migrationSource.matchAll(pattern)].map((match) => match[1]).sort();
  const uniqueIdentities = (pattern) => [...new Set(identities(pattern))].sort();

  assert.deepEqual(
    uniqueIdentities(/create table if not exists\s+(discordos\.[a-z0-9_]+)/gi),
    [
      "discordos.discord_feedback_audit_events",
      "discordos.discord_feedback_completion_reviews",
      "discordos.discord_feedback_reports",
      "discordos.discord_update_drafts",
      "discordos.discordos_board_cards",
      "discordos.discordos_moderation_audit_log",
      "discordos.discordos_music_sesh_queue_items",
      "discordos.discordos_music_sesh_sessions",
      "discordos.discordos_music_sesh_votes",
      "discordos.runtime_health_cron_runs",
    ],
  );
  assert.deepEqual(
    uniqueIdentities(/create or replace function\s+([a-z0-9_]+\.[a-z0-9_]+)\s*\(/gi),
    [
      "discordos.set_updated_at",
      "discordos_private.trigger_message_command_poll",
      "public.discordos_get_live_transfer_status",
      "public.discordos_get_music_sesh_readback",
      "public.discordos_get_product_workflow_readback",
      "public.discordos_get_runtime_health_cron_run_status",
      "public.discordos_get_update_draft_by_deployment_id",
      "public.discordos_get_update_draft_by_id",
      "public.discordos_get_update_draft_by_prefix",
      "public.discordos_insert_feedback_proof",
      "public.discordos_insert_moderation_audit",
      "public.discordos_insert_runtime_health_cron_run",
      "public.discordos_insert_update_draft",
      "public.discordos_list_update_drafts",
      "public.discordos_search_moderation_audit",
      "public.discordos_update_update_draft",
      "public.discordos_upsert_board_card",
      "public.discordos_upsert_music_sesh_event",
    ],
  );
  assert.deepEqual(
    uniqueIdentities(/create trigger\s+([a-z0-9_]+)/gi),
    [
      "set_discord_feedback_reports_updated_at",
      "set_discord_update_drafts_updated_at",
      "set_discordos_board_cards_updated_at",
      "set_discordos_music_sesh_queue_items_updated_at",
      "set_discordos_music_sesh_sessions_updated_at",
      "set_discordos_music_sesh_votes_updated_at",
    ],
  );
});

test("exact Edge recovery records the accepted caller-authorization risk without hiding it", () => {
  const risk = manifest.knownRisks.find(
    ({ id }) => id === "discordos-update-drafts-caller-authorization",
  );
  assert.deepEqual(risk, {
    id: "discordos-update-drafts-caller-authorization",
    status: "accepted_live_risk_outside_exact_source_recovery",
    evidence: "Recovered v5 source uses the service-role credential after Edge gateway JWT verification without an additional caller-role or internal shared-secret check.",
    boundary: "Changing this exact recovered source would alter accepted live semantics and invalidate its authenticated source digest.",
    nextAction: "Admit a separate Edge security remediation packet before any deployment.",
  });

  const source = fs.readFileSync(
    path.join(REPO_ROOT, "supabase", "functions", "discordos-update-drafts", "index.ts"),
    "utf8",
  );
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /req\.headers|getClaims|getUser|shared.?secret/i);
});

test("recovered artifacts contain no credential value or machine-path shape", () => {
  const paths = [
    ...manifest.migrations.map(({ sourcePath }) => sourcePath),
    ...manifest.edgeFunctions.map(({ sourcePath }) => sourcePath),
    "supabase/source-provenance.manifest.json",
  ];
  const contents = paths.map((relativePath) =>
    fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"),
  ).join("\n");

  assert.doesNotMatch(contents, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(contents, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(contents, /Bearer\s+[A-Za-z0-9._-]{20,}/i);
  assert.doesNotMatch(contents, /[A-Za-z]:\\(?:Users|ATLAS)\\/i);
  assert.doesNotMatch(contents, /\/tmp\/user_fn_/);
});
