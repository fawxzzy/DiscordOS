#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const process = require("node:process");
const { spawn } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const GENERATED_STATE_DIRS = [".vercel", "node_modules"];
const VERCEL_LINK_CONFIG_REF = path.join("config", "vercel.project.json");

function normalizeRelativePath(value) {
  return String(value).replaceAll("\\", "/");
}

function resolveRepoChild(repoRoot, relativePath) {
  const candidate = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Repo hygiene target escapes the repo root: ${relativePath}`);
  }
  return candidate;
}

async function pathExists(targetPath, fsImpl = fs) {
  try {
    await fsImpl.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function pruneGeneratedState({
  repoRoot = REPO_ROOT,
  generatedStateDirs = GENERATED_STATE_DIRS,
  fsImpl = fs
} = {}) {
  const removed = [];

  for (const relativeDir of generatedStateDirs) {
    const absolutePath = resolveRepoChild(repoRoot, relativeDir);
    if (!(await pathExists(absolutePath, fsImpl))) {
      continue;
    }

    await fsImpl.rm(absolutePath, { recursive: true, force: true });
    removed.push(normalizeRelativePath(relativeDir));
  }

  return removed;
}

async function loadVercelLinkConfig({
  repoRoot = REPO_ROOT,
  configRef = VERCEL_LINK_CONFIG_REF,
  fsImpl = fs
} = {}) {
  const configPath = resolveRepoChild(repoRoot, configRef);
  const configText = await fsImpl.readFile(configPath, "utf8");
  const parsed = JSON.parse(configText);

  for (const field of ["projectId", "orgId", "projectName"]) {
    if (typeof parsed[field] !== "string" || parsed[field].trim().length === 0) {
      throw new Error(`Vercel link config is missing ${field}.`);
    }
  }

  return {
    projectId: parsed.projectId.trim(),
    orgId: parsed.orgId.trim(),
    projectName: parsed.projectName.trim()
  };
}

async function materializeVercelLink({
  repoRoot = REPO_ROOT,
  linkConfig,
  fsImpl = fs
} = {}) {
  const effectiveConfig = linkConfig || await loadVercelLinkConfig({ repoRoot, fsImpl });
  const vercelDir = resolveRepoChild(repoRoot, ".vercel");
  const projectJsonPath = path.join(vercelDir, "project.json");
  await fsImpl.mkdir(vercelDir, { recursive: true });
  await fsImpl.writeFile(projectJsonPath, JSON.stringify(effectiveConfig), "utf8");
  return projectJsonPath;
}

function getExecutable(command) {
  if (process.platform === "win32" && command === "npm") {
    return "npm.cmd";
  }

  if (process.platform === "win32" && command === "vercel") {
    return "vercel.cmd";
  }

  return command;
}

async function runCommand({
  command,
  args = [],
  cwd = REPO_ROOT,
  env = process.env,
  spawnImpl = spawn
}) {
  const executable = getExecutable(command);
  return await new Promise((resolve, reject) => {
    const child = spawnImpl(executable, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: process.platform === "win32" && executable.toLowerCase().endsWith(".cmd")
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve(code == null ? 1 : code);
    });
  });
}

async function runVerifyWorkflow(dependencies = {}) {
  const { repoRoot = REPO_ROOT } = dependencies;
  const executeCommand = dependencies.runCommand || runCommand;
  await pruneGeneratedState({ ...dependencies, repoRoot });

  let verifyExitCode = 1;
  let cleanupError = null;

  try {
    verifyExitCode = await executeCommand({
      ...dependencies,
      command: "npm",
      args: ["run", "verify:_inner"],
      cwd: repoRoot,
      runCommand: undefined
    });
  } finally {
    try {
      await pruneGeneratedState({ ...dependencies, repoRoot });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }

  return verifyExitCode;
}

async function runWithVercelLink(commandArgs, dependencies = {}) {
  if (commandArgs.length === 0) {
    throw new Error("with-vercel-link requires one command after the wrapper.");
  }

  const { repoRoot = REPO_ROOT } = dependencies;
  const executeCommand = dependencies.runCommand || runCommand;
  await pruneGeneratedState({
    ...dependencies,
    repoRoot,
    generatedStateDirs: [".vercel"]
  });

  let commandExitCode = 1;
  let cleanupError = null;

  try {
    await materializeVercelLink({ ...dependencies, repoRoot });
    const [command, ...args] = commandArgs;
    commandExitCode = await executeCommand({
      ...dependencies,
      command,
      args,
      cwd: repoRoot,
      runCommand: undefined
    });
  } finally {
    try {
      await pruneGeneratedState({
        ...dependencies,
        repoRoot,
        generatedStateDirs: [".vercel"]
      });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (cleanupError) {
    throw cleanupError;
  }

  return commandExitCode;
}

function stripCommandSeparator(argv) {
  if (argv[0] === "--") {
    return argv.slice(1);
  }

  return argv;
}

async function main(argv) {
  const [subcommand, ...rest] = argv;

  if (subcommand === "cleanup") {
    const removed = await pruneGeneratedState();
    if (removed.length > 0) {
      process.stdout.write(`Removed generated state: ${removed.join(", ")}\n`);
    }
    return 0;
  }

  if (subcommand === "verify") {
    return await runVerifyWorkflow();
  }

  if (subcommand === "with-vercel-link") {
    return await runWithVercelLink(stripCommandSeparator(rest));
  }

  throw new Error("Supported repo-hygiene commands: cleanup, verify, with-vercel-link.");
}

const _internals = {
  GENERATED_STATE_DIRS,
  VERCEL_LINK_CONFIG_REF,
  REPO_ROOT,
  resolveRepoChild,
  pathExists,
  pruneGeneratedState,
  loadVercelLinkConfig,
  materializeVercelLink,
  runCommand,
  runVerifyWorkflow,
  runWithVercelLink,
  stripCommandSeparator
};

module.exports = {
  _internals,
  pruneGeneratedState,
  loadVercelLinkConfig,
  materializeVercelLink,
  runVerifyWorkflow,
  runWithVercelLink
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
}
