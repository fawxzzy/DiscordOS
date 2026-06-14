const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_DOCS_FILE = path.resolve(process.cwd(), "docs", "contracts", "discordos-data-runtime.md");
const DEFAULT_SOURCE_FILE = path.resolve(process.cwd(), "src", "contracts", "data.ts");

const REQUIRED_DOC_ANCHORS = [
  "## Scope",
  "## Domains",
  "## Contract Identity",
  "## Field Contract",
  "## Proof Contract",
  "## Event Envelope",
  "## Forbidden Behaviors",
];

const REQUIRED_SOURCE_EXPORTS = [
  "DiscordOSDataDomain",
  "DiscordOSDataOwner",
  "DiscordOSDataLifecycle",
  "DiscordOSDataStorageSurface",
  "DiscordOSDataProofStrength",
  "DiscordOSDataContractIdentity",
  "DiscordOSDataFieldContract",
  "DiscordOSDataProofContract",
  "DiscordOSDataContract",
  "DiscordOSDataEventEnvelope",
  "DiscordOSDataContractRegistry",
];

const REQUIRED_DOMAINS = [
  "feedback",
  "publication",
  "moderation",
  "music_sesh",
  "board",
  "operator",
];

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
    docsFile: DEFAULT_DOCS_FILE,
    sourceFile: DEFAULT_SOURCE_FILE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--docs-file") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_docs_file_value");
      }
      options.docsFile = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--source-file") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_source_file_value");
      }
      options.sourceFile = path.resolve(value.trim());
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

function classifyRequiredText({ text, required, missingReasonCode }) {
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
    reasonCodes: banned.length === 0 ? [] : ["data_contract_runtime_token_present"],
  };
}

function classifyDataContractEvent(result) {
  return {
    type: result.ok
      ? "discordos.data_contract.ready"
      : "discordos.data_contract.blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.data_contract",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      missingDocAnchorCount: result.docs.missing.length,
      missingSourceExportCount: result.sourceExports.missing.length,
      missingDomainCount: result.domains.missing.length,
      runtimeTokenCount: result.runtimeFree.banned.length,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordOSDataContractStatus({
  docsFile = DEFAULT_DOCS_FILE,
  sourceFile = DEFAULT_SOURCE_FILE,
  fsImpl = fs,
} = {}) {
  const docsRead = await readText(docsFile, "data_contract_docs_missing", fsImpl);
  const sourceRead = await readText(sourceFile, "data_contract_source_missing", fsImpl);
  const docs = docsRead.ok
    ? classifyRequiredText({
      text: docsRead.text,
      required: REQUIRED_DOC_ANCHORS,
      missingReasonCode: "data_contract_docs_anchor_missing",
    })
    : {
      ok: false,
      present: [],
      missing: REQUIRED_DOC_ANCHORS,
      reasonCodes: docsRead.reasonCodes,
    };
  const sourceExports = sourceRead.ok
    ? classifyRequiredText({
      text: sourceRead.text,
      required: REQUIRED_SOURCE_EXPORTS,
      missingReasonCode: "data_contract_source_export_missing",
    })
    : {
      ok: false,
      present: [],
      missing: REQUIRED_SOURCE_EXPORTS,
      reasonCodes: sourceRead.reasonCodes,
    };
  const domains = sourceRead.ok
    ? classifyRequiredText({
      text: sourceRead.text,
      required: REQUIRED_DOMAINS.map((domain) => `"${domain}"`),
      missingReasonCode: "data_contract_domain_missing",
    })
    : {
      ok: false,
      present: [],
      missing: REQUIRED_DOMAINS.map((domain) => `"${domain}"`),
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
      ...sourceExports.reasonCodes,
      ...domains.reasonCodes,
      ...runtimeFree.reasonCodes,
    ]),
  ];
  const result = {
    ok: docs.ok && sourceExports.ok && domains.ok && runtimeFree.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    docs,
    sourceExports,
    domains: {
      ...domains,
      required: REQUIRED_DOMAINS,
    },
    runtimeFree,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyDataContractEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Data Contract Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- docs anchors: \`${result.docs.ok ? "ready" : "blocked"}\``,
    `- source exports: \`${result.sourceExports.ok ? "ready" : "blocked"}\``,
    `- domains: \`${result.domains.ok ? "ready" : "blocked"}\``,
    `- runtime-free source: \`${result.runtimeFree.ok ? "ready" : "blocked"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.docs.missing.length > 0) {
    lines.push(`- missing docs anchors: \`${result.docs.missing.join(",")}\``);
  }
  if (result.sourceExports.missing.length > 0) {
    lines.push(`- missing source exports: \`${result.sourceExports.missing.join(",")}\``);
  }
  if (result.domains.missing.length > 0) {
    lines.push(`- missing domains: \`${result.domains.missing.join(",")}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordOSDataContractStatus(options);
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
    REQUIRED_SOURCE_EXPORTS,
    REQUIRED_DOMAINS,
    BANNED_RUNTIME_TOKENS,
    parseArgs,
    readText,
    classifyRequiredText,
    classifyRuntimeFreeSource,
    classifyDataContractEvent,
    buildDiscordOSDataContractStatus,
    renderMarkdown,
  },
};
