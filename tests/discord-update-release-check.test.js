const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-release-check");
const {
  _internals: updatePostInternals,
} = require("../scripts/discord-update-post");

const UPDATES_CHANNEL_ID = "1504671871512346695";

function validDraftMarkdown() {
  return [
    "# DiscordOS Example Update - 2026-06-13",
    "",
    "## Update Post",
    "",
    "DiscordOS example hardening is ready.",
    "",
    "What changed:",
    "",
    "- added a release check",
    "",
    "Proof:",
    "",
    "- runtime posture: `operational`",
    "",
    "Current production state:",
    "",
    "- production alias: `https://fawxzzy-discordos.vercel.app`",
    "",
    "Verification:",
    "",
    "- `npm run verify` passes",
    "",
    "## Durable Receipts",
    "",
    "- `docs/ops/discordos-example-pass-1-2026-06-13.md`",
  ].join("\n");
}

function message({
  id = "1516000000000000000",
  title = "DiscordOS Example Ready",
} = {}) {
  return {
    id,
    channel_id: UPDATES_CHANNEL_ID,
    timestamp: "2026-06-13T20:00:00.000000+00:00",
    embeds: [
      {
        title,
      },
    ],
  };
}

async function writeDraft(markdown) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-release-check-"));
  await fs.mkdir(path.join(dir, "docs", "ops"), { recursive: true });
  await fs.writeFile(path.join(dir, "docs", "ops", "draft.md"), markdown, "utf8");
  return dir;
}

async function writeMarkerBoard(markdown = [
  "# Lanes And Markers",
  "",
  "## Active Front-Page Marker Table",
  "",
  "- AI Long-Run Batch Orchestration: `49%`",
].join("\n")) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-release-markers-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

function liveFetch({ duplicate = false } = {}) {
  return async (url, init) => {
    assert.equal(init.method, "GET");
    assert.equal(init.headers.Authorization, "Bot bot-secret");
    if (url === `${updatePostInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}`) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "updates",
          type: 5,
        }),
      };
    }
    assert.equal(
      url,
      `${updatePostInternals.DISCORD_API_BASE}/channels/${UPDATES_CHANNEL_ID}/messages?limit=${_internals.DEFAULT_LIMIT}`
    );
    return {
      ok: true,
      status: 200,
      json: async () => duplicate ? [message()] : [message({ title: "Older Update" })],
    };
  };
}

test("discord update release check args default to update post release check", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    title: null,
    bodyFile: null,
    bodySection: _internals.DEFAULT_BODY_SECTION,
    markers: [],
    limit: _internals.DEFAULT_LIMIT,
  });
});

test("discord update release check parses title body file section limit and json", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--title",
      "DiscordOS Example Ready",
      "--body-file",
      "docs/ops/draft.md",
      "--body-section",
      "Update Post",
      "--marker",
      "AI Long-Run Batch Orchestration",
      "--limit",
      "10",
    ]),
    {
      json: true,
      title: "DiscordOS Example Ready",
      bodyFile: "docs/ops/draft.md",
      bodySection: "Update Post",
      markers: ["AI Long-Run Batch Orchestration"],
      limit: 10,
    }
  );
});

test("discord update release check passes when draft and live preflight pass", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordUpdateReleaseCheck({
    title: "DiscordOS Example Ready",
    bodyFile: "docs/ops/draft.md",
    markers: ["AI Long-Run Batch Orchestration"],
    markerFilePath,
    cwd: await writeDraft(validDraftMarkdown()),
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: liveFetch(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.readyForApply, true);
  assert.equal(result.status, "ready_for_apply");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.draft.status, "ready");
  assert.equal(result.preflight.status, "ready");
  assert.equal(result.preflight.duplicateCheck.status, "not_found");
  assert.equal(result.event.type, "discordos.updates.release_check_ready");
  assert(result.nextCommand.includes("npm run ops:discord:update-post"));
  assert(result.nextCommand.includes('--marker "AI Long-Run Batch Orchestration"'));
});

test("discord update release check blocks duplicate live title without sending", async () => {
  const result = await _internals.buildDiscordUpdateReleaseCheck({
    title: "DiscordOS Example Ready",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(validDraftMarkdown()),
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: liveFetch({ duplicate: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.readyForApply, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.sendsMessages, false);
  assert.equal(result.preflight.duplicateCheck.status, "duplicate_found");
  assert.deepEqual(result.reasonCodes, ["updates_duplicate_title_found"]);
  assert.equal(result.nextCommand, null);
});

test("discord update release check skips live preflight when draft validation fails", async () => {
  const result = await _internals.buildDiscordUpdateReleaseCheck({
    title: "DiscordOS Example Ready",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(validDraftMarkdown().replace("Proof:", "Evidence:")),
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: async () => {
      throw new Error("fetch_should_not_run");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.draft.status, "blocked");
  assert.equal(result.preflight.status, "skipped");
  assert.deepEqual(result.preflight.reasonCodes, ["draft_validation_failed"]);
  assert(result.reasonCodes.includes("missing_public_body_anchor:proof_"));
});

test("discord update release check renders markdown without full body or token values", async () => {
  const result = await _internals.buildDiscordUpdateReleaseCheck({
    title: "DiscordOS Example Ready",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(validDraftMarkdown()),
    env: {
      DISCORDOS_UPDATES_CHANNEL_ID: UPDATES_CHANNEL_ID,
      DISCORDOS_BOT_TOKEN: "bot-secret",
    },
    fetchImpl: liveFetch(),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Update Release Check"));
  assert(rendered.includes("ready for apply: `true`"));
  assert(rendered.includes("duplicate check status: `not_found`"));
  assert(!rendered.includes("added a release check"));
  assert(!rendered.includes("bot-secret"));
});
