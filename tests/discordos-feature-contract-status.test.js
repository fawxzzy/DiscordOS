const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-feature-contract-status");

async function writeFile(dir, fileName, text) {
  const filePath = path.join(dir, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
}

test("feature contract status args default to moderation", () => {
  const parsed = _internals.parseArgs([]);

  assert.equal(parsed.json, false);
  assert.equal(parsed.feature, "moderation");
});

test("feature contract status supports board feature", () => {
  const parsed = _internals.parseArgs(["--json", "--feature", "board"]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.feature, "board");
});

test("feature contract status passes for moderation fixture", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-feature-moderation-"));
  const config = _internals.FEATURE_CONFIG.moderation;
  await writeFile(dir, "docs/contracts/discordos-moderation-workflow-v0.md", config.docsAnchors.join("\n"));
  await writeFile(
    dir,
    "src/contracts/moderation.ts",
    [
      ...config.sourceExports.map((name) => `export interface ${name} { value: string; }`),
      ...config.sourceTokens,
    ].join("\n")
  );
  const packageJsonPath = await writeFile(dir, "package.json", JSON.stringify({ scripts: {} }));

  const originalDocs = config.docsFile;
  const originalSource = config.sourceFile;
  config.docsFile = path.join(dir, "docs/contracts/discordos-moderation-workflow-v0.md");
  config.sourceFile = path.join(dir, "src/contracts/moderation.ts");
  try {
    const result = await _internals.buildDiscordOSFeatureContractStatus({
      feature: "moderation",
      packageJsonPath,
    });

    assert.equal(result.ok, true);
    assert.equal(result.event.type, "discordos.feature_contract.ready");
  } finally {
    config.docsFile = originalDocs;
    config.sourceFile = originalSource;
  }
});

test("feature contract status requires board publication scripts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-feature-board-"));
  const config = _internals.FEATURE_CONFIG.board;
  await writeFile(dir, "docs/contracts/discordos-board-card-workflow-v0.md", config.docsAnchors.join("\n"));
  await writeFile(
    dir,
    "src/contracts/board.ts",
    [
      ...config.sourceExports.map((name) => `export interface ${name} { value: string; }`),
      ...config.sourceTokens,
    ].join("\n")
  );
  const packageJsonPath = await writeFile(dir, "package.json", JSON.stringify({
    scripts: {
      "ops:discord:forum-card-lifecycle": "node fixture.js",
    },
  }));

  const originalDocs = config.docsFile;
  const originalSource = config.sourceFile;
  config.docsFile = path.join(dir, "docs/contracts/discordos-board-card-workflow-v0.md");
  config.sourceFile = path.join(dir, "src/contracts/board.ts");
  try {
    const result = await _internals.buildDiscordOSFeatureContractStatus({
      feature: "board",
      packageJsonPath,
    });

    assert.equal(result.ok, false);
    assert(result.reasonCodes.includes("feature_contract_package_script_missing"));
    assert(result.packageScripts.missing.includes("ops:discord:forum-card-preflight"));
  } finally {
    config.docsFile = originalDocs;
    config.sourceFile = originalSource;
  }
});

test("feature contract status blocks runtime tokens", () => {
  const result = _internals.classifyRuntimeFreeSource("process.env.DISCORDOS_BOT_TOKEN");

  assert.equal(result.ok, false);
  assert.deepEqual(result.banned, ["process.env"]);
});

test("feature contract status renders bounded output", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    feature: "board",
    label: "DiscordOS Board Card Workflow v0",
    status: "ready",
    event: { type: "discordos.feature_contract.ready" },
    docs: { ok: true },
    sourceExports: { ok: true },
    sourceTokens: { ok: true },
    runtimeFree: { ok: true },
    packageScripts: { ok: true },
    reasonCodes: [],
  });

  assert(rendered.includes("# DiscordOS Feature Contract Status"));
  assert(rendered.includes("feature: `board`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
