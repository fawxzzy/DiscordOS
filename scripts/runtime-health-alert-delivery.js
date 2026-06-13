const { _internals: proofInternals } = require("./runtime-health-proof");
const { _internals: alertInternals } = require("./runtime-health-alert");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const CRITICAL_EMBED_COLOR = 14233637;
const DEFAULT_SUPPRESSION_DIR = path.resolve(__dirname, "..", "..", "..", "runtime", "discordos", "runtime-health-alert-delivery");

function parseArgs(args) {
  const options = {
    json: false,
    snapshotDir: proofInternals.DEFAULT_SNAPSHOT_DIR,
    suppressionDir: DEFAULT_SUPPRESSION_DIR,
    limit: 10,
    maxSnapshotAgeHours: 24,
    minReadinessPercent: 100,
    staleSeverity: "warning",
    minDeliverySeverity: "critical",
    cooldownHours: 24,
    suppressRepeats: true,
    includeClear: false,
    send: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--include-clear") {
      options.includeClear = true;
    } else if (arg === "--send") {
      options.send = true;
    } else if (arg === "--no-repeat-suppression") {
      options.suppressRepeats = false;
    } else if (arg === "--min-delivery-severity") {
      const value = args[index + 1];
      if (value !== "warning" && value !== "critical") {
        throw new Error("invalid_min_delivery_severity");
      }
      options.minDeliverySeverity = value;
      index += 1;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = require("node:path").resolve(value.trim());
      index += 1;
    } else if (arg === "--suppression-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_suppression_dir_value");
      }
      options.suppressionDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--limit") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("invalid_limit");
      }
      options.limit = value;
      index += 1;
    } else if (arg === "--max-age-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_max_age_hours");
      }
      options.maxSnapshotAgeHours = value;
      index += 1;
    } else if (arg === "--cooldown-hours") {
      const value = Number.parseFloat(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("invalid_cooldown_hours");
      }
      options.cooldownHours = value;
      index += 1;
    } else if (arg === "--min-readiness-percent") {
      const value = Number.parseInt(args[index + 1], 10);
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw new Error("invalid_min_readiness_percent");
      }
      options.minReadinessPercent = value;
      index += 1;
    } else if (arg === "--stale-severity") {
      const value = args[index + 1];
      if (value !== "warning" && value !== "critical") {
        throw new Error("invalid_stale_severity");
      }
      options.staleSeverity = value;
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return String(value || "")
    .replace(/^\u00EF\u00BB\u00BF/, "")
    .replace(/^\uFEFF/, "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .trim()
    .length > 0;
}

function normalizeEnvValue(value) {
  return String(value || "")
    .replace(/^\u00EF\u00BB\u00BF/, "")
    .replace(/^\uFEFF/, "")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .trim();
}

function getAlertDeliveryTarget(env = process.env) {
  if (hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL)) {
    return {
      configured: true,
      type: "discord_webhook",
    };
  }

  if (hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID) && hasValue(env.DISCORDOS_BOT_TOKEN)) {
    return {
      configured: true,
      type: "discord_bot_channel",
    };
  }

  return {
    configured: false,
    type: "none",
  };
}

function buildAlertMessage(alert) {
  const latest = alert.summary.latest;
  const reasonCodes = alert.event.reasonCodes.join(", ") || "none";
  return [
    `[DiscordOS runtime-health] ${alert.event.status.toUpperCase()} (${alert.severity})`,
    `posture: ${latest?.posture || "unknown"}`,
    `readiness: ${latest?.readinessPercent ?? "unknown"}`,
    `fresh: ${latest?.fresh === true ? "true" : "false"}`,
    `reasons: ${reasonCodes}`,
  ].join("\n");
}

function severityRank(severity) {
  return {
    ok: 0,
    warning: 1,
    critical: 2,
  }[severity] ?? 0;
}

function isSeverityDeliverable(alertSeverity, minDeliverySeverity) {
  return severityRank(alertSeverity) >= severityRank(minDeliverySeverity);
}

function sortedStrings(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "string").slice().sort()
    : [];
}

function buildSuppressionFingerprint(alert) {
  const latest = alert.summary.latest || {};
  return {
    severity: alert.severity,
    status: alert.event.status,
    reasonCodes: sortedStrings(alert.event.reasonCodes),
    posture: latest.posture || null,
    readinessPercent: latest.readinessPercent ?? null,
    fresh: latest.fresh === true,
    blockedReasons: sortedStrings(latest.blockedReasons),
  };
}

function buildSuppressionKey(alert) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(buildSuppressionFingerprint(alert)))
    .digest("hex");
}

function suppressionPath(suppressionDir, suppressionKey) {
  return path.join(suppressionDir, `${suppressionKey}.json`);
}

async function readSuppressionRecord({ suppressionDir, suppressionKey }) {
  try {
    const raw = await fs.readFile(suppressionPath(suppressionDir, suppressionKey), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
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

  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const nextEligibleAt = new Date(lastSentAtMs + cooldownMs).toISOString();
  if (now.getTime() < lastSentAtMs + cooldownMs) {
    return {
      suppressed: true,
      reasonCodes: ["alert_repeat_suppressed"],
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

async function evaluateSuppression({ alert, suppressionDir, cooldownHours, now }) {
  const suppressionKey = buildSuppressionKey(alert);
  const record = await readSuppressionRecord({ suppressionDir, suppressionKey });
  return {
    key: suppressionKey,
    ...evaluateSuppressionRecord({ record, cooldownHours, now }),
  };
}

async function writeSuppressionRecord({ alert, suppressionDir, suppressionKey, sentAt = new Date() }) {
  await fs.mkdir(suppressionDir, { recursive: true });
  const record = {
    suppressionKey,
    lastSentAt: sentAt.toISOString(),
    fingerprint: buildSuppressionFingerprint(alert),
  };
  await fs.writeFile(suppressionPath(suppressionDir, suppressionKey), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

function buildDiscordAlertPayload(alert) {
  const latest = alert.summary.latest;
  const reasonCodes = alert.event.reasonCodes.join(", ") || "none";
  const blockedReasons = latest?.blockedReasons?.join(", ") || "none";
  return {
    content: null,
    embeds: [
      {
        title: "DiscordOS Runtime Critical Alert",
        color: CRITICAL_EMBED_COLOR,
        fields: [
          {
            name: "Posture",
            value: latest?.posture || "unknown",
            inline: true,
          },
          {
            name: "Readiness",
            value: String(latest?.readinessPercent ?? "unknown"),
            inline: true,
          },
          {
            name: "Fresh",
            value: latest?.fresh === true ? "true" : "false",
            inline: true,
          },
          {
            name: "Reasons",
            value: reasonCodes,
            inline: false,
          },
          {
            name: "Blocked Reasons",
            value: blockedReasons,
            inline: false,
          },
          {
            name: "Action",
            value: "Run `npm run ops:runtime-health:status` from `repos/DiscordOS`.",
            inline: false,
          },
        ],
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

async function deliverAlert({
  alert,
  target,
  env = process.env,
  send = false,
  includeClear = false,
  minDeliverySeverity = "critical",
  suppressRepeats = true,
  suppressionDir = DEFAULT_SUPPRESSION_DIR,
  cooldownHours = 24,
  fetchImpl = fetch,
  now = new Date(),
}) {
  if (alert.ok && !includeClear) {
    return {
      ok: true,
      status: "skipped_clear",
      targetType: target.type,
      sent: false,
      reasonCodes: ["alert_clear_delivery_not_requested"],
    };
  }

  if (!alert.ok && !isSeverityDeliverable(alert.severity, minDeliverySeverity)) {
    return {
      ok: true,
      status: "skipped_non_critical",
      targetType: target.type,
      sent: false,
      reasonCodes: ["alert_below_delivery_threshold"],
      minDeliverySeverity,
    };
  }

  if (!target.configured) {
    return {
      ok: false,
      status: "blocked",
      targetType: "none",
      sent: false,
      reasonCodes: ["alert_delivery_target_missing"],
    };
  }

  const payload = buildDiscordAlertPayload(alert);
  const suppression = suppressRepeats
    ? await evaluateSuppression({ alert, suppressionDir, cooldownHours, now })
    : {
        key: null,
        suppressed: false,
        reasonCodes: [],
      };

  if (send && suppression.suppressed) {
    return {
      ok: true,
      status: "suppressed_repeat",
      targetType: target.type,
      sent: false,
      minDeliverySeverity,
      suppressRepeats,
      cooldownHours,
      suppression,
      reasonCodes: suppression.reasonCodes,
    };
  }

  if (!send) {
    return {
      ok: true,
      status: "dry_run",
      targetType: target.type,
      sent: false,
      reasonCodes: ["send_flag_not_set"],
      minDeliverySeverity,
      suppressRepeats,
      cooldownHours,
      suppression,
      messagePreview: buildAlertMessage(alert),
      payloadPreview: payload,
    };
  }

  const result = target.type === "discord_webhook"
    ? await sendDiscordWebhook({
        webhookUrl: normalizeEnvValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL),
        payload,
        fetchImpl,
      })
    : await sendDiscordBotChannel({
        channelId: normalizeEnvValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID),
        token: normalizeEnvValue(env.DISCORDOS_BOT_TOKEN),
        payload,
        fetchImpl,
      });

  let suppressionRecord = null;
  if (result.ok && suppressRepeats && suppression.key) {
    try {
      suppressionRecord = await writeSuppressionRecord({
        alert,
        suppressionDir,
        suppressionKey: suppression.key,
        sentAt: now,
      });
    } catch (_error) {
      return {
        ok: false,
        status: "sent_suppression_record_failed",
        targetType: target.type,
        sent: true,
        httpStatus: result.status,
        minDeliverySeverity,
        suppressRepeats,
        cooldownHours,
        suppression: {
          ...suppression,
          recordWritten: false,
        },
        reasonCodes: ["alert_suppression_record_failed"],
      };
    }
  }

  return {
    ok: result.ok,
    status: result.ok ? "sent" : "failed",
    targetType: target.type,
    sent: result.ok,
    httpStatus: result.status,
    minDeliverySeverity,
    suppressRepeats,
    cooldownHours,
    suppression: {
      ...suppression,
      recordWritten: Boolean(suppressionRecord),
      lastSentAt: suppressionRecord?.lastSentAt || suppression.lastSentAt,
    },
    reasonCodes: result.ok ? [] : ["alert_delivery_request_failed"],
  };
}

function classifyAlertDeliveryEvent(result) {
  return {
    type: result.ok
      ? "discordos.runtime_health.alert_delivery_ready"
      : "discordos.runtime_health.alert_delivery_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.runtime",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      alertSeverity: result.alert.severity,
      alertStatus: result.alert.status,
      deliveryStatus: result.delivery.status,
      targetType: result.delivery.targetType,
      sent: result.delivery.sent,
      reasonCodeCount: result.delivery.reasonCodes.length,
    },
  };
}

async function buildRuntimeHealthAlertDelivery({
  snapshotDir,
  limit,
  maxSnapshotAgeHours,
  minReadinessPercent,
  staleSeverity,
  includeClear,
  send,
  minDeliverySeverity = "critical",
  suppressRepeats = true,
  suppressionDir = DEFAULT_SUPPRESSION_DIR,
  cooldownHours = 24,
  env = process.env,
  fetchImpl = fetch,
  now,
}) {
  const alert = await alertInternals.buildRuntimeHealthAlert({
    snapshotDir,
    limit,
    maxSnapshotAgeHours,
    minReadinessPercent,
    staleSeverity,
    now,
  });
  const target = getAlertDeliveryTarget(env);
  const delivery = await deliverAlert({
    alert,
    target,
    env,
    send,
    includeClear,
    minDeliverySeverity,
    suppressRepeats,
    suppressionDir,
    cooldownHours,
    fetchImpl,
    now: now || new Date(),
  });
  const result = {
    ok: delivery.ok,
    destructive: false,
    alertDelivered: delivery.sent,
    sendRequested: send,
    includeClear,
    minDeliverySeverity,
    suppressRepeats,
    cooldownHours,
    alert: {
      ok: alert.ok,
      severity: alert.severity,
      eventType: alert.event.type,
      status: alert.event.status,
      reasonCodes: alert.event.reasonCodes,
      latest: {
        posture: alert.summary.latest?.posture || null,
        readinessPercent: alert.summary.latest?.readinessPercent ?? null,
        fresh: alert.summary.latest?.fresh === true,
        blockedReasons: alert.summary.latest?.blockedReasons || [],
      },
    },
    delivery,
  };

  return {
    ...result,
    event: classifyAlertDeliveryEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Runtime Health Alert Delivery",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- send requested: \`${result.sendRequested ? "true" : "false"}\``,
    `- alert delivered: \`${result.alertDelivered ? "true" : "false"}\``,
    `- min delivery severity: \`${result.minDeliverySeverity}\``,
    `- repeat suppression: \`${result.suppressRepeats ? "true" : "false"}\``,
    `- repeat cooldown hours: \`${result.cooldownHours}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- alert severity: \`${result.alert.severity}\``,
    `- alert status: \`${result.alert.status}\``,
    `- alert reason codes: \`${result.alert.reasonCodes.join(",") || "none"}\``,
    `- delivery status: \`${result.delivery.status}\``,
    `- delivery target type: \`${result.delivery.targetType}\``,
    `- delivery reason codes: \`${result.delivery.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildRuntimeHealthAlertDelivery(options);
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
    DEFAULT_SUPPRESSION_DIR,
    parseArgs,
    getAlertDeliveryTarget,
    buildAlertMessage,
    severityRank,
    isSeverityDeliverable,
    buildSuppressionFingerprint,
    buildSuppressionKey,
    suppressionPath,
    readSuppressionRecord,
    evaluateSuppressionRecord,
    evaluateSuppression,
    writeSuppressionRecord,
    buildDiscordAlertPayload,
    sendDiscordWebhook,
    sendDiscordBotChannel,
    deliverAlert,
    classifyAlertDeliveryEvent,
    buildRuntimeHealthAlertDelivery,
    renderMarkdown,
  },
};
