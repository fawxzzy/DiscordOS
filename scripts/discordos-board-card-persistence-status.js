const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_DOCS_FILE = path.resolve(process.cwd(), "docs", "contracts", "discordos-board-card-persistence-v0.md");
const DEFAULT_SOURCE_FILE = path.resolve(process.cwd(), "src", "contracts", "board.ts");

const REQUIRED_DOC_ANCHORS = [
  "## Scope",
  "## Persistence Identity",
  "## Storage Boundary",
  "## Required Indexes",
  "## Forbidden Behaviors",
];

const REQUIRED_SOURCE_TOKENS = [
  "DiscordOSBoardCardPersistenceStatus",
  "DiscordOSBoardCardPersistenceContract",
  "contract_only",
  "discordos_supabase",
  "idempotencyKeyField: \"cardId\"",
  "retentionClass: \"product_state\"",
];

const BANNED_RUNTIME_TOKENS = [
  "process.env",
  "fetch(",
  "@supabase/",
  "createClient",
];

function parseArgs(args) {
  const options = {
    json: false,
    docsFile: DEFAULT_DOCS_FILE,
    sourceFile: DEFAULT_SOURCE_FILE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--docs-file") {
      options.docsFile = path.resolve(readValue(args, index, "missing_docs_file_value"));
      index += 1;
    } else if (arg === "--source-file") {
      options.sourceFile = path.resolve(readValue(args, index, "missing_source_file_value"));
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
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

function classifyRequiredText(text, required, missingReasonCode) {
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
    reasonCodes: banned.length === 0 ? [] : ["board_card_persistence_runtime_token_present"],
  };
}

function classifyBoardCardPersistenceEvent(result) {
  return {
    type: result.ok
      ? "discordos.board_card.persistence_contract_ready"
      : "discordos.board_card.persistence_contract_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.board_card.persistence",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      missingDocsAnchorCount: result.docs.missing.length,
      missingSourceTokenCount: result.source.missing.length,
      runtimeTokenCount: result.runtimeFree.banned.length,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildBoardCardPersistenceStatus({
  docsFile = DEFAULT_DOCS_FILE,
  sourceFile = DEFAULT_SOURCE_FILE,
  fsImpl = fs,
} = {}) {
  const docsRead = await readText(docsFile, "board_card_persistence_docs_missing", fsImpl);
  const sourceRead = await readText(sourceFile, "board_card_persistence_source_missing", fsImpl);
  const docs = docsRead.ok
    ? classifyRequiredText(docsRead.text, REQUIRED_DOC_ANCHORS, "board_card_persistence_docs_anchor_missing")
    : {
      ok: false,
      present: [],
      missing: REQUIRED_DOC_ANCHORS,
      reasonCodes: docsRead.reasonCodes,
    };
  const source = sourceRead.ok
    ? classifyRequiredText(sourceRead.text, REQUIRED_SOURCE_TOKENS, "board_card_persistence_source_token_missing")
    : {
      ok: false,
      present: [],
      missing: REQUIRED_SOURCE_TOKENS,
      reasonCodes: sourceRead.reasonCodes,
    };
  const runtimeFree = sourceRead.ok
    ? classifyRuntimeFreeSource(sourceRead.text)
    : {
      ok: false,
      banned: [],
      reasonCodes: sourceRead.reasonCodes,
    };
  const reasonCodes = [
    ...new Set([
      ...docs.reasonCodes,
      ...source.reasonCodes,
      ...runtimeFree.reasonCodes,
    ]),
  ];
  const result = {
    ok: docs.ok && source.ok && runtimeFree.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    persistenceStatus: "contract_only",
    storageWritesAllowed: false,
    schemaMigrationAllowed: false,
    docs,
    source,
    runtimeFree,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyBoardCardPersistenceEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Board Card Persistence Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- persistence status: \`${result.persistenceStatus}\``,
    `- storage writes allowed: \`${result.storageWritesAllowed ? "true" : "false"}\``,
    `- schema migration allowed: \`${result.schemaMigrationAllowed ? "true" : "false"}\``,
    `- event type: \`${result.event.type}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildBoardCardPersistenceStatus(options);
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
    DEFAULT_DOCS_FILE,
    DEFAULT_SOURCE_FILE,
    REQUIRED_DOC_ANCHORS,
    REQUIRED_SOURCE_TOKENS,
    BANNED_RUNTIME_TOKENS,
    parseArgs,
    classifyRequiredText,
    classifyRuntimeFreeSource,
    classifyBoardCardPersistenceEvent,
    buildBoardCardPersistenceStatus,
    renderMarkdown,
  },
};
