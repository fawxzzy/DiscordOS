const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { _internals: forumProfile } = require("../scripts/discordos-forum-profile");
const { _internals: scanCli } = require("../scripts/discordos-forum-profile-scan");
const {
  NORMALIZATION_ENV,
  NORMALIZATION_ENV_VALUE,
  _internals: normalization,
} = require("../scripts/discordos-forum-profile-normalize");

const repoRoot = path.resolve(__dirname, "..");
const boardRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "discordos-board-registry.json"), "utf8"));
const profileRegistry = JSON.parse(fs.readFileSync(path.join(repoRoot, "config", "discordos-forum-profile-registry.json"), "utf8"));
const roleIds = { everyone: boardRegistry.guildId, verified: "role-verified", fawx_security: "role-security" };
const guildRoles = [
  { id: boardRegistry.guildId, name: "@everyone" },
  { id: roleIds.verified, name: "Verified" },
  { id: roleIds.fawx_security, name: "Fawx Security" },
];

function permissionOverwrites() {
  const policy = profileRegistry.permissionProfiles["restricted-single-writer-v1"];
  return policy.roles.map((role) => ({
    id: roleIds[role.semanticKey],
    type: 0,
    allow: forumProfile.permissionMask(role.allow),
    deny: forumProfile.permissionMask(role.deny),
  }));
}

function exactChannels() {
  return boardRegistry.boards.map((board) => {
    const resolvedBoard = board.id === "socials-os-active-admission" ? { ...board, forumChannelId: "socials-forum" } : board;
    const expected = forumProfile.expectedBoardProfile(resolvedBoard, profileRegistry);
    return {
      id: resolvedBoard.forumChannelId,
      guild_id: boardRegistry.guildId,
      name: expected.structure.name,
      topic: expected.structure.topic,
      parent_id: expected.structure.parentChannelId,
      type: expected.structure.type,
      position: expected.structure.order + 7,
      available_tags: expected.tags.map((tag, index) => ({
        id: `${board.id}-tag-${index}`,
        name: tag.name,
        moderated: tag.moderated,
        emoji_id: tag.emojiId,
        emoji_name: tag.emojiName,
      })),
      permission_overwrites: permissionOverwrites(),
      default_reaction_emoji: null,
      default_sort_order: null,
      default_forum_layout: 0,
      rate_limit_per_user: 0,
      flags: 0,
      nsfw: false,
    };
  });
}

function consistency(rows = []) {
  return {
    ok: true,
    status: "consistent",
    inventorySource: "registry",
    coverageStatus: "complete",
    registeredBoardCount: 13,
    enabledBoardCount: 13,
    uncoveredBoardCount: 0,
    cardCount: rows.filter((row) => !row.superseded).length,
    healthyCardCount: rows.filter((row) => !row.superseded && row.ok).length,
    driftedCardCount: rows.filter((row) => !row.ok).length,
    supersededRecordCount: rows.filter((row) => row.superseded).length,
    duplicates: [],
    actionableTextIntegrityFindingCount: 0,
    immutableSystemHistoryFindingCount: 0,
    driftCounts: {},
    rows,
    reasonCodes: [],
  };
}

function scanOptions(channels = exactChannels(), roles = guildRoles, cardConsistency = consistency()) {
  return { channels, guildRoles: roles, consistency: cardConsistency };
}

test("canonical forum profile validates the 13-board and 17-tag denominator", () => {
  const result = forumProfile.validateProfileRegistry(profileRegistry, boardRegistry);
  assert.equal(result.ok, true);
  assert.equal(result.boardCount, 13);
  assert.equal(result.tagCount, 17);
  assert.equal(profileRegistry.tagTaxonomy.maxAppliedTags, 5);
});

test("profile validation rejects mojibake without embedding non-ASCII source text", () => {
  const corrupt = structuredClone(profileRegistry);
  corrupt.boards["atlas-active-admission"].topic = "Broken \u00c3\u0192\u00c2\u00a2 title";
  const result = forumProfile.validateProfileRegistry(corrupt, boardRegistry);
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("forum_profile_text_integrity_failed"));
});

test("invalid profiles produce a durable blocked scan instead of reading live state", async () => {
  const invalid = structuredClone(profileRegistry);
  invalid.forumProfiles["project-active-v1"].permissionProfile = "unknown-profile";
  let networkCalls = 0;
  const { receipt } = await forumProfile.buildLiveForumProfileScan({
    boardRegistry,
    profileRegistry: invalid,
    fetchImpl: async () => { networkCalls += 1; throw new Error("unexpected network"); },
  });
  assert.equal(receipt.status, "blocked");
  assert.equal(receipt.profileValidation.ok, false);
  assert.equal(receipt.denominator.coverageStatus, "blocked");
  assert.equal(networkCalls, 0);
});

test("read-only scanner proves an exact profile and redacts live role ids", async () => {
  const { receipt } = await forumProfile.buildLiveForumProfileScan({
    boardRegistry,
    profileRegistry,
    ...scanOptions(),
    now: () => new Date("2026-07-15T12:00:00.000Z"),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "consistent");
  assert.equal(receipt.denominator.coverageStatus, "complete");
  assert.equal(receipt.forums.length, 13);
  assert.equal(receipt.forums.every((forum) => forum.tags.expectedCount === 17), true);
  const rendered = JSON.stringify(receipt);
  assert.equal(rendered.includes(roleIds.verified), false);
  assert.equal(rendered.includes(roleIds.fawx_security), false);
});

test("scanner reports ordered tag drift and orphan applied-tag ambiguity", async () => {
  const channels = exactChannels();
  channels[0].available_tags = [];
  const row = {
    ok: true,
    boardId: boardRegistry.boards[0].id,
    boardRole: "legacy",
    threadId: "legacy-thread",
    cardId: null,
    state: null,
    archived: true,
    locked: false,
    superseded: false,
    appliedTagIds: ["orphan-tag"],
    journalPresent: false,
    starterContentSha256: null,
    journalIntegrityEntries: [],
    reasonCodes: [],
  };
  const { receipt } = await forumProfile.buildLiveForumProfileScan({
    boardRegistry,
    profileRegistry,
    ...scanOptions(channels, guildRoles, consistency([row])),
  });
  assert.equal(receipt.status, "drift_detected");
  assert(receipt.reasonCodes.some((code) => code.startsWith("forum_tag_order_or_definition_mismatch:")));
  assert(receipt.reasonCodes.includes("orphan_tag_ambiguity:legacy-general-feedback"));
  assert.deepEqual(receipt.cards.boardProfiles[0].appliedTagSafety.orphanAppliedTagIds, ["orphan-tag"]);
});

test("applied-tag comparison is semantic-set based and fails every unsafe shape", () => {
  const tags = new Map([
    ["feature", { name: "Feature" }],
    ["feature-copy", { name: "Feature" }],
    ["blocked", { name: "Blocked" }],
    ["high", { name: "High" }],
    ["ready", { name: "Ready" }],
    ["low", { name: "Low" }],
    ["bug", { name: "Bug" }],
    ["custom", { name: "Custom" }],
  ]);
  const row = { threadId: "managed", cardId: "DOS-1", type: "feature", state: "blocked", priority: "high" };
  const inspect = (appliedTagIds, maxAppliedTags = 5) => forumProfile.inspectAppliedTagSemantics({ row: { ...row, appliedTagIds }, availableTagById: tags, maxAppliedTags });
  assert.equal(inspect(["high", "feature", "blocked"]).exact, true);

  const duplicate = inspect(["feature", "feature-copy", "blocked", "high"]);
  assert.equal(duplicate.exact, false);
  assert.deepEqual(duplicate.duplicateNames, ["Feature"]);

  const missing = inspect(["feature", "blocked"]);
  assert.equal(missing.exact, false);
  assert.deepEqual(missing.missingNames, ["High"]);

  const extra = inspect(["feature", "blocked", "ready", "high"]);
  assert.equal(extra.exact, false);
  assert.deepEqual(extra.extraNames, ["Ready"]);

  const unknown = inspect(["feature", "blocked", "high", "custom"]);
  assert.equal(unknown.exact, false);
  assert.deepEqual(unknown.unknownNames, ["Custom"]);

  const orphan = inspect(["feature", "blocked", "high", "missing-id"]);
  assert.equal(orphan.exact, false);
  assert.deepEqual(orphan.orphanAppliedTagIds, ["missing-id"]);

  const overLimit = inspect(["feature", "blocked", "high", "ready", "low", "bug"]);
  assert.equal(overLimit.exact, false);
  assert.equal(overLimit.overLimit, true);
});

test("scanner CLI requires a durable output receipt", () => {
  assert.throws(() => scanCli.parseArgs([]), /output_path_missing/);
  const options = scanCli.parseArgs(["--output", "tmp/profile-scan.json", "--json"]);
  assert.equal(options.outputPath, path.resolve("tmp/profile-scan.json"));
  assert.equal(options.json, true);
});

test("normalization is dry-run by default and separates legacy card migration", async () => {
  const channels = exactChannels();
  channels[0].topic = "drifted topic";
  let networkCalls = 0;
  const receipt = await normalization.buildForumProfileNormalization({
    boardRegistry,
    profileRegistry,
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    fetchImpl: async () => { networkCalls += 1; throw new Error("unexpected network"); },
    scanOptions: scanOptions(channels),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "dry_run_ready");
  assert.equal(receipt.apply, false);
  assert.equal(receipt.mutatesDiscord, false);
  assert.equal(receipt.plan.actionCount, 1);
  assert.equal(receipt.plan.scope.legacyCardMigration, "separate_packet_required");
  assert.equal(networkCalls, 0);
});

test("an exact profile produces an idempotent zero-action plan", async () => {
  const receipt = await normalization.buildForumProfileNormalization({
    boardRegistry,
    profileRegistry,
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    scanOptions: scanOptions(),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "dry_run_ready");
  assert.equal(receipt.plan.actionCount, 0);
  assert.equal(receipt.plan.unchangedCount, 13);
});

test("apply requires both guards before scanning or writing", async () => {
  let scanned = false;
  const receipt = await normalization.buildForumProfileNormalization({
    boardRegistry,
    profileRegistry,
    apply: true,
    allowNormalization: true,
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    scanImpl: async () => { scanned = true; throw new Error("should not scan"); },
  });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.status, "blocked");
  assert(receipt.reasonCodes.includes("forum_profile_normalization_double_guard_missing"));
  assert.equal(scanned, false);
});

test("guarded apply patches once and performs exact 13-board readback", async () => {
  const channels = exactChannels();
  channels[0].topic = "drifted topic";
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const channelId = url.match(/\/channels\/([^/?]+)$/)?.[1];
    const method = init.method || "GET";
    calls.push({ method, channelId });
    if (!channelId || !channelById.has(channelId)) return { ok: false, status: 404, json: async () => ({}) };
    if (method === "PATCH") {
      const payload = JSON.parse(init.body);
      channelById.set(channelId, { ...channelById.get(channelId), ...payload });
    }
    return { ok: true, status: 200, json: async () => structuredClone(channelById.get(channelId)) };
  };
  const receipt = await normalization.buildForumProfileNormalization({
    boardRegistry,
    profileRegistry,
    allowNormalization: true,
    apply: true,
    env: {
      DISCORDOS_BOT_TOKEN: "test-token",
      [NORMALIZATION_ENV]: NORMALIZATION_ENV_VALUE,
    },
    fetchImpl,
    scanOptions: scanOptions(channels),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "normalized");
  assert.equal(receipt.writes.length, 1);
  assert.equal(receipt.readback.ok, true);
  assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
  assert.equal(calls.filter((call) => call.method === "GET").length, 13);
});

test("unknown required roles fail closed", async () => {
  const roles = guildRoles.filter((role) => role.name !== "Verified");
  const receipt = await normalization.buildForumProfileNormalization({
    boardRegistry,
    profileRegistry,
    env: { DISCORDOS_BOT_TOKEN: "test-token" },
    scanOptions: scanOptions(exactChannels(), roles),
  });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.status, "blocked");
  assert(receipt.reasonCodes.includes("permission_role_unknown:verified"));
});

test("stale ids, uncovered boards, orphan ambiguity, and incomplete readback all fail closed", async () => {
  const cases = [];
  const staleChannels = exactChannels();
  staleChannels[0].name = "wrong-forum";
  cases.push({ expected: "stale_forum_identity:legacy-general-feedback", options: scanOptions(staleChannels) });

  const uncoveredChannels = exactChannels();
  uncoveredChannels.push({
    id: "uncovered-forum",
    name: "uncovered",
    type: 15,
    parent_id: profileRegistry.category.channelId,
  });
  cases.push({ expected: "uncovered_live_board:uncovered-forum", options: scanOptions(uncoveredChannels) });

  const orphanRow = {
    ok: true,
    boardId: "legacy-general-feedback",
    threadId: "legacy-thread",
    cardId: null,
    archived: true,
    locked: false,
    superseded: false,
    appliedTagIds: ["unknown-applied-tag"],
    reasonCodes: [],
  };
  cases.push({ expected: "orphan_tag_ambiguity:legacy-general-feedback", options: scanOptions(exactChannels(), guildRoles, consistency([orphanRow])) });

  const incomplete = consistency();
  incomplete.status = "blocked";
  incomplete.coverageStatus = "not_evaluated";
  cases.push({ expected: "live_card_readback_incomplete", options: scanOptions(exactChannels(), guildRoles, incomplete) });

  for (const candidate of cases) {
    const receipt = await normalization.buildForumProfileNormalization({
      boardRegistry,
      profileRegistry,
      env: { DISCORDOS_BOT_TOKEN: "test-token" },
      scanOptions: candidate.options,
    });
    assert.equal(receipt.ok, false, candidate.expected);
    assert.equal(receipt.status, "blocked", candidate.expected);
    assert(receipt.reasonCodes.includes(candidate.expected), candidate.expected);
    assert.equal(receipt.writes.length, 0, candidate.expected);
  }
});

test("normalization CLI is output-backed and dry-run unless apply is explicit", () => {
  assert.throws(() => normalization.parseArgs([]), /output_path_missing/);
  const options = normalization.parseArgs(["--output", "tmp/normalize.json", "--allow-normalization", "--json"]);
  assert.equal(options.apply, false);
  assert.equal(options.allowNormalization, true);
  assert.equal(options.json, true);
});
