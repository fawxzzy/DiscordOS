const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-preflight");

test("moderation preflight parses action inputs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--case-id",
    "mod-1",
    "--action",
    "warn",
    "--subject-user-id",
    "1504671871512346695",
    "--actor-user-id",
    "1515220075366580224",
    "--reason",
    "rule review",
    "--severity",
    "high",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.action, "warn");
  assert.equal(parsed.severity, "high");
});

test("moderation preflight accepts admitted local contract action", () => {
  const result = _internals.buildDiscordOSModerationPreflight({
    caseId: "mod-1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    reason: "rule review",
    severity: "high",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.liveActionAllowed, false);
  assert.equal(result.requiresExplicitLiveLane, true);
  assert.equal(result.preview.caseId, "mod-1");
  assert.equal(result.preview.severity, "high");
  assert.equal(result.preview.subjectFingerprint.length, 12);
  assert.equal(result.auditEnvelope.type, "discordos.moderation.audit_preview");
  assert.equal(result.auditEnvelope.liveActionAllowed, false);
  assert.equal(result.event.type, "discordos.moderation.preflight_ready");
});

test("moderation preflight blocks invalid action severity and snowflake shapes", () => {
  const result = _internals.buildDiscordOSModerationPreflight({
    caseId: "mod-1",
    action: "ban",
    subjectDiscordUserId: "abc",
    actorDiscordUserId: "",
    reason: "",
    severity: "severe",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("action_not_admitted"));
  assert(result.reasonCodes.includes("severity_not_admitted"));
  assert(result.reasonCodes.includes("subject_user_id_invalid"));
  assert(result.reasonCodes.includes("actor_user_id_invalid"));
  assert(result.reasonCodes.includes("reason_missing"));
});

test("moderation preflight normalizes case ids and stable fingerprints", () => {
  assert.equal(_internals.normalizeCaseId(" MOD 123 / Review "), "mod-123-review");
  assert.equal(
    _internals.buildStableFingerprint("1504671871512346695"),
    _internals.buildStableFingerprint("1504671871512346695")
  );
  assert.equal(_internals.buildStableFingerprint("abc"), null);
});

test("moderation preflight render omits raw user ids", () => {
  const result = _internals.buildDiscordOSModerationPreflight({
    caseId: "MOD 1",
    action: "note",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    reason: "review",
    severity: "low",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Preflight"));
  assert(rendered.includes("case id: `mod-1`"));
  assert(rendered.includes("severity: `low`"));
  assert(rendered.includes("live action allowed: `false`"));
  assert(rendered.includes("subject fingerprint present: `true`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
});
