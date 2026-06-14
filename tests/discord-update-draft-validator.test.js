const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discord-update-draft-validator");
const { _internals: markerInternals } = require("../scripts/discordos-workflow-marker-progress");

function validDraftMarkdown() {
  return [
    "# DiscordOS Example Update - 2026-06-13",
    "",
    "## Update Post",
    "",
    "DiscordOS example hardening is now closed at 100%.",
    "",
    "What changed:",
    "",
    "- added a guarded operator command",
    "- kept routine logs out of public updates",
    "",
    "Proof:",
    "",
    "- runtime posture: `operational`",
    "- readiness: `100`",
  ].join("\n");
}

function draftWithReceiptLinks() {
  return [
    validDraftMarkdown(),
    "",
    "## Internal Receipt Links",
    "",
    "- `docs/ops/discordos-example-pass-1-2026-06-13.md`",
  ].join("\n");
}

async function writeDraft(markdown) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-update-draft-"));
  await fs.mkdir(path.join(dir, "docs", "ops"), { recursive: true });
  await fs.writeFile(path.join(dir, "docs", "ops", "draft.md"), markdown, "utf8");
  return dir;
}

async function writeMarkerBoard(markdown = [
  "# Lanes And Markers",
  "",
  "## Active Front-Page Marker Table",
  "",
  "- AI Long-Run Batch Orchestration: `49%`",
].join("\n")) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-draft-markers-"));
  const markerPath = path.join(dir, "02-lanes-and-markers.md");
  await fs.writeFile(markerPath, markdown, "utf8");
  return markerPath;
}

test("discord update draft validator args default to update post section", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    title: null,
    bodyFile: null,
    bodySection: _internals.DEFAULT_BODY_SECTION,
    markers: [],
    markerFilePath: markerInternals.DEFAULT_MARKER_FILE_PATH,
  });
});

test("discord update draft validator parses title body file section and json", () => {
  assert.deepEqual(
    _internals.parseArgs([
      "--json",
      "--title",
      "DiscordOS Example Closed",
      "--body-file",
      "docs/ops/draft.md",
      "--body-section",
      "Update Post",
      "--marker",
      "AI Long-Run Batch Orchestration",
      "--marker-file",
      "docs/ops/markers.md",
    ]),
    {
      json: true,
      title: "DiscordOS Example Closed",
      bodyFile: "docs/ops/draft.md",
      bodySection: "Update Post",
      markers: ["AI Long-Run Batch Orchestration"],
      markerFilePath: "docs/ops/markers.md",
    }
  );
});

test("discord update draft validator extracts durable receipt links", () => {
  assert.deepEqual(_internals.extractDurableReceiptLinks(draftWithReceiptLinks()), [
    "docs/ops/discordos-example-pass-1-2026-06-13.md",
  ]);
});

test("discord update draft validator passes a complete update receipt", async () => {
  const markerFilePath = await writeMarkerBoard();
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    markers: ["AI Long-Run Batch Orchestration"],
    markerFilePath,
    cwd: await writeDraft(validDraftMarkdown()),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.equal(result.destructive, false);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.writesArtifacts, false);
  assert.equal(result.payload.status, "valid");
  assert.equal(result.payload.markerProgress.summary.markerCount, 1);
  assert.equal(result.bodyAnchors.ok, true);
  assert.equal(result.formatting.ok, true);
  assert.equal(result.receiptLinks.count, 0);
  assert.equal(result.publicSafety.ok, true);
  assert.equal(result.event.type, "discordos.updates.draft_ready");
});

test("discord update draft validator passes the current closeout update post", async () => {
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Runtime Hardening Closed",
    bodyFile: "docs/ops/discordos-runtime-product-hardening-closeout-update-post-2026-06-13.md",
    cwd: path.resolve(__dirname, ".."),
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.bodyChars, 2718);
  assert.equal(result.receiptLinks.count, 19);
});

test("discord update draft validator blocks missing public proof anchors", async () => {
  const markdown = validDraftMarkdown().replace("Proof:", "Evidence:");
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(markdown),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.bodyAnchors.reasonCodes, ["missing_public_body_anchor:proof_"]);
});

test("discord update draft validator allows receipts to stay out of the public update", async () => {
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(validDraftMarkdown()),
  });

  assert.equal(result.ok, true);
  assert.equal(result.receiptLinks.ok, true);
  assert.equal(result.receiptLinks.required, false);
  assert.equal(result.receiptLinks.count, 0);
});

test("discord update draft validator blocks headings inside the public update body", async () => {
  const markdown = validDraftMarkdown().replace("What changed:", "### Extra Title\n\nWhat changed:");
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(markdown),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.formatting.reasonCodes, ["public_body_heading_present"]);
});

test("discord update draft validator blocks secret-like value leakage", async () => {
  const markdown = `${validDraftMarkdown()}\n\nCRON_SECRET=super-secret-value\n`;
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(markdown),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.publicSafety.reasonCodes, ["secret_assignment_present"]);
});

test("discord update draft validator reports payload limit failures", async () => {
  const longBody = validDraftMarkdown().replace(
    "Proof:",
    `${"x".repeat(5000)}\n\nProof:`
  );
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(longBody),
  });

  assert.equal(result.ok, false);
  assert.equal(result.payload.status, "invalid");
  assert.deepEqual(result.payload.reasonCodes, ["body_too_long"]);
});

test("discord update draft validator renders markdown without full body or secret values", async () => {
  const result = await _internals.buildDiscordUpdateDraftValidation({
    title: "DiscordOS Example Closed",
    bodyFile: "docs/ops/draft.md",
    cwd: await writeDraft(validDraftMarkdown()),
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Update Draft Validation"));
  assert(rendered.includes("sends messages: `false`"));
  assert(rendered.includes("body formatting: `pass`"));
  assert(rendered.includes("durable receipt links: `0`"));
  assert(!rendered.includes("added a guarded operator command"));
  assert(!rendered.includes("super-secret-value"));
});
