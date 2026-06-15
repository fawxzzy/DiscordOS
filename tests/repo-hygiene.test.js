const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  _internals
} = require("../scripts/repo-hygiene.js");

async function withTempRepo(callback) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-repo-hygiene-"));

  try {
    await fs.mkdir(path.join(repoRoot, "config"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "config", "vercel.project.json"),
      JSON.stringify({
        projectId: "prj_fixture",
        orgId: "team_fixture",
        projectName: "discordos-fixture"
      }),
      "utf8"
    );
    await callback(repoRoot);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
}

test("pruneGeneratedState removes repo-local .vercel and node_modules only", async () => {
  await withTempRepo(async (repoRoot) => {
    await fs.mkdir(path.join(repoRoot, ".vercel"), { recursive: true });
    await fs.mkdir(path.join(repoRoot, "node_modules", "typescript"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, ".vercel", "project.json"), "{}", "utf8");
    await fs.writeFile(path.join(repoRoot, "node_modules", "typescript", "index.js"), "", "utf8");

    const removed = await _internals.pruneGeneratedState({ repoRoot });

    assert.deepEqual(removed.sort(), [".vercel", "node_modules"]);
    await assert.rejects(fs.access(path.join(repoRoot, ".vercel")));
    await assert.rejects(fs.access(path.join(repoRoot, "node_modules")));
  });
});

test("materializeVercelLink writes disposable project metadata from committed config", async () => {
  await withTempRepo(async (repoRoot) => {
    const projectJsonPath = await _internals.materializeVercelLink({ repoRoot });
    const projectJson = JSON.parse(await fs.readFile(projectJsonPath, "utf8"));

    assert.deepEqual(projectJson, {
      projectId: "prj_fixture",
      orgId: "team_fixture",
      projectName: "discordos-fixture"
    });
  });
});

test("runWithVercelLink materializes metadata for the command and cleans it afterward", async () => {
  await withTempRepo(async (repoRoot) => {
    let sawProjectJson = false;

    const exitCode = await _internals.runWithVercelLink(
      ["node", "-e", "process.exit(0)"],
      {
        repoRoot,
        runCommand: async ({ cwd }) => {
          const projectJsonPath = path.join(cwd, ".vercel", "project.json");
          const projectJson = JSON.parse(await fs.readFile(projectJsonPath, "utf8"));
          sawProjectJson = projectJson.projectId === "prj_fixture";
          return 0;
        }
      }
    );

    assert.equal(exitCode, 0);
    assert.equal(sawProjectJson, true);
    await assert.rejects(fs.access(path.join(repoRoot, ".vercel")));
  });
});

test("runWithVercelLink still cleans .vercel when the wrapped command fails", async () => {
  await withTempRepo(async (repoRoot) => {
    const exitCode = await _internals.runWithVercelLink(
      ["node", "-e", "process.exit(7)"],
      {
        repoRoot,
        runCommand: async () => 7
      }
    );

    assert.equal(exitCode, 7);
    await assert.rejects(fs.access(path.join(repoRoot, ".vercel")));
  });
});

test("parseEnvFile reads simple dotenv values without exposing comments", () => {
  assert.deepEqual(_internals.parseEnvFile([
    "# ignored",
    "PLAIN=value",
    "QUOTED=\"quoted value\"",
    "export ESCAPED=\"line\\nbreak\"",
    "INVALID-NAME=skip",
    "",
  ].join("\n")), {
    PLAIN: "value",
    QUOTED: "quoted value",
    ESCAPED: "line\nbreak",
  });
});

test("parseVerifyInnerSteps expands chained npm run commands", () => {
  assert.deepEqual(
    _internals.parseVerifyInnerSteps("npm run verify:one && npm run verify:two && npm run verify:three"),
    ["verify:one", "verify:two", "verify:three"]
  );
});

test("runVerifyWorkflow executes verify:_inner steps sequentially", async () => {
  await withTempRepo(async (repoRoot) => {
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({
        scripts: {
          "verify:_inner": "npm run verify:one && npm run verify:two && npm run verify:three"
        }
      }),
      "utf8"
    );
    const commands = [];

    const exitCode = await _internals.runVerifyWorkflow({
      repoRoot,
      runCommand: async ({ command, args }) => {
        commands.push([command, ...args].join(" "));
        return 0;
      }
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(commands, [
      "npm run verify:one",
      "npm run verify:two",
      "npm run verify:three",
    ]);
  });
});

test("runWithProductionEnv pulls env into a temp file and cleans it afterward", async () => {
  await withTempRepo(async (repoRoot) => {
    let sawProjectJson = false;
    let sawSecret = false;
    let envFilePath = null;
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-prod-env-test-"));

    try {
      const exitCode = await _internals.runWithProductionEnv(
        ["node", "-e", "process.exit(0)"],
        {
          repoRoot,
          tmpDir: tempRoot,
          runCommand: async ({ command, args, cwd, env }) => {
            if (command === "vercel") {
              const projectJsonPath = path.join(cwd, ".vercel", "project.json");
              const projectJson = JSON.parse(await fs.readFile(projectJsonPath, "utf8"));
              sawProjectJson = projectJson.projectId === "prj_fixture";
              envFilePath = args[2];
              await fs.writeFile(envFilePath, "DISCORDOS_TEST_SECRET=present\n", "utf8");
              return 0;
            }

            sawSecret = env.DISCORDOS_TEST_SECRET === "present";
            return 0;
          },
        }
      );

      assert.equal(exitCode, 0);
      assert.equal(sawProjectJson, true);
      assert.equal(sawSecret, true);
      await assert.rejects(fs.access(path.join(repoRoot, ".vercel")));
      await assert.rejects(fs.access(envFilePath));
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

test("runWithProductionEnv cleans temp state when the wrapped command fails", async () => {
  await withTempRepo(async (repoRoot) => {
    let envFilePath = null;
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-prod-env-test-"));

    try {
      const exitCode = await _internals.runWithProductionEnv(
        ["node", "-e", "process.exit(9)"],
        {
          repoRoot,
          tmpDir: tempRoot,
          runCommand: async ({ command, args }) => {
            if (command === "vercel") {
              envFilePath = args[2];
              await fs.writeFile(envFilePath, "DISCORDOS_TEST_SECRET=present\n", "utf8");
              return 0;
            }

            return 9;
          },
        }
      );

      assert.equal(exitCode, 9);
      await assert.rejects(fs.access(path.join(repoRoot, ".vercel")));
      await assert.rejects(fs.access(envFilePath));
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
