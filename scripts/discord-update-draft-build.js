const { _internals: postInternals } = require("./discord-update-post");

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    title: null,
    changes: [],
    proofs: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--title") {
      options.title = readValue(args, index, "missing_title_value");
      index += 1;
    } else if (arg === "--change") {
      options.changes.push(readValue(args, index, "missing_change_value"));
      index += 1;
    } else if (arg === "--proof") {
      options.proofs.push(readValue(args, index, "missing_proof_value"));
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function normalizeList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function validateDraftParts({ title, changes, proofs }) {
  const reasonCodes = [];
  const normalizedChanges = normalizeList(changes);
  const normalizedProofs = normalizeList(proofs);

  if (!postInternals.hasValue(title)) {
    reasonCodes.push("title_missing");
  }
  if (normalizedChanges.length === 0) {
    reasonCodes.push("change_missing");
  }
  if (normalizedProofs.length === 0) {
    reasonCodes.push("proof_missing");
  }

  return {
    ok: reasonCodes.length === 0,
    title: postInternals.hasValue(title) ? String(title).trim() : null,
    changes: normalizedChanges,
    proofs: normalizedProofs,
    reasonCodes,
  };
}

function renderBulletList(values) {
  return values.map((value) => `- ${value}`).join("\n");
}

function buildPublicUpdateBody({ changes, proofs }) {
  return [
    "What changed:",
    renderBulletList(changes),
    "",
    "Proof:",
    renderBulletList(proofs),
  ].join("\n").trim();
}

function buildDraftMarkdown({ title, body }) {
  return [
    `# ${title}`,
    "",
    "## Update Post",
    "",
    body,
    "",
  ].join("\n");
}

function classifyDraftBuildEvent(result) {
  return {
    type: result.ok
      ? "discordos.updates.draft_build_ready"
      : "discordos.updates.draft_build_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.updates.draft",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      changeCount: result.changeCount,
      proofCount: result.proofCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildDiscordUpdateDraft(options = {}) {
  const validated = validateDraftParts(options);
  const body = validated.ok
    ? buildPublicUpdateBody({
      changes: validated.changes,
      proofs: validated.proofs,
    })
    : "";
  const result = {
    ok: validated.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: validated.ok ? "ready" : "blocked",
    title: validated.title,
    changeCount: validated.changes.length,
    proofCount: validated.proofs.length,
    reasonCodes: validated.reasonCodes,
    body,
    markdown: validated.ok ? buildDraftMarkdown({ title: validated.title, body }) : "",
  };

  return {
    ...result,
    event: classifyDraftBuildEvent(result),
  };
}

function renderMarkdown(result) {
  if (!result.ok) {
    return [
      "# DiscordOS Update Draft Build",
      "",
      "- result: `fail`",
      `- status: \`${result.status}\``,
      `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
      "",
    ].join("\n");
  }

  return result.markdown;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildDiscordUpdateDraft(options);
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
    parseArgs,
    normalizeList,
    validateDraftParts,
    renderBulletList,
    buildPublicUpdateBody,
    buildDraftMarkdown,
    classifyDraftBuildEvent,
    buildDiscordUpdateDraft,
    renderMarkdown,
  },
};
