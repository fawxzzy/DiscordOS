const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../api/readiness");

function jwtWithPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test("service-role status fails closed when missing", () => {
  assert.deepEqual(_internals.getServiceRoleStatus(undefined), {
    present: false,
    configured: false,
    roleMatches: false,
    projectRefMatches: false,
    reason: "missing",
  });
});

test("service-role status rejects malformed tokens", () => {
  const status = _internals.getServiceRoleStatus("not-a-jwt");

  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.reason, "malformed");
});

test("service-role status rejects publishable or anon role JWTs", () => {
  const status = _internals.getServiceRoleStatus(
    jwtWithPayload({ role: "anon", ref: _internals.EXPECTED_SUPABASE_REF })
  );

  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.roleMatches, false);
  assert.equal(status.projectRefMatches, true);
  assert.equal(status.reason, "metadata_mismatch");
});

test("service-role status rejects service-role JWTs for the wrong project ref", () => {
  const status = _internals.getServiceRoleStatus(
    jwtWithPayload({ role: _internals.SERVICE_ROLE, ref: "lpswxoyfniocuhljgzbc" })
  );

  assert.equal(status.present, true);
  assert.equal(status.configured, false);
  assert.equal(status.roleMatches, true);
  assert.equal(status.projectRefMatches, false);
  assert.equal(status.reason, "metadata_mismatch");
});

test("service-role status accepts service-role JWTs for the DiscordOS project ref", () => {
  const status = _internals.getServiceRoleStatus(
    jwtWithPayload({
      role: _internals.SERVICE_ROLE,
      ref: _internals.EXPECTED_SUPABASE_REF,
    })
  );

  assert.equal(status.present, true);
  assert.equal(status.configured, true);
  assert.equal(status.roleMatches, true);
  assert.equal(status.projectRefMatches, true);
  assert.equal(status.reason, "valid");
});
