const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-queue-conflict-host-controls");

test("queue conflict host controls parses scenario args", () => {
  const parsed = _internals.parseArgs(["--json", "--scenario", "default"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.scenario, "default");
});

test("queue conflict host controls proves lock close and duplicate vote behavior", () => {
  const result = _internals.buildMusicSeshQueueConflictHostControls();
  const conflictReasons = result.summary.conflicts.map((item) => item.reasonCode);

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.callsMusicProviders, false);
  assert.equal(result.controlsPlayback, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.summary.sessionState, "closed");
  assert.equal(result.summary.voteCount, 1);
  assert(conflictReasons.includes("queue_rejected_session_locked"));
  assert(conflictReasons.includes("duplicate_vote_ignored"));
  assert(conflictReasons.includes("session_closed"));
});

test("queue conflict host controls blocks non-host lock", () => {
  const summary = _internals.reduceConflictScenario([
    { id: "open", action: "open_session", actorRole: "host" },
    { id: "lock", action: "lock_session", actorRole: "member" },
  ]);

  assert.equal(summary.conflicts[0].reasonCode, "host_action_requires_host");
});
