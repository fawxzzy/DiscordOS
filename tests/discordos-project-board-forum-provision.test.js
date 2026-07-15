const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  _internals,
} = require("../scripts/discordos-project-board-forum-provision");

const registry = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "config", "discordos-board-registry.json"), "utf8"));
const preAdmissionRegistry = structuredClone(registry);
for (const board of preAdmissionRegistry.boards.filter((candidate) => candidate.id.endsWith("-active-admission"))) {
  board.forumChannelId = null;
  board.forumChannelName = null;
  board.status = "blocked";
  board.sourceAdapter = "unadmitted-v1";
}
const category = { id: _internals.DEFAULT_CATEGORY_ID, name: "project-feedback-boards", type: 4, parent_id: null };
const env = {
  DISCORDOS_BOT_TOKEN: "test-token",
  DISCORDOS_GUILD_ID: registry.guildId,
  DISCORDOS_PROJECT_FEEDBACK_CATEGORY_CHANNEL_ID: _internals.DEFAULT_CATEGORY_ID,
  [_internals.PROVISION_ENV]: _internals.PROVISION_ENV_VALUE,
};

function response(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return payload; } };
}

function makeFetch(initialChannels = [category]) {
  const channels = structuredClone(initialChannels);
  const calls = [];
  let sequence = 0;
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    if (!url.endsWith(`/guilds/${registry.guildId}/channels`)) return response({}, { ok: false, status: 404 });
    if (method === "GET") return response(structuredClone(channels));
    if (method === "POST") {
      sequence += 1;
      const body = JSON.parse(init.body);
      const channel = { id: `forum-${sequence}`, ...body };
      channels.push(channel);
      return response(structuredClone(channel), { status: 201 });
    }
    return response({}, { ok: false, status: 405 });
  };
  return { fetchImpl, channels, calls };
}

function registryFs(value = preAdmissionRegistry) {
  return { async readFile() { return JSON.stringify(value); } };
}

function admittedChannels({ includeSocials = true } = {}) {
  return registry.boards
    .filter((board) => board.id.endsWith("-active-admission"))
    .filter((board) => includeSocials || board.id !== "socials-os-active-admission")
    .map((board) => ({ id: board.forumChannelId || "socials-forum", name: board.forumChannelName, type: 15, parent_id: category.id }));
}

test("canonical registry selects the eight admitted project forums including Socials OS", () => {
  const targets = _internals.selectProvisionTargets(registry);
  assert.equal(targets.length, 8);
  assert.deepEqual(targets.map((target) => target.forumName).sort(), [
    "atlas", "cortex", "discordos", "foundation", "lifeline", "playbook", "socials-os", "stack",
  ]);
});

test("dry run reuses seven admitted forums and plans Socials OS without posting", async () => {
  const mock = makeFetch([category, ...admittedChannels({ includeSocials: false })]);
  const result = await _internals.buildProjectBoardForumProvision({ env, fetchImpl: mock.fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, "dry_run_ready");
  assert.equal(result.plannedCreateCount, 1);
  assert.equal(result.reusedCount, 7);
  assert.equal(result.createdCount, 0);
  assert.equal(result.readback, null);
  assert.equal(mock.calls.filter((call) => call.method === "POST").length, 0);
});

test("apply creates every missing forum and proves exact readback", async () => {
  const mock = makeFetch();
  const result = await _internals.buildProjectBoardForumProvision({
    env,
    allowProvision: true,
    apply: true,
    fetchImpl: mock.fetchImpl,
    fsImpl: registryFs(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "provisioned");
  assert.equal(result.createdCount, 8);
  assert.equal(result.reusedCount, 0);
  assert.equal(result.readback.ok, true);
  assert.equal(result.readback.rows.length, 8);
  assert.equal(mock.calls.filter((call) => call.method === "POST").length, 8);
  assert.ok(mock.calls.filter((call) => call.method === "POST").every((call) => call.body.type === 15 && call.body.parent_id === category.id));
});

test("apply retry reuses all exact admitted forums and performs no writes", async () => {
  const mock = makeFetch([category, ...admittedChannels()]);
  const result = await _internals.buildProjectBoardForumProvision({
    env,
    allowProvision: true,
    apply: true,
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.createdCount, 0);
  assert.equal(result.reusedCount, 8);
  assert.equal(result.readback.ok, true);
  assert.equal(mock.calls.filter((call) => call.method === "POST").length, 0);
});

test("name collision blocks the entire batch before mutation", async () => {
  const mock = makeFetch([category, { id: "wrong-atlas", name: "atlas", type: 0, parent_id: category.id }]);
  const result = await _internals.buildProjectBoardForumProvision({
    env,
    allowProvision: true,
    apply: true,
    fetchImpl: mock.fetchImpl,
    fsImpl: registryFs(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes("project_board_forum_name_conflict"));
  assert.equal(mock.calls.filter((call) => call.method === "POST").length, 0);
});

test("apply requires both the CLI and environment guards", async () => {
  const mock = makeFetch();
  const result = await _internals.buildProjectBoardForumProvision({
    env: { ...env, [_internals.PROVISION_ENV]: undefined },
    allowProvision: true,
    apply: true,
    fetchImpl: mock.fetchImpl,
    fsImpl: registryFs(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes("project_board_forum_provision_double_guard_missing"));
  assert.equal(mock.calls.length, 0);
});

test("invalid category blocks before any create", async () => {
  const mock = makeFetch([{ ...category, type: 0 }]);
  const result = await _internals.buildProjectBoardForumProvision({
    env,
    allowProvision: true,
    apply: true,
    fetchImpl: mock.fetchImpl,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes("project_feedback_category_invalid"));
  assert.equal(mock.calls.filter((call) => call.method === "POST").length, 0);
});

test("network rejection fails closed with stable reason codes", async () => {
  const result = await _internals.buildProjectBoardForumProvision({
    env,
    fetchImpl: async () => { throw new Error("sensitive transport detail"); },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, [
    "guild_channels_fetch_failed",
    "discord_request_failed",
    "project_feedback_category_invalid",
  ]);
  assert.equal(JSON.stringify(result).includes("sensitive transport detail"), false);
});

test("output argument resolves a durable receipt path", () => {
  const options = _internals.parseArgs(["--json", "--output", "tmp/provision.json"]);
  assert.equal(options.json, true);
  assert.equal(options.outputPath, path.resolve("tmp/provision.json"));
});
