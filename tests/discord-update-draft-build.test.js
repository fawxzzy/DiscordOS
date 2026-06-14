const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-draft-build");

test("update draft builder parses repeated changes and proofs", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--title",
    "DiscordOS Update",
    "--change",
    "Dashboard console added",
    "--change",
    "Dashboard console added",
    "--proof",
    "npm run verify",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.title, "DiscordOS Update");
  assert.equal(parsed.changes.length, 2);
  assert.equal(parsed.proofs.length, 1);
});

test("update draft builder renders curated public body", () => {
  const result = _internals.buildDiscordUpdateDraft({
    title: "DiscordOS Value Scope Closed",
    changes: ["Dashboard console added", "Moderation audit preview added"],
    proofs: ["npm run verify passed"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.changeCount, 2);
  assert.equal(result.proofCount, 1);
  assert(result.body.includes("What changed:"));
  assert(result.body.includes("Proof:"));
  assert(!result.body.includes("##"));
  assert(result.markdown.includes("# DiscordOS Value Scope Closed"));
  assert(result.markdown.includes("## Update Post"));
  assert.equal(result.event.type, "discordos.updates.draft_build_ready");
});

test("update draft builder blocks missing public substance", () => {
  const result = _internals.buildDiscordUpdateDraft({
    title: "",
    changes: [],
    proofs: [],
  });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("title_missing"));
  assert(result.reasonCodes.includes("change_missing"));
  assert(result.reasonCodes.includes("proof_missing"));
  assert.equal(result.markdown, "");
});

test("update draft builder deduplicates list values", () => {
  assert.deepEqual(_internals.normalizeList([" a ", "a", "", "b"]), ["a", "b"]);
});
