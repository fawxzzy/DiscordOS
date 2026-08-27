const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  buildSupabaseElevatedHeaders,
  buildSupabasePublicHeaders,
  isModernSupabaseKeyLike,
  isModernSupabasePublishableKey,
  isModernSupabaseSecretKey,
} = require("../scripts/supabase-api-key-headers");

const modernSecret = `sb_secret_${"a".repeat(32)}`;

test("modern secret keys are sent only as apikey", () => {
  assert.equal(isModernSupabaseSecretKey(modernSecret), true);
  assert.deepEqual(buildSupabaseElevatedHeaders(modernSecret), { apikey: modernSecret });
  assert.equal("Authorization" in buildSupabaseElevatedHeaders(modernSecret), false);
});

test("legacy service-role keys preserve rollback-compatible bearer transport", () => {
  const legacy = "header.payload.signature";
  assert.equal(isModernSupabaseSecretKey(legacy), false);
  assert.deepEqual(buildSupabaseElevatedHeaders(legacy), { apikey: legacy, Authorization: `Bearer ${legacy}` });
});

test("modern publishable keys are sent only as apikey", () => {
  const publishable = `sb_publishable_${"b".repeat(32)}`;
  assert.equal(isModernSupabasePublishableKey(publishable), true);
  assert.deepEqual(buildSupabasePublicHeaders(publishable), { apikey: publishable });
  assert.equal("Authorization" in buildSupabasePublicHeaders(publishable), false);
});

test("legacy anon keys preserve rollback-compatible bearer transport", () => {
  const legacy = "header.payload.signature";
  assert.equal(isModernSupabasePublishableKey(legacy), false);
  assert.deepEqual(buildSupabasePublicHeaders(legacy), { apikey: legacy, Authorization: `Bearer ${legacy}` });
});

test("header builders reject cross-mode and malformed modern key classes", () => {
  const publishable = `sb_publishable_${"b".repeat(32)}`;
  const secret = `sb_secret_${"a".repeat(32)}`;
  assert.equal(isModernSupabaseKeyLike(publishable), true);
  assert.equal(isModernSupabaseKeyLike(secret), true);
  assert.throws(() => buildSupabaseElevatedHeaders(publishable), /SUPABASE_ELEVATED_KEY_CLASS_MISMATCH/);
  assert.throws(() => buildSupabasePublicHeaders(secret), /SUPABASE_PUBLIC_KEY_CLASS_MISMATCH/);
  assert.throws(() => buildSupabasePublicHeaders("sb_secret_short"), /SUPABASE_PUBLIC_KEY_CLASS_MISMATCH/);
  assert.throws(() => buildSupabaseElevatedHeaders("sb_publishable_short"), /SUPABASE_ELEVATED_KEY_CLASS_MISMATCH/);
});

test("missing key fails closed", () => {
  assert.throws(() => buildSupabaseElevatedHeaders(""), /SUPABASE_API_KEY_REQUIRED/);
  assert.throws(() => buildSupabasePublicHeaders(""), /SUPABASE_API_KEY_REQUIRED/);
});

test("every elevated REST call site uses the canonical header builder", () => {
  const relativePaths = [
    "api/feedback-persist.js",
    "api/discord-interactions.js",
    "api/cron/runtime-health.js",
    "scripts/discordos-supabase-service-rpc.js",
    "scripts/runtime-health-cron-audit-proof.js",
  ];
  for (const relativePath of relativePaths) {
    const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
    assert.match(source, /buildSupabaseElevatedHeaders\(serviceRoleKey\)/, relativePath);
    assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{serviceRoleKey\}`/, relativePath);
  }
});
