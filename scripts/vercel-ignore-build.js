const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(REPO_ROOT, "api");
const ENTRY_CONFIG_FILES = new Set([
  "package.json",
  "package-lock.json",
  "vercel.json",
]);
const NON_RUNTIME_PREFIXES = [
  "docs/",
  "scripts/",
  "tests/",
  "runtime/",
  "tmp/",
  ".github/",
  "packages/",
  "data/",
];
const NON_RUNTIME_SCRIPT_BASENAMES = new Set([
  "README.md",
]);
const LOCAL_IMPORT_PATTERN = /require\((["'])(\.\.?\/[^"']+)\1\)|from\s+(["'])(\.\.?\/[^"']+)\3/g;
const RESOLVE_SUFFIXES = [
  "",
  ".js",
  ".ts",
  ".mjs",
  ".cjs",
  ".json",
  "/index.js",
  "/index.ts",
  "/index.mjs",
  "/index.cjs",
  "/index.json",
];

function normalizeRelativeFile(filePath, repoRoot = REPO_ROOT) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function isNonRuntimeByConvention(relativePath) {
  if (!relativePath) {
    return false;
  }

  if (ENTRY_CONFIG_FILES.has(relativePath)) {
    return false;
  }

  if (NON_RUNTIME_SCRIPT_BASENAMES.has(path.basename(relativePath))) {
    return true;
  }

  if (relativePath.endsWith(".md")) {
    return true;
  }

  if (
    relativePath.startsWith("config/")
    && (relativePath.includes(".example.") || relativePath.includes("-example."))
  ) {
    return true;
  }

  return NON_RUNTIME_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function resolveLocalImport(fromFile, specifier, fsImpl = fs) {
  const basePath = path.isAbsolute(fromFile)
    ? path.resolve(path.dirname(fromFile), specifier)
    : path.normalize(path.join(path.dirname(fromFile), specifier));
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${basePath}${suffix}`;
    if (fsImpl.existsSync(candidate) && fsImpl.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function parseLocalImports(filePath, fsImpl = fs) {
  const source = fsImpl.readFileSync(filePath, "utf8");
  if (typeof source !== "string" && !Buffer.isBuffer(source)) {
    return [];
  }

  const imports = [];
  for (const match of String(source).matchAll(LOCAL_IMPORT_PATTERN)) {
    const specifier = match[2] || match[4];
    if (specifier) {
      imports.push(specifier);
    }
  }
  return imports;
}

function collectRuntimeFiles({
  repoRoot = REPO_ROOT,
  apiDir = API_DIR,
  fsImpl = fs,
} = {}) {
  const runtimeFiles = new Set();
  const queue = [];

  function enqueue(filePath) {
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(repoRoot) || runtimeFiles.has(normalized)) {
      return;
    }
    runtimeFiles.add(normalized);
    queue.push(normalized);
  }

  function walkApi(directory) {
    for (const entry of fsImpl.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walkApi(candidate);
      } else if (entry.isFile()) {
        enqueue(candidate);
      }
    }
  }

  if (fsImpl.existsSync(apiDir)) {
    walkApi(apiDir);
  }

  for (const configFile of ENTRY_CONFIG_FILES) {
    const candidate = path.join(repoRoot, configFile);
    if (fsImpl.existsSync(candidate) && fsImpl.statSync(candidate).isFile()) {
      enqueue(candidate);
    }
  }

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    for (const specifier of parseLocalImports(current, fsImpl)) {
      const resolved = resolveLocalImport(current, specifier, fsImpl);
      if (resolved) {
        enqueue(resolved);
      }
    }
  }

  return new Set([...runtimeFiles].map((filePath) => normalizeRelativeFile(filePath, repoRoot)));
}

function getChangedFiles({
  repoRoot = REPO_ROOT,
  baseSha,
  headSha,
  spawnSyncImpl = spawnSync,
} = {}) {
  const resolvedHead = headSha || "HEAD";
  const resolvedBase = baseSha || `${resolvedHead}^`;
  const result = spawnSyncImpl(
    "git",
    ["diff", "--name-only", resolvedBase, resolvedHead, "--"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    return {
      ok: false,
      reason: "git_diff_failed",
      stderr: result.stderr || "",
      changedFiles: [],
      baseSha: resolvedBase,
      headSha: resolvedHead,
    };
  }

  const changedFiles = String(result.stdout || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\\/g, "/"));

  return {
    ok: true,
    changedFiles,
    baseSha: resolvedBase,
    headSha: resolvedHead,
  };
}

function classifyDeployment({
  changedFiles,
  runtimeFiles,
}) {
  const runtimeRelevant = [];
  const nonRuntime = [];

  for (const relativePath of changedFiles) {
    if (runtimeFiles.has(relativePath)) {
      runtimeRelevant.push(relativePath);
      continue;
    }

    if (isNonRuntimeByConvention(relativePath)) {
      nonRuntime.push(relativePath);
      continue;
    }

    runtimeRelevant.push(relativePath);
  }

  return {
    shouldSkip: changedFiles.length > 0 && runtimeRelevant.length === 0,
    runtimeRelevant,
    nonRuntime,
  };
}

function run({
  env = process.env,
  fsImpl = fs,
  spawnSyncImpl = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const runtimeFiles = collectRuntimeFiles({ fsImpl });
  const diff = getChangedFiles({
    baseSha: env.VERCEL_GIT_PREVIOUS_SHA || undefined,
    headSha: env.VERCEL_GIT_COMMIT_SHA || undefined,
    spawnSyncImpl,
  });

  if (!diff.ok) {
    stdout.write(`[vercel-ignore-build] continuing: ${diff.reason}\n`);
    if (diff.stderr) {
      stderr.write(diff.stderr);
    }
    return {
      exitCode: 1,
      status: "continue",
      reason: diff.reason,
      changedFiles: [],
      runtimeRelevant: [],
      nonRuntime: [],
    };
  }

  if (diff.changedFiles.length === 0) {
    stdout.write("[vercel-ignore-build] continuing: no changed files found\n");
    return {
      exitCode: 1,
      status: "continue",
      reason: "no_changed_files",
      changedFiles: [],
      runtimeRelevant: [],
      nonRuntime: [],
    };
  }

  const classification = classifyDeployment({
    changedFiles: diff.changedFiles,
    runtimeFiles,
  });

  if (classification.shouldSkip) {
    stdout.write(
      `[vercel-ignore-build] skipping build: non-runtime changes only (${classification.nonRuntime.join(", ")})\n`,
    );
    return {
      exitCode: 0,
      status: "skip",
      reason: "non_runtime_changes_only",
      changedFiles: diff.changedFiles,
      runtimeRelevant: [],
      nonRuntime: classification.nonRuntime,
    };
  }

  stdout.write(
    `[vercel-ignore-build] continuing: runtime-relevant changes detected (${classification.runtimeRelevant.join(", ")})\n`,
  );
  return {
    exitCode: 1,
    status: "continue",
    reason: "runtime_relevant_changes_present",
    changedFiles: diff.changedFiles,
    runtimeRelevant: classification.runtimeRelevant,
    nonRuntime: classification.nonRuntime,
  };
}

if (require.main === module) {
  process.exit(run().exitCode);
}

module.exports = {
  _internals: {
    API_DIR,
    REPO_ROOT,
    classifyDeployment,
    collectRuntimeFiles,
    getChangedFiles,
    isNonRuntimeByConvention,
    parseLocalImports,
    resolveLocalImport,
    run,
  },
};
