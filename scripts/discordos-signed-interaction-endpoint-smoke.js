const crypto = require("node:crypto");
const {
  _internals: endpointInternals,
} = require("../api/discord-interactions");

function parseArgs(args) {
  const options = {
    json: false,
    type: "PING",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--type") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_type_value");
      }
      options.type = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function discordPublicKeyFromKey(publicKey) {
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return publicKeyDer.subarray(publicKeyDer.length - 32).toString("hex");
}

function buildSmokeBody(type = "PING") {
  if (type === "MESSAGE_COMPONENT") {
    return JSON.stringify({
      type: 3,
      data: {
        custom_id: "music_sesh:queue",
        component_type: 2,
      },
    });
  }
  return JSON.stringify({ type: 1 });
}

async function buildSignedInteractionEndpointSmoke({
  type = "PING",
  nowSeconds = 100,
} = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyHex = discordPublicKeyFromKey(publicKey);
  const body = buildSmokeBody(type);
  const timestamp = String(nowSeconds);
  const signature = crypto.sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");
  const response = await endpointInternals.buildDiscordInteractionResponse({
    method: "POST",
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    rawBody: body,
    publicKey: publicKeyHex,
    nowSeconds,
  });
  const reasonCodes = [...response.reasonCodes];
  if (!response.signaturePreflight?.signatureVerified) {
    reasonCodes.push("signature_not_verified");
  }

  const result = {
    ok: response.ok && reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: false,
    executesCommand: false,
    status: response.ok && reasonCodes.length === 0 ? "signed_endpoint_smoke_ready" : "blocked",
    interactionType: type,
    responseType: response.payload?.type || null,
    signatureVerified: response.signaturePreflight?.signatureVerified === true,
    admissionStatus: response.admission?.status || null,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.discord_interaction.signed_endpoint_smoke_ready"
        : "discordos.discord_interaction.signed_endpoint_smoke_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.discord_interaction.signed_endpoint_smoke",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        interactionType: result.interactionType,
        responseType: result.responseType,
        signatureVerified: result.signatureVerified,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Signed Interaction Endpoint Smoke",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- executes command: \`${result.executesCommand ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- interaction type: \`${result.interactionType}\``,
    `- response type: \`${result.responseType || "none"}\``,
    `- signature verified: \`${result.signatureVerified ? "true" : "false"}\``,
    `- admission status: \`${result.admissionStatus || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildSignedInteractionEndpointSmoke(options);
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
    discordPublicKeyFromKey,
    buildSmokeBody,
    buildSignedInteractionEndpointSmoke,
    renderMarkdown,
  },
};
