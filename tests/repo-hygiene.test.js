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
