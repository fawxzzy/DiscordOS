const crypto = require("node:crypto");

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const DEFAULT_MAX_AGE_SECONDS = 300;

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(missingCode);
  }
  return value;
}

function parseArgs(args) {
  const options = {
    json: false,
    verify: false,
    publicKey: null,
    timestamp: null,
    signature: null,
    body: "",
    maxAgeSeconds: DEFAULT_MAX_AGE_SECONDS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--public-key") {
      options.publicKey = readValue(args, index, "missing_public_key_value").trim();
      index += 1;
    } else if (arg === "--timestamp") {
      options.timestamp = readValue(args, index, "missing_timestamp_value").trim();
      index += 1;
    } else if (arg === "--signature") {
      options.signature = readValue(args, index, "missing_signature_value").trim();
      index += 1;
    } else if (arg === "--body") {
      options.body = readValue(args, index, "missing_body_value");
      index += 1;
    } else if (arg === "--max-age-seconds") {
      options.maxAgeSeconds = Number.parseInt(readValue(args, index, "missing_max_age_seconds_value"), 10);
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function isHex(value, length) {
  return typeof value === "string" && value.length === length && /^[a-fA-F0-9]+$/.test(value);
}

function createEd25519PublicKeyFromDiscordHex(publicKeyHex) {
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
    format: "der",
    type: "spki",
  });
}

function verifyDiscordInteractionSignature({ publicKey, timestamp, signature, body }) {
  const key = createEd25519PublicKeyFromDiscordHex(publicKey);
  return crypto.verify(
    null,
    Buffer.from(`${timestamp}${body || ""}`),
    key,
    Buffer.from(signature, "hex")
  );
}

function buildDiscordInteractionSignaturePreflight(input = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  const reasonCodes = [];
  if (!isHex(input.publicKey, 64)) {
    reasonCodes.push("public_key_invalid");
  }
  if (!isHex(input.signature, 128)) {
    reasonCodes.push("signature_invalid");
  }
  const timestampNumber = Number.parseInt(input.timestamp, 10);
  if (!Number.isInteger(timestampNumber) || String(timestampNumber) !== String(input.timestamp || "").trim()) {
    reasonCodes.push("timestamp_invalid");
  }
  const maxAgeSeconds = Number.isInteger(input.maxAgeSeconds) && input.maxAgeSeconds > 0
    ? input.maxAgeSeconds
    : DEFAULT_MAX_AGE_SECONDS;
  if (Number.isInteger(timestampNumber) && Math.abs(nowSeconds - timestampNumber) > maxAgeSeconds) {
    reasonCodes.push("timestamp_outside_replay_window");
  }

  let signatureVerified = null;
  if (input.verify && reasonCodes.length === 0) {
    signatureVerified = verifyDiscordInteractionSignature(input);
    if (!signatureVerified) {
      reasonCodes.push("signature_verification_failed");
    }
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    admitsInteraction: false,
    status: reasonCodes.length === 0 ? "signature_preflight_ready" : "blocked",
    verifyAttempted: input.verify === true,
    signatureVerified,
    maxAgeSeconds,
    bodyLength: String(input.body || "").length,
    nextGate: "discord_interaction_handler_admission",
    reasonCodes,
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.discord_interaction.signature_preflight_ready"
        : "discordos.discord_interaction.signature_preflight_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.discord_interaction.signature_preflight",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        verifyAttempted: result.verifyAttempted,
        signatureVerified: result.signatureVerified === true,
        admitsInteraction: result.admitsInteraction,
        reasonCodeCount: result.reasonCodes.length,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Discord Interaction Signature Preflight",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- admits interaction: \`${result.admitsInteraction ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- verify attempted: \`${result.verifyAttempted ? "true" : "false"}\``,
    `- signature verified: \`${result.signatureVerified === null ? "not_attempted" : result.signatureVerified ? "true" : "false"}\``,
    `- body length: \`${result.bodyLength}\``,
    `- next gate: \`${result.nextGate}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildDiscordInteractionSignaturePreflight(options);
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
    ED25519_SPKI_PREFIX,
    DEFAULT_MAX_AGE_SECONDS,
    parseArgs,
    isHex,
    createEd25519PublicKeyFromDiscordHex,
    verifyDiscordInteractionSignature,
    buildDiscordInteractionSignaturePreflight,
    renderMarkdown,
  },
};
