const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-publication-docs-status");

async function writeFile(dir, fileName, text) {
  const filePath = path.join(dir, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
}

test("publication docs status args default to repo paths", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    packageJsonPath: _internals.DEFAULT_PACKAGE_JSON_PATH,
    readmePath: _internals.DEFAULT_README_PATH,
    docsReadmePath: _internals.DEFAULT_DOCS_README_PATH,
  });
});

test("publication docs status validates package scripts and docs anchors", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-publication-docs-"));
  const packageJsonPath = await writeFile(dir, "package.json", JSON.stringify({
    scripts: Object.fromEntries(_internals.REQUIRED_PACKAGE_SCRIPTS.map((scriptName) => [
      scriptName,
      "node fixture.js",
    ])),
  }));
  const readmePath = await writeFile(
    dir,
    "README.md",
    _internals.REQUIRED_README_ANCHORS.join("\n")
  );
  const docsReadmePath = await writeFile(
    dir,
    "docs/README.md",
    _internals.REQUIRED_DOCS_README_ANCHORS.join("\n")
  );

  const result = await _internals.buildDiscordPublicationDocsStatus({
    packageJsonPath,
    readmePath,
    docsReadmePath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.event.type, "discordos.publication.docs_ready");
});

test("publication docs status blocks missing command and docs anchors", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-publication-docs-missing-"));
  const packageJsonPath = await writeFile(dir, "package.json", JSON.stringify({
    scripts: {
      "ops:discord:update-post": "node fixture.js",
    },
  }));
  const readmePath = await writeFile(dir, "README.md", "scripts/discord-update-post.js\n");
  const docsReadmePath = await writeFile(dir, "docs/README.md", "publication\n");

  const result = await _internals.buildDiscordPublicationDocsStatus({
    packageJsonPath,
    readmePath,
    docsReadmePath,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert(result.packageScripts.missing.includes("ops:discord:update-preflight"));
  assert(result.readme.missing.includes("scripts/discord-publication-status.js"));
  assert(result.reasonCodes.includes("publication_package_scripts_missing"));
  assert(result.reasonCodes.includes("publication_readme_anchor_missing"));
});

test("publication docs status renders without secret-like values", async () => {
  const result = {
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    event: { type: "discordos.publication.docs_ready" },
    packageScripts: { status: "ready", missing: [] },
    readme: { status: "ready", missing: [] },
    docsReadme: { status: "ready", missing: [] },
    reasonCodes: [],
  };

  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Publication Docs Status"));
  assert(rendered.includes("package scripts: `ready`"));
  assert(!rendered.includes("DISCORDOS_BOT_TOKEN="));
});
