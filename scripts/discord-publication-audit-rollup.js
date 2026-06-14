const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const DEFAULT_DOCS_DIR = path.resolve(process.cwd(), "docs", "ops");
const execFileAsync = promisify(execFile);

function parseArgs(args) {
  const options = {
    json: false,
    docsDir: DEFAULT_DOCS_DIR,
    gitStatus: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-git-status") {
      options.gitStatus = false;
    } else if (arg === "--docs-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_docs_dir_value");
      }
      options.docsDir = path.resolve(value.trim());
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function normalizeMarkdown(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function toDisplayPath(filePath, cwd = process.cwd()) {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}

async function readGitTrackedFiles({ docsDir, cwd = process.cwd(), execFileImpl = execFileAsync } = {}) {
  const docsArg = toDisplayPath(path.resolve(docsDir), cwd) || ".";
  try {
    const { stdout } = await execFileImpl("git", ["ls-files", "--", docsArg], { cwd });
    return new Set(
      String(stdout || "")
        .split(/\r?\n/)
        .map((entry) => entry.trim().replace(/\\/g, "/"))
        .filter(Boolean)
    );
  } catch (_error) {
    return null;
  }
}

function extractFirstHeading(markdown) {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown);
  return match ? match[1].trim() : null;
}

function hasHeading(markdown, heading) {
  const expected = String(heading || "").trim().toLowerCase();
  return normalizeMarkdown(markdown)
    .split("\n")
    .some((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      return match && match[2].replace(/#+\s*$/, "").trim().toLowerCase() === expected;
    });
}

function extractReceiptBlock(markdown) {
  const normalized = normalizeMarkdown(markdown);
  const startIndex = normalized.indexOf(updatePostInternals.RECEIPT_BLOCK_START);
  const endIndex = normalized.indexOf(updatePostInternals.RECEIPT_BLOCK_END);

  if (startIndex === -1 && endIndex === -1) {
    return null;
  }
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return {
      valid: false,
      block: null,
      reasonCodes: ["publication_receipt_block_malformed"],
    };
  }

  return {
    valid: true,
    block: normalized.slice(startIndex, endIndex + updatePostInternals.RECEIPT_BLOCK_END.length),
    reasonCodes: [],
  };
}

function extractReceiptField(block, label) {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp("^- " + escapedLabel + ":\\s+`([^`]*)`\\s*$", "im").exec(block);
  return match ? match[1].trim() : null;
}

function extractPublicationMetadata(receiptBlock) {
  if (!receiptBlock?.valid) {
    return null;
  }

  return {
    status: extractReceiptField(receiptBlock.block, "status"),
    sendsMessages: extractReceiptField(receiptBlock.block, "sends messages"),
    httpStatus: extractReceiptField(receiptBlock.block, "Discord HTTP status"),
    channelId: extractReceiptField(receiptBlock.block, "channel id"),
    messageId: extractReceiptField(receiptBlock.block, "message id"),
    timestamp: extractReceiptField(receiptBlock.block, "timestamp"),
    mentionsDisabled: extractReceiptField(receiptBlock.block, "mentions disabled"),
  };
}

function isKnownPublicationReceipt(markdown, fileName) {
  const normalized = normalizeMarkdown(markdown);
  return fileName.includes("discordos-updates")
    || fileName.includes("publication")
    || fileName.includes("update-post")
    || normalized.includes(updatePostInternals.RECEIPT_BLOCK_START)
    || hasHeading(normalized, "Update Post")
    || hasHeading(normalized, "Discord Publication");
}

function hasLiveSendEvidence(markdown, fileName) {
  const normalized = normalizeMarkdown(markdown);
  const lowerFileName = fileName.toLowerCase();
  return lowerFileName.includes("publication-live-post")
    || /published to\s+`#updates`/i.test(normalized)
    || /status:\s+`sent`/i.test(normalized)
    || /sends messages:\s+`true`/i.test(normalized);
}

function missingDurablePublicationMetadata(metadata) {
  if (!metadata) {
    return ["publication_receipt_missing"];
  }

  const missing = [];
  for (const [key, reasonCode] of [
    ["status", "publication_status_missing"],
    ["messageId", "publication_message_id_missing"],
    ["channelId", "publication_channel_id_missing"],
    ["timestamp", "publication_timestamp_missing"],
  ]) {
    if (!metadata[key] || metadata[key] === "unknown") {
      missing.push(reasonCode);
    }
  }
  return missing;
}

function classifyPublicationReceipt({ filePath, markdown, cwd = process.cwd() }) {
  const normalized = normalizeMarkdown(markdown);
  const displayPath = toDisplayPath(filePath, cwd);
  const fileName = path.basename(filePath).toLowerCase();
  const firstHeading = extractFirstHeading(normalized);
  const receiptBlock = extractReceiptBlock(normalized);
  const hasUpdatePost = hasHeading(normalized, "Update Post");
  const publicationRelated = isKnownPublicationReceipt(normalized, fileName);

  if (!publicationRelated) {
    return {
      category: "ignored",
      path: displayPath,
      title: firstHeading,
      reasonCodes: [],
    };
  }

  if (receiptBlock && !receiptBlock.valid) {
    return {
      category: "needs_backfill",
      path: displayPath,
      title: firstHeading,
      reasonCodes: receiptBlock.reasonCodes,
    };
  }

  const metadata = extractPublicationMetadata(receiptBlock);
  if (metadata) {
    const allFieldsMissing = Object.values(metadata).every((value) => value === null);
    if (allFieldsMissing && !hasLiveSendEvidence(normalized, fileName)) {
      return {
        category: "publication_proof_only",
        path: displayPath,
        title: firstHeading,
        reasonCodes: [],
      };
    }

    const missing = missingDurablePublicationMetadata(metadata);
    return {
      category: missing.length === 0 ? "published" : "needs_backfill",
      path: displayPath,
      title: firstHeading,
      metadata,
      reasonCodes: missing,
    };
  }

  if (hasLiveSendEvidence(normalized, fileName)) {
    return {
      category: "needs_backfill",
      path: displayPath,
      title: firstHeading,
      reasonCodes: ["publication_receipt_backfill_needed"],
    };
  }

  if (hasUpdatePost) {
    return {
      category: "draft_update_receipt",
      path: displayPath,
      title: firstHeading,
      reasonCodes: ["update_post_section_without_publication_receipt"],
    };
  }

  return {
    category: "publication_proof_only",
    path: displayPath,
    title: firstHeading,
    reasonCodes: [],
  };
}

function classifyPublicationAuditEvent(result) {
  return {
    type: result.ok
      ? "discordos.publication.audit_ready"
      : "discordos.publication.audit_backfill_needed",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.publication.audit",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      auditedFiles: result.counts.auditedFiles,
      publishedReceipts: result.counts.publishedReceipts,
      draftUpdateReceipts: result.counts.draftUpdateReceipts,
      publicationProofOnly: result.counts.publicationProofOnly,
      needsBackfill: result.counts.needsBackfill,
      untrackedPublicationReceipts: result.counts.untrackedPublicationReceipts,
    },
  };
}

function applyGitTrackedState(records, trackedFiles) {
  if (!trackedFiles) {
    return records.map((record) => ({
      ...record,
      gitTracked: null,
    }));
  }

  return records.map((record) => ({
    ...record,
    gitTracked: record.category === "ignored" ? null : trackedFiles.has(record.path),
  }));
}

function summarizePublicationAudit({ docsDir, cwd = process.cwd(), records, trackedFiles = null }) {
  const annotatedRecords = applyGitTrackedState(records, trackedFiles);
  const published = annotatedRecords.filter((record) => record.category === "published");
  const drafts = annotatedRecords.filter((record) => record.category === "draft_update_receipt");
  const proofOnly = annotatedRecords.filter((record) => record.category === "publication_proof_only");
  const needsBackfill = annotatedRecords.filter((record) => record.category === "needs_backfill");
  const auditedRecords = annotatedRecords.filter((record) => record.category !== "ignored");
  const untrackedPublicationReceipts = auditedRecords.filter((record) => record.gitTracked === false);
  const reasonCodes = [
    ...new Set([
      ...needsBackfill.flatMap((record) => record.reasonCodes),
      ...(untrackedPublicationReceipts.length > 0 ? ["publication_receipt_untracked"] : []),
    ]),
  ];
  const status = needsBackfill.length > 0
    ? "backfill_needed"
    : untrackedPublicationReceipts.length > 0
      ? "ready_with_untracked_receipts"
      : "ready";
  const result = {
    ok: needsBackfill.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    docsDir: toDisplayPath(docsDir, cwd),
    status,
    counts: {
      scannedFiles: annotatedRecords.length,
      auditedFiles: auditedRecords.length,
      publishedReceipts: published.length,
      draftUpdateReceipts: drafts.length,
      publicationProofOnly: proofOnly.length,
      needsBackfill: needsBackfill.length,
      untrackedPublicationReceipts: untrackedPublicationReceipts.length,
    },
    published,
    drafts,
    proofOnly,
    needsBackfill,
    untrackedPublicationReceipts,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyPublicationAuditEvent(result),
  };
}

async function buildDiscordPublicationAuditRollup({
  docsDir = DEFAULT_DOCS_DIR,
  cwd = process.cwd(),
  gitStatus = true,
} = {}) {
  const resolvedDocsDir = path.resolve(docsDir);
  const files = await listMarkdownFiles(resolvedDocsDir);
  const records = [];

  for (const filePath of files) {
    const markdown = await fs.readFile(filePath, "utf8");
    records.push(classifyPublicationReceipt({
      filePath,
      markdown,
      cwd,
    }));
  }
  const trackedFiles = gitStatus
    ? await readGitTrackedFiles({ docsDir: resolvedDocsDir, cwd })
    : null;

  return summarizePublicationAudit({
    docsDir: resolvedDocsDir,
    cwd,
    records,
    trackedFiles,
  });
}

function renderRecordList(records, emptyText) {
  if (records.length === 0) {
    return [`- ${emptyText}`];
  }

  return records.map((record) => {
    const suffix = record.metadata?.messageId
      ? ` message id \`${record.metadata.messageId}\``
      : "";
    const reasons = record.reasonCodes?.length
      ? ` reason codes \`${record.reasonCodes.join(",")}\``
      : "";
    return `- \`${record.path}\`${suffix}${reasons}`;
  });
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Publication Audit Rollup",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- docs dir: \`${result.docsDir}\``,
    `- scanned files: \`${result.counts.scannedFiles}\``,
    `- audited files: \`${result.counts.auditedFiles}\``,
    `- published receipts: \`${result.counts.publishedReceipts}\``,
    `- draft update receipts: \`${result.counts.draftUpdateReceipts}\``,
    `- publication proof only: \`${result.counts.publicationProofOnly}\``,
    `- needs backfill: \`${result.counts.needsBackfill}\``,
    `- untracked publication receipts: \`${result.counts.untrackedPublicationReceipts}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    `- event type: \`${result.event.type}\``,
    "",
    "## Published Receipts",
    "",
    ...renderRecordList(result.published, "none"),
    "",
    "## Draft Update Receipts",
    "",
    ...renderRecordList(result.drafts, "none"),
    "",
    "## Needs Backfill",
    "",
    ...renderRecordList(result.needsBackfill, "none"),
    "",
    "## Untracked Publication Receipts",
    "",
    ...renderRecordList(result.untrackedPublicationReceipts, "none"),
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordPublicationAuditRollup(options);
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
    DEFAULT_DOCS_DIR,
    parseArgs,
    normalizeMarkdown,
    listMarkdownFiles,
    toDisplayPath,
    readGitTrackedFiles,
    extractFirstHeading,
    hasHeading,
    extractReceiptBlock,
    extractReceiptField,
    extractPublicationMetadata,
    isKnownPublicationReceipt,
    hasLiveSendEvidence,
    missingDurablePublicationMetadata,
    classifyPublicationReceipt,
    classifyPublicationAuditEvent,
    applyGitTrackedState,
    summarizePublicationAudit,
    buildDiscordPublicationAuditRollup,
    renderMarkdown,
  },
};
