#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const process = require("node:process");
const { spawn } = require("node:child_process");
const os = require("node:os");

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

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      continue;
    }

    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    values[name] = value
      .replace(/\\r/g, "\r")
      .replace(/\\n/g, "\n");
  }

  return values;
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

async function runWithProductionEnv(commandArgs, dependencies = {}) {
  if (commandArgs.length === 0) {
    throw new Error("with-production-env requires one command after the wrapper.");
  }

  const {
    repoRoot = REPO_ROOT,
    fsImpl = fs,
    tmpDir = os.tmpdir()
  } = dependencies;
  const executeCommand = dependencies.runCommand || runCommand;
  await pruneGeneratedState({
    ...dependencies,
    repoRoot,
    generatedStateDirs: [".vercel"]
  });

  let commandExitCode = 1;
  let cleanupError = null;
  let tempDir = null;

  try {
    await materializeVercelLink({ ...dependencies, repoRoot });
    tempDir = await fsImpl.mkdtemp(path.join(tmpDir, "discordos-production-env-"));
    const envFilePath = path.join(tempDir, ".env.production.local");
    const pullExitCode = await executeCommand({
      ...dependencies,
      command: "vercel",
      args: ["env", "pull", envFilePath, "--environment=production", "--yes"],
      cwd: repoRoot,
      runCommand: undefined
    });

    if (pullExitCode !== 0) {
      return pullExitCode;
    }

    const envValues = parseEnvFile(await fsImpl.readFile(envFilePath, "utf8"));
    const [command, ...args] = commandArgs;
    commandExitCode = await executeCommand({
      ...dependencies,
      command,
      args,
      cwd: repoRoot,
      env: {
        ...process.env,
        ...envValues
      },
      runCommand: undefined
    });
  } finally {
    try {
      if (tempDir) {
        await fsImpl.rm(tempDir, { recursive: true, force: true });
      }
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

  if (subcommand === "with-production-env") {
    return await runWithProductionEnv(stripCommandSeparator(rest));
  }

  throw new Error("Supported repo-hygiene commands: cleanup, verify, with-vercel-link, with-production-env.");
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
  parseEnvFile,
  runVerifyWorkflow,
  runWithVercelLink,
  runWithProductionEnv,
  stripCommandSeparator
};

module.exports = {
  _internals,
  pruneGeneratedState,
  loadVercelLinkConfig,
  materializeVercelLink,
  runVerifyWorkflow,
  runWithVercelLink,
  runWithProductionEnv
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
