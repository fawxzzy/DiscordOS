const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-publication-audit-rollup");
const { _internals: updatePostInternals } = require("../scripts/discord-update-post");

function receiptBlock({
  status = "sent",
  messageId = "1515396583846445097",
  channelId = "1504671871512346695",
  timestamp = "2026-06-13T16:45:00.296000+00:00",
} = {}) {
  return [
    updatePostInternals.RECEIPT_BLOCK_START,
    "## Discord Publication",
    "",
    `- status: \`${status}\``,
    "- sends messages: `true`",
    "- Discord HTTP status: `200`",
    `- channel id: \`${channelId}\``,
    `- message id: \`${messageId}\``,
    `- timestamp: \`${timestamp}\``,
    "- mentions disabled: `true`",
    updatePostInternals.RECEIPT_BLOCK_END,
  ].join("\n");
}

async function writeFile(dir, fileName, body) {
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, body, "utf8");
  return filePath;
}

test("publication audit args default to docs ops read-only rollup", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    docsDir: _internals.DEFAULT_DOCS_DIR,
    gitStatus: true,
  });
  assert.deepEqual(_internals.parseArgs(["--json", "--no-git-status", "--docs-dir", "tmp/docs"]), {
    json: true,
    docsDir: path.resolve("tmp/docs"),
    gitStatus: false,
  });
});

test("publication audit extracts bounded publication metadata", () => {
  const metadata = _internals.extractPublicationMetadata(_internals.extractReceiptBlock(receiptBlock()));

  assert.deepEqual(metadata, {
    status: "sent",
    sendsMessages: "true",
    httpStatus: "200",
    channelId: "1504671871512346695",
    messageId: "1515396583846445097",
    timestamp: "2026-06-13T16:45:00.296000+00:00",
    mentionsDisabled: "true",
  });
});

test("publication audit extracts pass numbers from receipt-like paths", () => {
  assert.equal(
    _internals.extractPassNumberFromPath("docs/ops/discordos-updates-publication-live-post-pass-35.md"),
    35
  );
  assert.equal(
    _internals.extractPassNumberFromPath("docs/ops/discordos-forum-card-preflight-convergence-pass-98-2026-06-14.md"),
    98
  );
  assert.equal(_internals.extractPassNumberFromPath("docs/ops/no-pass-here.md"), null);
});

test("publication audit classifies published, draft, proof-only, and backfill records", async () => {
  const docsDir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-publication-audit-"));
  await writeFile(docsDir, "discordos-updates-publication-live-post-pass-35.md", [
    "# Published",
    "",
    "Published to `#updates`.",
    "",
    receiptBlock(),
  ].join("\n"));
  await writeFile(docsDir, "discordos-runtime-product-hardening-closeout-update-post.md", [
    "# Closeout Draft",
    "",
    "## Update Post",
    "",
    "Draft public update body.",
  ].join("\n"));
  await writeFile(docsDir, "discordos-publication-status-pass-44.md", [
    "# Publication Status",
    "",
    "This proof checks the publication toolchain.",
  ].join("\n"));
  await writeFile(docsDir, "discordos-updates-live-post-missing-receipt.md", [
    "# Missing Receipt",
    "",
    "The update was published to `#updates`.",
    "",
    "- status: `sent`",
    "- sends messages: `true`",
  ].join("\n"));
  await writeFile(docsDir, "unrelated.md", "# Runtime Note\n");

  const result = await _internals.buildDiscordPublicationAuditRollup({
    docsDir,
    cwd: docsDir,
  });

  assert.equal(result.ok, false);
  assert.equal(result.counts.scannedFiles, 5);
  assert.equal(result.counts.auditedFiles, 4);
  assert.equal(result.counts.publishedReceipts, 1);
  assert.equal(result.counts.draftUpdateReceipts, 1);
  assert.equal(result.counts.publicationProofOnly, 1);
  assert.equal(result.counts.needsBackfill, 1);
  assert.equal(result.counts.untrackedPublicationReceipts, 0);
  assert.equal(result.counts.passNumberCollisions, 0);
  assert.deepEqual(result.reasonCodes, ["publication_receipt_backfill_needed"]);
});

test("publication audit flags duplicate pass numbers across audited receipts", () => {
  const result = _internals.summarizePublicationAudit({
    docsDir: path.resolve("docs/ops"),
    records: [
      _internals.classifyPublicationReceipt({
        filePath: path.resolve("docs/ops/discordos-first-surface-pass-98-2026-06-14.md"),
        markdown: `# First\n\n${receiptBlock()}`,
      }),
      _internals.classifyPublicationReceipt({
        filePath: path.resolve("docs/ops/discordos-second-publication-surface-pass-98-2026-06-14.md"),
        markdown: "# Second\n\nPublication proof without send evidence.",
      }),
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "pass_number_collision");
  assert.equal(result.counts.passNumberCollisions, 1);
  assert.deepEqual(result.reasonCodes, ["publication_receipt_pass_number_collision"]);
  assert.deepEqual(result.passNumberCollisions, [
    {
      passNumber: 98,
      paths: [
        "docs/ops/discordos-first-surface-pass-98-2026-06-14.md",
        "docs/ops/discordos-second-publication-surface-pass-98-2026-06-14.md",
      ],
    },
  ]);
});

test("publication audit reports untracked audited receipts without requiring backfill", () => {
  const trackedFiles = new Set(["docs/ops/published.md"]);
  const result = _internals.summarizePublicationAudit({
    docsDir: path.resolve("docs/ops"),
    trackedFiles,
    records: [
      _internals.classifyPublicationReceipt({
        filePath: path.resolve("docs/ops/published.md"),
        markdown: `# Published\n\n${receiptBlock()}`,
      }),
      _internals.classifyPublicationReceipt({
        filePath: path.resolve("docs/ops/draft-update-post.md"),
        markdown: [
          "# Draft",
          "",
          "## Update Post",
          "",
          "Draft body.",
        ].join("\n"),
      }),
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready_with_untracked_receipts");
  assert.equal(result.counts.untrackedPublicationReceipts, 1);
  assert.deepEqual(result.reasonCodes, ["publication_receipt_untracked"]);
  assert.equal(result.published[0].gitTracked, true);
  assert.equal(result.drafts[0].gitTracked, false);
  assert.equal(result.event.dimensions.untrackedPublicationReceipts, 1);
});

test("publication audit flags malformed and incomplete bounded receipts", () => {
  const malformed = _internals.classifyPublicationReceipt({
    filePath: path.resolve("docs/ops/malformed.md"),
    markdown: `${updatePostInternals.RECEIPT_BLOCK_START}\n## Discord Publication\n`,
    cwd: process.cwd(),
  });
  const incomplete = _internals.classifyPublicationReceipt({
    filePath: path.resolve("docs/ops/incomplete.md"),
    markdown: [
      "# Incomplete",
      "",
      receiptBlock({ messageId: "unknown" }),
    ].join("\n"),
    cwd: process.cwd(),
  });

  assert.equal(malformed.category, "needs_backfill");
  assert.deepEqual(malformed.reasonCodes, ["publication_receipt_block_malformed"]);
  assert.equal(incomplete.category, "needs_backfill");
  assert(incomplete.reasonCodes.includes("publication_message_id_missing"));
});

test("publication audit renders markdown without secret-like target values", () => {
  const result = _internals.summarizePublicationAudit({
    docsDir: path.resolve("docs/ops"),
    records: [
      _internals.classifyPublicationReceipt({
        filePath: path.resolve("docs/ops/published.md"),
        markdown: `# Published\n\n${receiptBlock()}`,
      }),
    ],
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Publication Audit Rollup"));
  assert(rendered.includes("result: `pass`"));
  assert(rendered.includes("published receipts: `1`"));
  assert(rendered.includes("untracked publication receipts: `0`"));
  assert(rendered.includes("pass number collisions: `0`"));
  assert(rendered.includes("message id `1515396583846445097`"));
  assert(!rendered.includes("bot-secret"));
});
