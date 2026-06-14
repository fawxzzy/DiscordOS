const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const CRITICAL_EMBED_COLOR = 14233637;
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "..", "config", "atlas-health-targets.json");
const DEFAULT_SUPPRESSION_DIR = path.join(os.tmpdir(), "discordos-atlas-health-watch");
const DEFAULT_TIMEOUT_MS = 8000;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanEnvValue(value) {
  return String(value || "")
    .replace(/^\u00EF\u00BB\u00BF/, "")
    .replace(/^\uFEFF/, "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .trim();
}

function parseArgs(args) {
  const options = {
    json: false,
    configPath: DEFAULT_CONFIG_PATH,
    send: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cooldownHours: 24,
    suppressRepeats: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--send") {
      options.send = true;
    } else if (arg === "--no-repeat-suppression") {
      options.suppressRepeats = false;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!hasValue(value)) {
        throw new Error("missing_config_value");
      }
      options.configPath = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--timeout-ms") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 100 || value > 60000) {
        throw new Error("invalid_timeout_ms");
      }
      options.timeoutMs = value;
      index += 1;
    } else if (arg === "--cooldown-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_cooldown_hours");
      }
      options.cooldownHours = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function normalizeTarget(entry) {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  const label = typeof entry?.label === "string" ? entry.label.trim() : id;
  const owner = typeof entry?.owner === "string" ? entry.owner.trim() : "unknown";
  const url = typeof entry?.url === "string" ? entry.url.trim() : "";
  const kind = typeof entry?.kind === "string" ? entry.kind.trim() : "http-ok";
  const critical = entry?.critical !== false;
  const enabled = entry?.enabled !== false;

  if (!id || !label || !url) {
    throw new Error("invalid_atlas_health_target");
  }
  if (kind !== "http-ok" && kind !== "json-ok") {
    throw new Error(`unsupported_atlas_health_target_kind:${kind}`);
  }

  return {
    id,
    label,
    owner,
    url,
    kind,
    critical,
    enabled,
  };
}

function normalizeConfig(config) {
  const targets = Array.isArray(config?.targets)
    ? config.targets.map(normalizeTarget).filter((target) => target.enabled)
    : [];

  if (targets.length === 0) {
    throw new Error("atlas_health_targets_empty");
  }

  return {
    version: Number.isInteger(config?.version) ? config.version : 1,
    schedule: config?.schedule && typeof config.schedule === "object" ? config.schedule : null,
    targets,
  };
}

async function loadConfig({ configPath = DEFAULT_CONFIG_PATH, env = process.env, fsImpl = fs } = {}) {
  if (hasValue(env.DISCORDOS_ATLAS_HEALTH_TARGETS_JSON)) {
    return normalizeConfig(JSON.parse(env.DISCORDOS_ATLAS_HEALTH_TARGETS_JSON));
  }

  const raw = await fsImpl.readFile(configPath, "utf8");
  return normalizeConfig(JSON.parse(raw));
}

function getAlertTarget(env = process.env) {
  if (hasValue(env.DISCORDOS_ATLAS_HEALTH_ALERT_WEBHOOK_URL)) {
    return {
      configured: true,
      type: "discord_webhook",
      webhookUrl: cleanEnvValue(env.DISCORDOS_ATLAS_HEALTH_ALERT_WEBHOOK_URL),
    };
  }
  if (hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL)) {
    return {
      configured: true,
      type: "discord_webhook",
      webhookUrl: cleanEnvValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL),
    };
  }
  if (hasValue(env.DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID) && hasValue(env.DISCORDOS_BOT_TOKEN)) {
    return {
      configured: true,
      type: "discord_bot_channel",
      channelId: cleanEnvValue(env.DISCORDOS_ATLAS_HEALTH_ALERT_CHANNEL_ID),
      token: cleanEnvValue(env.DISCORDOS_BOT_TOKEN),
    };
  }
  if (hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID) && hasValue(env.DISCORDOS_BOT_TOKEN)) {
    return {
      configured: true,
      type: "discord_bot_channel",
      channelId: cleanEnvValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID),
      token: cleanEnvValue(env.DISCORDOS_BOT_TOKEN),
    };
  }

  return {
    configured: false,
    type: "none",
  };
}

function safeUrlLabel(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch (_error) {
    return "invalid-url";
  }
}

async function fetchWithTimeout(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "User-Agent": "DiscordOS-ATLAS-Health-Watch/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTarget(target, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(target.url, { fetchImpl, timeoutMs });
    const durationMs = Date.now() - startedAt;
    const status = response.status;
    let body = null;
    let parseError = null;

    if (target.kind === "json-ok") {
      try {
        body = await response.json();
      } catch (error) {
        parseError = error;
      }
    }

    const reasonCodes = [];
    if (!response.ok) {
      reasonCodes.push("http_status_not_ok");
    }
    if (target.kind === "json-ok" && parseError) {
      reasonCodes.push("json_parse_failed");
    }
    if (target.kind === "json-ok" && !parseError && body?.ok !== true) {
      reasonCodes.push("json_ok_not_true");
    }

    return {
      id: target.id,
      label: target.label,
      owner: target.owner,
      kind: target.kind,
      urlLabel: safeUrlLabel(target.url),
      ok: reasonCodes.length === 0,
      critical: target.critical && reasonCodes.length > 0,
      httpStatus: status,
      durationMs,
      reasonCodes,
    };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "request_timeout" : "request_failed";
    return {
      id: target.id,
      label: target.label,
      owner: target.owner,
      kind: target.kind,
      urlLabel: safeUrlLabel(target.url),
      ok: false,
      critical: target.critical,
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      reasonCodes: [reason],
    };
  }
}

function buildSuppressionFingerprint(result) {
  return {
    criticalTargets: result.criticalTargets.map((target) => ({
      id: target.id,
      reasonCodes: target.reasonCodes.slice().sort(),
    })),
  };
}

function buildSuppressionKey(result) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(buildSuppressionFingerprint(result)))
    .digest("hex");
}

function suppressionPath(suppressionDir, suppressionKey) {
  return path.join(suppressionDir, `${suppressionKey}.json`);
}

async function readSuppressionRecord({ suppressionDir, suppressionKey, fsImpl = fs }) {
  try {
    return JSON.parse(await fsImpl.readFile(suppressionPath(suppressionDir, suppressionKey), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function evaluateSuppressionRecord({ record, cooldownHours, now = new Date() }) {
  if (!record || typeof record.lastSentAt !== "string") {
    return {
      suppressed: false,
      reasonCodes: [],
    };
  }

  const lastSentAtMs = Date.parse(record.lastSentAt);
  if (!Number.isFinite(lastSentAtMs)) {
    return {
      suppressed: false,
      reasonCodes: [],
    };
  }

  const nextEligibleAt = new Date(lastSentAtMs + cooldownHours * 60 * 60 * 1000).toISOString();
  if (now.getTime() < Date.parse(nextEligibleAt)) {
    return {
      suppressed: true,
      reasonCodes: ["atlas_health_repeat_suppressed"],
      lastSentAt: record.lastSentAt,
      nextEligibleAt,
    };
  }

  return {
    suppressed: false,
    reasonCodes: [],
    lastSentAt: record.lastSentAt,
    nextEligibleAt,
  };
}

async function writeSuppressionRecord({ result, suppressionDir, suppressionKey, sentAt = new Date(), fsImpl = fs }) {
  await fsImpl.mkdir(suppressionDir, { recursive: true });
  const record = {
    suppressionKey,
    lastSentAt: sentAt.toISOString(),
    fingerprint: buildSuppressionFingerprint(result),
  };
  await fsImpl.writeFile(suppressionPath(suppressionDir, suppressionKey), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

function classifyAtlasHealthEvent(result) {
  return {
    type: result.ok ? "atlas.health_watch.pass" : "atlas.health_watch.critical",
    severity: result.ok ? "info" : "error",
    subject: "atlas.health",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      targetCount: result.targetCount,
      passCount: result.passCount,
      failCount: result.failCount,
      criticalCount: result.criticalCount,
    },
  };
}

function estimateRunsPerMonthFromCron(cron) {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5) {
    return 30;
  }

  const hours = parts[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const dailyRuns = Math.max(1, hours.length);
  return dailyRuns * 30;
}

function buildDiscordAlertPayload(result) {
  const failed = result.criticalTargets.slice(0, 8);
  const fields = failed.map((target) => ({
    name: `${target.label} (${target.owner})`,
    value: [
      `surface: \`${target.urlLabel}\``,
      `status: \`${target.httpStatus ?? "none"}\``,
      `reasons: \`${target.reasonCodes.join(",") || "unknown"}\``,
    ].join("\n"),
    inline: false,
  }));

  fields.push({
    name: "Action",
    value: "Run `npm run ops:atlas-health:watch -- --json` from `repos/DiscordOS`, then check the owning project only if this repeats.",
    inline: false,
  });

  return {
    content: null,
    embeds: [
      {
        title: "ATLAS Critical Health Alert",
        color: CRITICAL_EMBED_COLOR,
        fields,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function sendDiscordWebhook({ webhookUrl, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return {
    ok: response.ok,
    status: response.status,
  };
}

async function sendDiscordBotChannel({ channelId, token, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return {
    ok: response.ok,
    status: response.status,
  };
}

async function deliverAtlasHealthAlert({
  result,
  target,
  env = process.env,
  send = false,
  suppressRepeats = true,
  suppressionDir = DEFAULT_SUPPRESSION_DIR,
  cooldownHours = 24,
  fetchImpl = fetch,
  now = new Date(),
  fsImpl = fs,
}) {
  if (result.ok) {
    return {
      ok: true,
      enabled: send,
      status: "skipped_clear",
      targetType: target.type,
      sent: false,
      reasonCodes: ["atlas_health_clear_delivery_not_requested"],
    };
  }

  const payload = buildDiscordAlertPayload(result);
  if (!send) {
    return {
      ok: true,
      enabled: false,
      status: "dry_run",
      targetType: target.type,
      sent: false,
      suppressRepeats,
      cooldownHours,
      suppression: {
        key: suppressRepeats ? buildSuppressionKey(result) : null,
        suppressed: false,
        reasonCodes: [],
      },
      payloadPreview: payload,
      reasonCodes: ["send_flag_not_set"],
    };
  }

  if (!target.configured) {
    return {
      ok: false,
      enabled: send,
      status: "blocked",
      targetType: "none",
      sent: false,
      reasonCodes: ["atlas_health_alert_target_missing"],
    };
  }

  const suppressionKey = buildSuppressionKey(result);
  const record = suppressRepeats
    ? await readSuppressionRecord({ suppressionDir, suppressionKey, fsImpl })
    : null;
  const suppression = suppressRepeats
    ? {
        key: suppressionKey,
        ...evaluateSuppressionRecord({ record, cooldownHours, now }),
      }
    : {
        key: null,
        suppressed: false,
        reasonCodes: [],
      };

  if (suppression.suppressed) {
    return {
      ok: true,
      enabled: true,
      status: "suppressed_repeat",
      targetType: target.type,
      sent: false,
      suppressRepeats,
      cooldownHours,
      suppression,
      reasonCodes: suppression.reasonCodes,
    };
  }

  const sent = target.type === "discord_webhook"
    ? await sendDiscordWebhook({ webhookUrl: target.webhookUrl, payload, fetchImpl })
    : await sendDiscordBotChannel({
        channelId: target.channelId,
        token: target.token,
        payload,
        fetchImpl,
      });

  let suppressionRecord = null;
  if (sent.ok && suppressRepeats && suppressionKey) {
    suppressionRecord = await writeSuppressionRecord({
      result,
      suppressionDir,
      suppressionKey,
      sentAt: now,
      fsImpl,
    });
  }

  return {
    ok: sent.ok,
    enabled: true,
    status: sent.ok ? "sent" : "failed",
    targetType: target.type,
    sent: sent.ok,
    httpStatus: sent.status,
    suppressRepeats,
    cooldownHours,
    suppression: {
      ...suppression,
      recordWritten: Boolean(suppressionRecord),
      lastSentAt: suppressionRecord?.lastSentAt || suppression.lastSentAt,
    },
    reasonCodes: sent.ok ? [] : ["atlas_health_alert_request_failed"],
  };
}

async function buildAtlasHealthWatch({
  configPath = DEFAULT_CONFIG_PATH,
  env = process.env,
  fetchImpl = fetch,
  fsImpl = fs,
  now = new Date(),
  send = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cooldownHours = 24,
  suppressRepeats = true,
  suppressionDir = DEFAULT_SUPPRESSION_DIR,
} = {}) {
  const config = await loadConfig({ configPath, env, fsImpl });
  const checks = await Promise.all(
    config.targets.map((target) => checkTarget(target, { fetchImpl, timeoutMs }))
  );
  const criticalTargets = checks.filter((check) => check.critical);
  const result = {
    ok: criticalTargets.length === 0,
    generatedAt: now.toISOString(),
    destructive: false,
    sendsMessages: send,
    writesArtifacts: false,
    targetCount: checks.length,
    passCount: checks.filter((check) => check.ok).length,
    failCount: checks.filter((check) => !check.ok).length,
    criticalCount: criticalTargets.length,
    criticalTargets,
    checks,
    usageEstimate: {
      configuredSchedule: config.schedule?.cron || null,
      runsPerMonth: estimateRunsPerMonthFromCron(config.schedule?.cron),
      targetChecksPerMonth: checks.length * estimateRunsPerMonthFromCron(config.schedule?.cron),
      discordPosts: criticalTargets.length === 0 ? "0 unless a critical target fails" : "bounded by repeat suppression",
    },
  };
  const event = classifyAtlasHealthEvent(result);
  const delivery = await deliverAtlasHealthAlert({
    result,
    target: getAlertTarget(env),
    env,
    send,
    suppressRepeats,
    suppressionDir,
    cooldownHours,
    fetchImpl,
    now,
    fsImpl,
  });

  return {
    ...result,
    event,
    alertDelivery: delivery,
  };
}

function renderMarkdown(result) {
  const lines = [
    "# ATLAS Health Watch",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- targets: \`${result.targetCount}\``,
    `- passing: \`${result.passCount}\``,
    `- failing: \`${result.failCount}\``,
    `- critical: \`${result.criticalCount}\``,
    `- delivery status: \`${result.alertDelivery.status}\``,
    `- delivery target type: \`${result.alertDelivery.targetType}\``,
    `- delivery reason codes: \`${result.alertDelivery.reasonCodes.join(",") || "none"}\``,
  ];

  for (const target of result.criticalTargets) {
    lines.push(`- critical target: \`${target.id}\` reasons=\`${target.reasonCodes.join(",")}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildAtlasHealthWatch(options);
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
    DISCORD_API_BASE,
    CRITICAL_EMBED_COLOR,
    DEFAULT_CONFIG_PATH,
    DEFAULT_SUPPRESSION_DIR,
    DEFAULT_TIMEOUT_MS,
    parseArgs,
    normalizeTarget,
    normalizeConfig,
    loadConfig,
    getAlertTarget,
    safeUrlLabel,
    fetchWithTimeout,
    checkTarget,
    buildSuppressionFingerprint,
    buildSuppressionKey,
    suppressionPath,
    readSuppressionRecord,
    evaluateSuppressionRecord,
    writeSuppressionRecord,
    classifyAtlasHealthEvent,
    estimateRunsPerMonthFromCron,
    buildDiscordAlertPayload,
    sendDiscordWebhook,
    sendDiscordBotChannel,
    deliverAtlasHealthAlert,
    buildAtlasHealthWatch,
    renderMarkdown,
  },
};
