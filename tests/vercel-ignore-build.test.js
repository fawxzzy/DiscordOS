const assert = require("assert/strict");
const path = require("path");
const test = require("node:test");

const { _internals } = require("../scripts/vercel-ignore-build");

test("vercel ignore build skips docs-only changes", () => {
  const result = _internals.classifyDeployment({
    changedFiles: [
      "docs/ops/example-proof.md",
      "README.md",
    ],
    runtimeFiles: new Set([
      "api/runtime-health.js",
      "scripts/discordos-computa-runtime.js",
      "package.json",
      "vercel.json",
    ]),
  });

  assert.equal(result.shouldSkip, true);
  assert.deepEqual(result.runtimeRelevant, []);
});

test("vercel ignore build continues for api changes", () => {
  const result = _internals.classifyDeployment({
    changedFiles: ["api/runtime-health.js"],
    runtimeFiles: new Set(["api/runtime-health.js"]),
  });

  assert.equal(result.shouldSkip, false);
  assert.deepEqual(result.runtimeRelevant, ["api/runtime-health.js"]);
});

test("vercel ignore build skips non-runtime scripts when they are outside the api dependency graph", () => {
  const result = _internals.classifyDeployment({
    changedFiles: [
      "scripts/discordos-operator-env-readiness.js",
      "tests/discordos-operator-env-readiness.test.js",
    ],
    runtimeFiles: new Set([
      "api/discord-interactions.js",
      "scripts/discordos-computa-runtime.js",
    ]),
  });

  assert.equal(result.shouldSkip, true);
  assert.deepEqual(result.runtimeRelevant, []);
});

test("vercel ignore build continues for runtime-linked scripts", () => {
  const result = _internals.classifyDeployment({
    changedFiles: ["scripts/discordos-computa-runtime.js"],
    runtimeFiles: new Set([
      "api/discord-interactions.js",
      "scripts/discordos-computa-runtime.js",
    ]),
  });

  assert.equal(result.shouldSkip, false);
  assert.deepEqual(result.runtimeRelevant, ["scripts/discordos-computa-runtime.js"]);
});

test("collectRuntimeFiles follows relative requires from api entrypoints", () => {
  const normalize = (target) => path.normalize(target);
  const fileMap = new Map([
    [normalize("repo/api/discord-interactions.js"), 'const helper = require("../scripts/runtime-helper");\n'],
    [normalize("repo/scripts/runtime-helper.js"), 'module.exports = require("../config/runtime.json");\n'],
    [normalize("repo/config/runtime.json"), '{"ok":true}\n'],
    [normalize("repo/package.json"), "{}\n"],
    [normalize("repo/vercel.json"), "{}\n"],
  ]);

  const directories = new Map([
    [normalize("repo/api"), [{ name: "discord-interactions.js", isDirectory: () => false, isFile: () => true }]],
  ]);

  const fsImpl = {
    existsSync(target) {
      const normalized = normalize(target);
      return fileMap.has(normalized) || directories.has(normalized);
    },
    statSync(target) {
      const normalized = normalize(target);
      return {
        isFile: () => fileMap.has(normalized),
        isDirectory: () => directories.has(normalized),
      };
    },
    readdirSync(target) {
      return directories.get(normalize(target)) || [];
    },
    readFileSync(target) {
      return fileMap.get(normalize(target));
    },
  };

  const runtimeFiles = _internals.collectRuntimeFiles({
    repoRoot: "repo",
    apiDir: "repo/api",
    fsImpl,
  });

  assert.deepEqual(
    [...runtimeFiles].sort(),
    [
      "api/discord-interactions.js",
      "config/runtime.json",
      "package.json",
      "scripts/runtime-helper.js",
      "vercel.json",
    ],
  );
});
