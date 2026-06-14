const fs = require("node:fs/promises");
const path = require("node:path");

const FEATURE_CONFIG = {
  moderation: {
    label: "DiscordOS Moderation Workflow v0",
    docsFile: path.resolve(process.cwd(), "docs", "contracts", "discordos-moderation-workflow-v0.md"),
    sourceFile: path.resolve(process.cwd(), "src", "contracts", "moderation.ts"),
    packageScripts: [],
    docsAnchors: [
      "## Scope",
      "## Case Identity",
      "## Case State",
      "## Action Contract",
      "## Event Envelope",
      "## Forbidden Behaviors",
    ],
    sourceExports: [
      "DiscordOSModerationCaseStatus",
      "DiscordOSModerationActionType",
      "DiscordOSModerationCaseIdentity",
      "DiscordOSModerationCaseState",
      "DiscordOSModerationAction",
      "DiscordOSModerationContract",
      "DiscordOSModerationEventEnvelope",
    ],
    sourceTokens: [
      "domain: \"moderation\"",
      "DiscordOSDataProofContract",
    ],
  },
  board: {
    label: "DiscordOS Board Card Workflow v0",
    docsFile: path.resolve(process.cwd(), "docs", "contracts", "discordos-board-card-workflow-v0.md"),
    sourceFile: path.resolve(process.cwd(), "src", "contracts", "board.ts"),
    packageScripts: [
      "ops:discord:forum-card-lifecycle",
      "ops:discord:forum-card-preflight",
      "ops:discord:forum-card-release-check",
    ],
    docsAnchors: [
      "## Scope",
      "## Card Identity",
      "## Card State",
      "## Transition Contract",
      "## Publication Boundary",
      "## Forbidden Behaviors",
    ],
    sourceExports: [
      "DiscordOSBoardCardKind",
      "DiscordOSBoardCardState",
      "DiscordOSBoardCardIdentity",
      "DiscordOSBoardCardTransition",
      "DiscordOSBoardCardContract",
      "DiscordOSBoardCardEventEnvelope",
    ],
    sourceTokens: [
      "domain: \"board\"",
      "DiscordOSDataProofContract",
    ],
  },
  music_sesh: {
    label: "DiscordOS Music Sesh Workflow v0",
    docsFile: path.resolve(process.cwd(), "docs", "contracts", "discordos-music-sesh-workflow-v0.md"),
    sourceFile: path.resolve(process.cwd(), "src", "contracts", "music-sesh.ts"),
    packageScripts: [],
    docsAnchors: [
      "## Scope",
      "## Session Identity",
      "## Queue Item",
      "## Vote Contract",
      "## Event Envelope",
      "## Forbidden Behaviors",
    ],
    sourceExports: [
      "DiscordOSMusicSeshSessionStatus",
      "DiscordOSMusicSeshQueueItemStatus",
      "DiscordOSMusicSeshSessionIdentity",
      "DiscordOSMusicSeshQueueItem",
      "DiscordOSMusicSeshVote",
      "DiscordOSMusicSeshContract",
      "DiscordOSMusicSeshEventEnvelope",
    ],
    sourceTokens: [
      "domain: \"music_sesh\"",
      "DiscordOSDataProofContract",
    ],
  },
};

const BANNED_RUNTIME_TOKENS = [
  "process.env",
  "fetch(",
  "@supabase/",
  "discord.js",
  "new Client",
];

function parseArgs(args) {
  const options = {
    json: false,
    feature: "moderation",
    packageJsonPath: path.resolve(process.cwd(), "package.json"),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--feature") {
      const value = args[index + 1];
      if (!FEATURE_CONFIG[value]) {
        throw new Error(`unsupported_feature:${value || "missing"}`);
      }
      options.feature = value;
      index += 1;
    } else if (arg === "--package-json") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_package_json_value");
      }
      options.packageJsonPath = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function readText(filePath, missingReasonCode, fsImpl = fs) {
  try {
    return {
      ok: true,
      text: await fsImpl.readFile(filePath, "utf8"),
      reasonCodes: [],
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ok: false,
        text: "",
        reasonCodes: [missingReasonCode],
      };
    }
    throw error;
  }
}

function classifyTextPresence(text, required, missingReasonCode) {
  const present = required.filter((anchor) => text.includes(anchor));
  const missing = required.filter((anchor) => !present.includes(anchor));
  return {
    ok: missing.length === 0,
    present,
    missing,
    reasonCodes: missing.length === 0 ? [] : [missingReasonCode],
  };
}

function classifyRuntimeFreeSource(sourceText) {
  const banned = BANNED_RUNTIME_TOKENS.filter((token) => sourceText.includes(token));
  return {
    ok: banned.length === 0,
    banned,
    reasonCodes: banned.length === 0 ? [] : ["feature_contract_runtime_token_present"],
  };
}

function classifyPackageScripts(packageJsonText, requiredScripts) {
  if (requiredScripts.length === 0) {
    return {
      ok: true,
      present: [],
      missing: [],
      reasonCodes: [],
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch (_error) {
    return {
      ok: false,
      present: [],
      missing: requiredScripts,
      reasonCodes: ["package_json_invalid"],
    };
  }

  const scripts = parsed && typeof parsed.scripts === "object" && parsed.scripts
    ? parsed.scripts
    : {};
  const present = requiredScripts.filter((scriptName) =>
    typeof scripts[scriptName] === "string" && scripts[scriptName].trim().length > 0
  );
  const missing = requiredScripts.filter((scriptName) => !present.includes(scriptName));
  return {
    ok: missing.length === 0,
    present,
    missing,
    reasonCodes: missing.length === 0 ? [] : ["feature_contract_package_script_missing"],
  };
}

function classifyFeatureContractEvent(result) {
  return {
    type: result.ok
      ? "discordos.feature_contract.ready"
      : "discordos.feature_contract.blocked",
    severity: result.ok ? "info" : "warning",
    subject: `discordos.feature_contract.${result.feature}`,
    status: result.ok ? "pass" : "fail",
    dimensions: {
      feature: result.feature,
      missingDocsAnchorCount: result.docs.missing.length,
      missingSourceExportCount: result.sourceExports.missing.length,
      missingSourceTokenCount: result.sourceTokens.missing.length,
      missingPackageScriptCount: result.packageScripts.missing.length,
      runtimeTokenCount: result.runtimeFree.banned.length,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordOSFeatureContractStatus({
  feature = "moderation",
  packageJsonPath = path.resolve(process.cwd(), "package.json"),
  fsImpl = fs,
} = {}) {
  const config = FEATURE_CONFIG[feature];
  if (!config) {
    throw new Error(`unsupported_feature:${feature}`);
  }

  const docsRead = await readText(config.docsFile, "feature_contract_docs_missing", fsImpl);
  const sourceRead = await readText(config.sourceFile, "feature_contract_source_missing", fsImpl);
  const packageRead = await readText(packageJsonPath, "package_json_missing", fsImpl);
  const docs = docsRead.ok
    ? classifyTextPresence(docsRead.text, config.docsAnchors, "feature_contract_docs_anchor_missing")
    : {
      ok: false,
      present: [],
      missing: config.docsAnchors,
      reasonCodes: docsRead.reasonCodes,
    };
  const sourceExports = sourceRead.ok
    ? classifyTextPresence(sourceRead.text, config.sourceExports, "feature_contract_source_export_missing")
    : {
      ok: false,
      present: [],
      missing: config.sourceExports,
      reasonCodes: sourceRead.reasonCodes,
    };
  const sourceTokens = sourceRead.ok
    ? classifyTextPresence(sourceRead.text, config.sourceTokens, "feature_contract_source_token_missing")
    : {
      ok: false,
      present: [],
      missing: config.sourceTokens,
      reasonCodes: sourceRead.reasonCodes,
    };
  const runtimeFree = sourceRead.ok
    ? classifyRuntimeFreeSource(sourceRead.text)
    : {
      ok: false,
      banned: [],
      reasonCodes: sourceRead.reasonCodes,
    };
  const packageScripts = packageRead.ok
    ? classifyPackageScripts(packageRead.text, config.packageScripts)
    : {
      ok: false,
      present: [],
      missing: config.packageScripts,
      reasonCodes: packageRead.reasonCodes,
    };
  const reasonCodes = [
    ...new Set([
      ...docs.reasonCodes,
      ...sourceExports.reasonCodes,
      ...sourceTokens.reasonCodes,
      ...runtimeFree.reasonCodes,
      ...packageScripts.reasonCodes,
    ]),
  ];
  const result = {
    ok: docs.ok && sourceExports.ok && sourceTokens.ok && runtimeFree.ok && packageScripts.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    feature,
    label: config.label,
    docs,
    sourceExports,
    sourceTokens,
    runtimeFree,
    packageScripts,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyFeatureContractEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Feature Contract Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- feature: \`${result.feature}\``,
    `- label: \`${result.label}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- docs anchors: \`${result.docs.ok ? "ready" : "blocked"}\``,
    `- source exports: \`${result.sourceExports.ok ? "ready" : "blocked"}\``,
    `- source tokens: \`${result.sourceTokens.ok ? "ready" : "blocked"}\``,
    `- runtime-free source: \`${result.runtimeFree.ok ? "ready" : "blocked"}\``,
    `- package scripts: \`${result.packageScripts.ok ? "ready" : "blocked"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordOSFeatureContractStatus(options);
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
    FEATURE_CONFIG,
    BANNED_RUNTIME_TOKENS,
    parseArgs,
    readText,
    classifyTextPresence,
    classifyRuntimeFreeSource,
    classifyPackageScripts,
    classifyFeatureContractEvent,
    buildDiscordOSFeatureContractStatus,
    renderMarkdown,
  },
};
