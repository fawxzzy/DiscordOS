const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_PACKAGE_JSON_PATH = path.resolve(process.cwd(), "package.json");
const DEFAULT_README_PATH = path.resolve(process.cwd(), "README.md");
const DEFAULT_DOCS_README_PATH = path.resolve(process.cwd(), "docs", "README.md");

const REQUIRED_PACKAGE_SCRIPTS = [
  "ops:discord:update-post",
  "ops:discord:update-preflight",
  "ops:discord:update-release-check",
  "ops:discord:update-draft-validator",
  "ops:discord:update-lookup",
  "ops:discord:publication-status",
  "ops:discord:publication-audit",
  "ops:discord:forum-card-preflight",
  "ops:discord:forum-card-lifecycle",
  "ops:discord:forum-card-release-check",
];

const REQUIRED_README_ANCHORS = [
  "scripts/discord-update-post.js",
  "scripts/discord-update-preflight.js",
  "scripts/discord-update-release-check.js",
  "scripts/discord-update-draft-validator.js",
  "scripts/discord-update-lookup.js",
  "scripts/discord-publication-status.js",
  "scripts/discord-publication-audit-rollup.js",
  "scripts/discord-forum-card-preflight.js",
  "scripts/discord-forum-card-lifecycle.js",
  "scripts/discord-forum-card-release-check.js",
  "marker-aware update commands",
  "Current updates-channel recommendation",
];

const REQUIRED_DOCS_README_ANCHORS = [
  "curated `#updates` publication",
  "publication",
];

function parseArgs(args) {
  const options = {
    json: false,
    packageJsonPath: DEFAULT_PACKAGE_JSON_PATH,
    readmePath: DEFAULT_README_PATH,
    docsReadmePath: DEFAULT_DOCS_README_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--package-json") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_package_json_value");
      }
      options.packageJsonPath = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--readme") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_readme_value");
      }
      options.readmePath = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--docs-readme") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_docs_readme_value");
      }
      options.docsReadmePath = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function readTextIfPresent(filePath, fsImpl = fs) {
  try {
    return {
      present: true,
      text: await fsImpl.readFile(filePath, "utf8"),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        present: false,
        text: "",
      };
    }
    throw error;
  }
}

function classifyPackageScripts(packageJsonText) {
  const reasonCodes = [];
  let parsed = null;

  try {
    parsed = JSON.parse(packageJsonText);
  } catch (_error) {
    return {
      ok: false,
      status: "blocked",
      required: REQUIRED_PACKAGE_SCRIPTS,
      present: [],
      missing: REQUIRED_PACKAGE_SCRIPTS,
      reasonCodes: ["package_json_invalid"],
    };
  }

  const scripts = parsed && typeof parsed.scripts === "object" && parsed.scripts
    ? parsed.scripts
    : {};
  const present = REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) =>
    typeof scripts[scriptName] === "string" && scripts[scriptName].trim().length > 0
  );
  const missing = REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) => !present.includes(scriptName));
  if (missing.length > 0) {
    reasonCodes.push("publication_package_scripts_missing");
  }

  return {
    ok: missing.length === 0,
    status: missing.length === 0 ? "ready" : "blocked",
    required: REQUIRED_PACKAGE_SCRIPTS,
    present,
    missing,
    reasonCodes,
  };
}

function classifyAnchorCoverage({ text, requiredAnchors, missingReasonCode }) {
  const present = requiredAnchors.filter((anchor) => text.includes(anchor));
  const missing = requiredAnchors.filter((anchor) => !present.includes(anchor));
  return {
    ok: missing.length === 0,
    status: missing.length === 0 ? "ready" : "blocked",
    required: requiredAnchors,
    present,
    missing,
    reasonCodes: missing.length === 0 ? [] : [missingReasonCode],
  };
}

function classifyPublicationDocsEvent(result) {
  return {
    type: result.ok
      ? "discordos.publication.docs_ready"
      : "discordos.publication.docs_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.publication.docs",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      packageScriptMissingCount: result.packageScripts.missing.length,
      readmeMissingCount: result.readme.missing.length,
      docsReadmeMissingCount: result.docsReadme.missing.length,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordPublicationDocsStatus({
  packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
  readmePath = DEFAULT_README_PATH,
  docsReadmePath = DEFAULT_DOCS_README_PATH,
  fsImpl = fs,
} = {}) {
  const packageJson = await readTextIfPresent(packageJsonPath, fsImpl);
  const readme = await readTextIfPresent(readmePath, fsImpl);
  const docsReadme = await readTextIfPresent(docsReadmePath, fsImpl);

  const packageScripts = packageJson.present
    ? classifyPackageScripts(packageJson.text)
    : {
      ok: false,
      status: "blocked",
      required: REQUIRED_PACKAGE_SCRIPTS,
      present: [],
      missing: REQUIRED_PACKAGE_SCRIPTS,
      reasonCodes: ["package_json_missing"],
    };
  const readmeCoverage = readme.present
    ? classifyAnchorCoverage({
      text: readme.text,
      requiredAnchors: REQUIRED_README_ANCHORS,
      missingReasonCode: "publication_readme_anchor_missing",
    })
    : {
      ok: false,
      status: "blocked",
      required: REQUIRED_README_ANCHORS,
      present: [],
      missing: REQUIRED_README_ANCHORS,
      reasonCodes: ["readme_missing"],
    };
  const docsReadmeCoverage = docsReadme.present
    ? classifyAnchorCoverage({
      text: docsReadme.text,
      requiredAnchors: REQUIRED_DOCS_README_ANCHORS,
      missingReasonCode: "publication_docs_readme_anchor_missing",
    })
    : {
      ok: false,
      status: "blocked",
      required: REQUIRED_DOCS_README_ANCHORS,
      present: [],
      missing: REQUIRED_DOCS_README_ANCHORS,
      reasonCodes: ["docs_readme_missing"],
    };
  const reasonCodes = [
    ...new Set([
      ...packageScripts.reasonCodes,
      ...readmeCoverage.reasonCodes,
      ...docsReadmeCoverage.reasonCodes,
    ]),
  ];
  const result = {
    ok: packageScripts.ok && readmeCoverage.ok && docsReadmeCoverage.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    packageScripts,
    readme: readmeCoverage,
    docsReadme: docsReadmeCoverage,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyPublicationDocsEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Publication Docs Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- package scripts: \`${result.packageScripts.status}\``,
    `- README anchors: \`${result.readme.status}\``,
    `- docs README anchors: \`${result.docsReadme.status}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.packageScripts.missing.length > 0) {
    lines.push(`- missing package scripts: \`${result.packageScripts.missing.join(",")}\``);
  }
  if (result.readme.missing.length > 0) {
    lines.push(`- missing README anchors: \`${result.readme.missing.join(",")}\``);
  }
  if (result.docsReadme.missing.length > 0) {
    lines.push(`- missing docs README anchors: \`${result.docsReadme.missing.join(",")}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordPublicationDocsStatus(options);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  _internals: {
    DEFAULT_PACKAGE_JSON_PATH,
    DEFAULT_README_PATH,
    DEFAULT_DOCS_README_PATH,
    REQUIRED_PACKAGE_SCRIPTS,
    REQUIRED_README_ANCHORS,
    REQUIRED_DOCS_README_ANCHORS,
    parseArgs,
    readTextIfPresent,
    classifyPackageScripts,
    classifyAnchorCoverage,
    classifyPublicationDocsEvent,
    buildDiscordPublicationDocsStatus,
    renderMarkdown,
  },
};
