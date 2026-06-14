const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _internals: notificationRouterInternals } = require("./discordos-notification-router");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const CRITICAL_EMBED_COLOR = 14233637;
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "..", "config", "atlas-health-targets.json");
const DEFAULT_SUPPRESSION_DIR = path.join(os.tmpdir(), "discordos-atlas-health-watch");
const DEFAULT_TIMEOUT_MS = 8000;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_ALIASES = {
  "0": "sunday",
  "7": "sunday",
  sun: "sunday",
  sunday: "sunday",
  "1": "monday",
  mon: "monday",
  monday: "monday",
  "2": "tuesday",
  tue: "tuesday",
  tuesday: "tuesday",
  "3": "wednesday",
  wed: "wednesday",
  wednesday: "wednesday",
  "4": "thursday",
  thu: "thursday",
  thursday: "thursday",
  "5": "friday",
  fri: "friday",
  friday: "friday",
  "6": "saturday",
  sat: "saturday",
  saturday: "saturday",
};

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

function parseTargetIdList(value) {
  if (!hasValue(value)) {
    return [];
  }

  return [...new Set(String(value)
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean))];
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

function normalizeDayToken(value) {
  const key = String(value || "").trim().toLowerCase();
  return DAY_ALIASES[key] || null;
}

function expandDayRange(start, end) {
  const startDay = normalizeDayToken(start);
  const endDay = normalizeDayToken(end);
  if (!startDay || !endDay) {
    return [];
  }

  const startIndex = DAY_NAMES.indexOf(startDay);
  const endIndex = DAY_NAMES.indexOf(endDay);
  if (startIndex <= endIndex) {
    return DAY_NAMES.slice(startIndex, endIndex + 1);
  }
  return [...DAY_NAMES.slice(startIndex), ...DAY_NAMES.slice(0, endIndex + 1)];
}

function normalizeRunDays(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const runDays = [];
  for (const entry of value) {
    const day = normalizeDayToken(entry);
    if (day && !runDays.includes(day)) {
      runDays.push(day);
    }
  }

  return runDays.length > 0 ? runDays : null;
}

function runDaysFromCron(cron) {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5 || !parts[4] || parts[4] === "*") {
    return null;
  }

  const runDays = [];
  for (const token of parts[4].split(",")) {
    const cleaned = token.trim();
    if (!cleaned) {
      continue;
    }
    const rangeMatch = cleaned.match(/^([a-z0-9]+)-([a-z0-9]+)$/i);
    const days = rangeMatch
      ? expandDayRange(rangeMatch[1], rangeMatch[2])
      : [normalizeDayToken(cleaned)].filter(Boolean);
    for (const day of days) {
      if (!runDays.includes(day)) {
        runDays.push(day);
      }
    }
  }

  return runDays.length > 0 ? runDays : null;
}

function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") {
    return null;
  }

  const cron = typeof schedule.cron === "string" && schedule.cron.trim()
    ? schedule.cron.trim()
    : null;
  const timezone = typeof schedule.timezone === "string" && schedule.timezone.trim()
    ? schedule.timezone.trim()
    : "UTC";
  const runDays = normalizeRunDays(schedule.runDays)
    || normalizeRunDays(schedule.daysOfWeek)
    || runDaysFromCron(cron);

  return {
    ...schedule,
    cron,
    timezone,
    runDays,
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
    schedule: normalizeSchedule(config?.schedule),
    targets,
  };
}

function applyTargetFilters(config, env = process.env) {
  const allowlistIds = parseTargetIdList(env.DISCORDOS_ATLAS_HEALTH_TARGET_ALLOWLIST);
  const excludeIds = parseTargetIdList(env.DISCORDOS_ATLAS_HEALTH_TARGET_EXCLUDE);
  const active = allowlistIds.length > 0 || excludeIds.length > 0;
  const availableIds = new Set(config.targets.map((target) => target.id));
  const unknownAllowlistIds = allowlistIds.filter((id) => !availableIds.has(id));
  const unknownExcludeIds = excludeIds.filter((id) => !availableIds.has(id));

  if (unknownAllowlistIds.length > 0) {
    throw new Error(`unknown_atlas_health_target_allowlist_id:${unknownAllowlistIds.join(",")}`);
  }
  if (unknownExcludeIds.length > 0) {
    throw new Error(`unknown_atlas_health_target_exclude_id:${unknownExcludeIds.join(",")}`);
  }

  const allowlist = new Set(allowlistIds);
  const exclude = new Set(excludeIds);
  const targets = config.targets.filter((target) => {
    if (allowlist.size > 0 && !allowlist.has(target.id)) {
      return false;
    }
    return !exclude.has(target.id);
  });

  if (targets.length === 0) {
    throw new Error("atlas_health_targets_empty_after_filter");
  }

  return {
    ...config,
    targets,
    targetFilter: {
      active,
      originalTargetCount: config.targets.length,
      targetCount: targets.length,
      allowlistIds,
      excludeIds,
      reasonCodes: active ? ["atlas_health_target_filter_active"] : [],
    },
  };
}

async function loadConfig({ configPath = DEFAULT_CONFIG_PATH, env = process.env, fsImpl = fs } = {}) {
  let config;
  if (hasValue(env.DISCORDOS_ATLAS_HEALTH_TARGETS_JSON)) {
    config = normalizeConfig(JSON.parse(env.DISCORDOS_ATLAS_HEALTH_TARGETS_JSON));
  } else {
    const raw = await fsImpl.readFile(configPath, "utf8");
    config = normalizeConfig(JSON.parse(raw));
  }

  return applyTargetFilters(config, env);
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

function atlasHealthEventType(result) {
  if (typeof result?.event?.type === "string" && result.event.type.trim()) {
    return result.event.type;
  }
  return classifyAtlasHealthEvent(result).type;
}

function getScheduleDayName(schedule, now = new Date()) {
  const timezone = schedule?.timezone || "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(now).toLowerCase();
  } catch (_error) {
    return DAY_NAMES[now.getUTCDay()];
  }
}

function isScheduleDue(schedule, now = new Date()) {
  const normalized = normalizeSchedule(schedule);
  if (!normalized?.runDays?.length) {
    return true;
  }

  return normalized.runDays.includes(getScheduleDayName(normalized, now));
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
  const runDays = runDaysFromCron(cron);
  const daysPerWeek = runDays?.length || 7;
  return Math.max(1, Math.round(dailyRuns * 30 * (daysPerWeek / 7)));
}

function buildUsageEstimate(config, targetCount) {
  const runsPerMonth = estimateRunsPerMonthFromCron(config.schedule?.cron);
  return {
    configuredSchedule: config.schedule?.cron || null,
    runDays: config.schedule?.runDays || null,
    timezone: config.schedule?.timezone || null,
    runsPerMonth,
    targetChecksPerMonth: targetCount * runsPerMonth,
    targetFilterActive: config.targetFilter?.active === true,
    originalTargetCount: config.targetFilter?.originalTargetCount ?? targetCount,
    discordPosts: "0 unless a critical target fails",
  };
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
  notificationRouter = notificationRouterInternals,
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

  const routeDecision = await notificationRouter.buildNotificationRouteDecision({
    source: "atlas-health",
    type: atlasHealthEventType(result),
    severity: "critical",
  });
  const notificationRoute = {
    ok: routeDecision.ok,
    status: routeDecision.routeDecision.status,
    routeId: routeDecision.route?.id || null,
    target: routeDecision.route?.target || null,
    targetEnv: routeDecision.route?.targetEnv || null,
    fallbackTargetEnv: routeDecision.route?.fallbackTargetEnv || null,
    reasonCodes: routeDecision.reasonCodes,
  };

  if (!routeDecision.ok) {
    return {
      ok: false,
      enabled: send,
      status: "blocked",
      targetType: target.type,
      sent: false,
      notificationRoute,
      reasonCodes: ["notification_route_not_admitted", ...routeDecision.reasonCodes],
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
      notificationRoute,
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
      notificationRoute,
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
      notificationRoute,
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
    notificationRoute,
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
  notificationRouter = notificationRouterInternals,
} = {}) {
  const config = await loadConfig({ configPath, env, fsImpl });
  const usageEstimate = buildUsageEstimate(config, config.targets.length);
  if (!isScheduleDue(config.schedule, now)) {
    const result = {
      ok: true,
      generatedAt: now.toISOString(),
      destructive: false,
      sendsMessages: false,
      writesArtifacts: false,
      skipped: true,
      skipReason: "atlas_health_schedule_not_due",
      targetCount: config.targets.length,
      passCount: 0,
      failCount: 0,
      criticalCount: 0,
      criticalTargets: [],
      checks: [],
      targetFilter: config.targetFilter,
      usageEstimate,
    };

    return {
      ...result,
      event: classifyAtlasHealthEvent(result),
      alertDelivery: {
        ok: true,
        enabled: send,
        status: "skipped_schedule",
        targetType: getAlertTarget(env).type,
        sent: false,
        reasonCodes: ["atlas_health_schedule_not_due"],
      },
    };
  }

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
    targetFilter: config.targetFilter,
    usageEstimate: {
      ...usageEstimate,
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
    notificationRouter,
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
    `- target filter active: \`${result.targetFilter?.active === true ? "true" : "false"}\``,
    `- original targets: \`${result.targetFilter?.originalTargetCount ?? result.targetCount}\``,
    `- passing: \`${result.passCount}\``,
    `- failing: \`${result.failCount}\``,
    `- critical: \`${result.criticalCount}\``,
    `- delivery status: \`${result.alertDelivery.status}\``,
    `- delivery target type: \`${result.alertDelivery.targetType}\``,
    `- notification route: \`${result.alertDelivery.notificationRoute?.routeId || "none"}\``,
    `- notification route target: \`${result.alertDelivery.notificationRoute?.target || "none"}\``,
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
    parseTargetIdList,
    normalizeTarget,
    normalizeDayToken,
    runDaysFromCron,
    normalizeSchedule,
    normalizeConfig,
    applyTargetFilters,
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
    atlasHealthEventType,
    isScheduleDue,
    estimateRunsPerMonthFromCron,
    buildUsageEstimate,
    buildDiscordAlertPayload,
    sendDiscordWebhook,
    sendDiscordBotChannel,
    deliverAtlasHealthAlert,
    buildAtlasHealthWatch,
    renderMarkdown,
  },
};
