const {
  _internals: signatureInternals,
} = require("../scripts/discordos-discord-interaction-signature-preflight");
const {
  _internals: admissionInternals,
} = require("../scripts/discordos-interaction-handler-admission");

function normalizeHeader(headers = {}, name) {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0] || "";
  }
  return typeof direct === "string" ? direct : "";
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function interactionTypeName(type) {
  if (type === 1) {
    return "PING";
  }
  if (type === 2) {
    return "APPLICATION_COMMAND";
  }
  return "UNKNOWN";
}

function surfaceFromCommandName(name) {
  if (name === "board-card") {
    return "board";
  }
  if (name === "mod-review") {
    return "moderation";
  }
  if (name === "music") {
    return "music";
  }
  return null;
}

function extractMusicOptions(data = {}) {
  const options = Array.isArray(data.options) ? data.options : [];
  const byName = new Map(options.map((option) => [option.name, option.value]));
  return {
    sessionId: String(byName.get("session") || "music-sesh-interaction"),
    action: String(byName.get("action") || "queue_item"),
    itemTitle: String(byName.get("title") || "Interaction Track"),
  };
}

function buildAdmissionInput(interaction) {
  const type = interactionTypeName(interaction?.type);
  const commandName = interaction?.data?.name || "music";
  const musicOptions = extractMusicOptions(interaction?.data);
  return {
    type,
    surface: surfaceFromCommandName(commandName) || "music",
    command: commandName,
    ...musicOptions,
  };
}

async function readRawBody(req) {
  if (typeof req.rawBody === "string") {
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }
  if (typeof req.body === "string") {
    return req.body;
  }
  if (req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function responseForAdmission(admission) {
  if (!admission.ok) {
    return {
      statusCode: 400,
      payload: {
        type: 4,
        data: {
          content: "Interaction route is not admitted.",
          flags: 64,
        },
      },
    };
  }
  if (admission.route?.kind === "pong") {
    return {
      statusCode: 200,
      payload: {
        type: 1,
      },
    };
  }
  return {
    statusCode: 200,
    payload: {
      type: 4,
      data: {
        content: "DiscordOS command route admitted.",
        flags: 64,
      },
    },
  };
}

async function buildDiscordInteractionResponse({
  method = "POST",
  headers = {},
  rawBody,
  publicKey,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  if (method !== "POST") {
    return {
      ok: false,
      statusCode: 405,
      payload: { ok: false, error: "METHOD_NOT_ALLOWED" },
      reasonCodes: ["method_not_allowed"],
    };
  }
  if (!hasValue(publicKey)) {
    return {
      ok: false,
      statusCode: 503,
      payload: { ok: false, error: "DISCORD_PUBLIC_KEY_MISSING" },
      reasonCodes: ["discord_public_key_missing"],
    };
  }

  const body = String(rawBody || "");
  const signature = normalizeHeader(headers, "x-signature-ed25519");
  const timestamp = normalizeHeader(headers, "x-signature-timestamp");
  const signaturePreflight = signatureInternals.buildDiscordInteractionSignaturePreflight({
    publicKey,
    timestamp,
    signature,
    body,
    verify: true,
  }, nowSeconds);

  if (!signaturePreflight.ok) {
    return {
      ok: false,
      statusCode: 401,
      payload: { ok: false, error: "INVALID_INTERACTION_SIGNATURE" },
      signaturePreflight,
      reasonCodes: signaturePreflight.reasonCodes,
    };
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      payload: { ok: false, error: "INVALID_INTERACTION_BODY" },
      signaturePreflight,
      reasonCodes: ["interaction_body_invalid"],
    };
  }

  const admission = admissionInternals.buildInteractionHandlerAdmission(buildAdmissionInput(interaction));
  const response = responseForAdmission(admission);
  return {
    ok: admission.ok,
    statusCode: response.statusCode,
    payload: response.payload,
    signaturePreflight,
    admission,
    reasonCodes: admission.reasonCodes,
  };
}

module.exports = async function discordInteractions(req, res) {
  const result = await buildDiscordInteractionResponse({
    method: req.method,
    headers: req.headers,
    rawBody: await readRawBody(req),
    publicKey: process.env.DISCORDOS_PUBLIC_KEY,
  });

  return res.status(result.statusCode).json(result.payload);
};

module.exports._internals = {
  normalizeHeader,
  interactionTypeName,
  surfaceFromCommandName,
  extractMusicOptions,
  buildAdmissionInput,
  readRawBody,
  responseForAdmission,
  buildDiscordInteractionResponse,
};
