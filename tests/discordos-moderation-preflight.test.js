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
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.action, "warn");
});

test("moderation preflight accepts admitted local contract action", () => {
  const result = _internals.buildDiscordOSModerationPreflight({
    caseId: "mod-1",
    action: "warn",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    reason: "rule review",
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.liveActionAllowed, false);
  assert.equal(result.requiresExplicitLiveLane, true);
  assert.equal(result.event.type, "discordos.moderation.preflight_ready");
});

test("moderation preflight blocks invalid action and snowflake shapes", () => {
  const result = _internals.buildDiscordOSModerationPreflight({
    caseId: "mod-1",
    action: "ban",
    subjectDiscordUserId: "abc",
    actorDiscordUserId: "",
    reason: "",
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("action_not_admitted"));
  assert(result.reasonCodes.includes("subject_user_id_invalid"));
  assert(result.reasonCodes.includes("actor_user_id_invalid"));
  assert(result.reasonCodes.includes("reason_missing"));
});

test("moderation preflight render omits raw user ids", () => {
  const result = _internals.buildDiscordOSModerationPreflight({
    caseId: "mod-1",
    action: "note",
    subjectDiscordUserId: "1504671871512346695",
    actorDiscordUserId: "1515220075366580224",
    reason: "review",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Preflight"));
  assert(rendered.includes("live action allowed: `false`"));
  assert(!rendered.includes("1504671871512346695"));
  assert(!rendered.includes("1515220075366580224"));
});
