const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-feature-activation-ratchet");

async function writeRegistry(status) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-music-ratchet-"));
  const registryPath = path.join(dir, "registry.json");
  await fs.writeFile(registryPath, JSON.stringify({
    version: 1,
    features: [
      {
        id: "music_sesh",
        label: "Music",
        domain: "music_sesh",
        status,
        docsPath: "docs/contracts/discordos-music-sesh-workflow-v0.md",
        sourcePath: "src/contracts/music-sesh.ts",
        statusCommand: "npm run ops:discordos:music-sesh-status",
        liveBehaviorAdmitted: false,
      },
    ],
  }), "utf8");
  return registryPath;
}

test("music sesh activation ratchet parses registry flag", () => {
  const parsed = _internals.parseArgs(["--json", "--registry", "registry.json"]);

  assert.equal(parsed.json, true);
  assert(parsed.registryPath.endsWith("registry.json"));
});

test("music sesh activation ratchet passes current registry active posture", async () => {
  const result = await _internals.buildMusicSeshFeatureActivationRatchet();

  assert.equal(result.ok, true);
  assert.equal(result.currentStatus, "active");
  assert.equal(result.targetStatus, "active");
  assert.equal(result.liveBehaviorAdmitted, false);
  assert.equal(result.status, "ratchet_applied");
});

test("music sesh activation ratchet blocks preflight-only registry", async () => {
  const registryPath = await writeRegistry("preflight_only");
  const result = await _internals.buildMusicSeshFeatureActivationRatchet({ registryPath });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("music_sesh_not_active_ratcheted"));
});

test("music sesh activation ratchet renders bounded markdown", async () => {
  const result = await _internals.buildMusicSeshFeatureActivationRatchet();
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Music Sesh Feature Activation Ratchet"));
  assert(rendered.includes("current status: `active`"));
});
