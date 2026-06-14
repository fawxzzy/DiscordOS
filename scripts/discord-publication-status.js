const {
  _internals: updateTargetInternals,
} = require("./discord-update-target-admission");
const {
  _internals: alertTargetInternals,
} = require("./runtime-health-alert-target-admission");

const TOOLCHAIN_COMMANDS = [
  "ops:discord:update-draft-validator",
  "ops:discord:update-release-check",
  "ops:discord:update-preflight",
  "ops:discord:update-post",
  "ops:discord:forum-card-preflight",
  "ops:discord:forum-card-lifecycle",
  "ops:discord:forum-card-release-check",
  "ops:discord:update-lookup",
  "ops:discord:update-target-admission",
  "ops:runtime-health:alert-target-admission",
];

function parseArgs(args) {
  const options = {
    json: false,
    probeLive: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--probe-live") {
      options.probeLive = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return updateTargetInternals.normalizeEnvValue(value).length > 0;
}

function classifyToolchain() {
  return {
    ok: true,
    status: "ready",
    commands: TOOLCHAIN_COMMANDS,
    draftValidator: "available",
    releaseCheck: "available",
    noSendPreflight: "available",
    applyGuard: "enforced",
    forumCardPreflight: "available",
    forumCardLifecycle: "available",
    forumCardReleaseCheck: "available",
    lookupBackfill: "available",
    reasonCodes: [],
  };
}

function classifyChannelSeparation(env = process.env) {
  const updatesChannelPresent = hasValue(env.DISCORDOS_UPDATES_CHANNEL_ID);
  const alertBotChannelPresent = hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID);
  const alertWebhookPresent = hasValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL);
  const reasonCodes = [];

  if (
    updatesChannelPresent
    && alertBotChannelPresent
    && updateTargetInternals.normalizeEnvValue(env.DISCORDOS_UPDATES_CHANNEL_ID)
      === updateTargetInternals.normalizeEnvValue(env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID)
  ) {
    reasonCodes.push("updates_alerts_channel_collision");
  }

  return {
    ok: reasonCodes.length === 0,
    status: reasonCodes.length === 0 ? "separated" : "blocked",
    updatesTargetPresent: updatesChannelPresent,
    alertBotChannelPresent,
    alertWebhookPresent,
    alertTargetMode: alertWebhookPresent
      ? "discord_webhook"
      : alertBotChannelPresent
        ? "discord_bot_channel"
        : "none",
    reasonCodes,
  };
}

function classifyPublicationStatusEvent(result) {
  return {
    type: result.ok
      ? "discordos.publication.status_ready"
      : "discordos.publication.status_blocked",
    severity: result.ok ? "info" : "error",
    subject: "discordos.publication",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      probeLive: result.probeLive,
      toolchainStatus: result.toolchain.status,
      updatesTargetStatus: result.updatesTarget.ok ? "pass" : "fail",
      alertsTargetStatus: result.alertsTarget.ok ? "pass" : "fail",
      channelSeparationStatus: result.channelSeparation.status,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

async function buildDiscordPublicationStatus({
  env = process.env,
  probeLive = false,
  fetchImpl = fetch,
} = {}) {
  const toolchain = classifyToolchain();
  const updatesTarget = await updateTargetInternals.buildDiscordUpdateTargetAdmission({
    env,
    probeLive,
    fetchImpl,
  });
  const alertsTarget = await alertTargetInternals.buildRuntimeHealthAlertTargetAdmission({
    env,
    probeLive,
    fetchImpl,
  });
  const channelSeparation = classifyChannelSeparation(env);
  const reasonCodes = [
    ...toolchain.reasonCodes,
    ...channelSeparation.reasonCodes,
    ...(probeLive ? updatesTarget.reasonCodes : []),
    ...(probeLive ? alertsTarget.reasonCodes : []),
  ];
  const ok = toolchain.ok
    && channelSeparation.ok
    && (!probeLive || (updatesTarget.ok && alertsTarget.ok));
  const result = {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    probeLive,
    status: ok ? "ready" : "blocked",
    toolchain,
    updatesTarget,
    alertsTarget,
    channelSeparation,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyPublicationStatusEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Publication Status",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- probe live: \`${result.probeLive ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- toolchain status: \`${result.toolchain.status}\``,
    `- draft validator: \`${result.toolchain.draftValidator}\``,
    `- release check: \`${result.toolchain.releaseCheck}\``,
    `- no-send preflight: \`${result.toolchain.noSendPreflight}\``,
    `- apply guard: \`${result.toolchain.applyGuard}\``,
    `- forum/card preflight: \`${result.toolchain.forumCardPreflight}\``,
    `- forum/card lifecycle: \`${result.toolchain.forumCardLifecycle}\``,
    `- forum/card release check: \`${result.toolchain.forumCardReleaseCheck}\``,
    `- lookup backfill: \`${result.toolchain.lookupBackfill}\``,
    `- updates target configured: \`${result.updatesTarget.target.configured ? "true" : "false"}\``,
    `- updates target live status: \`${result.updatesTarget.liveProbe.status}\``,
    `- alerts target type: \`${result.alertsTarget.target.type}\``,
    `- alerts target configured: \`${result.alertsTarget.target.configured ? "true" : "false"}\``,
    `- alerts target live status: \`${result.alertsTarget.liveProbe.status}\``,
    `- channel separation: \`${result.channelSeparation.status}\``,
    `- alert target mode: \`${result.channelSeparation.alertTargetMode}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  if (result.updatesTarget.liveProbe.channel?.name) {
    lines.push(`- updates channel name: \`${result.updatesTarget.liveProbe.channel.name}\``);
  }
  if (typeof result.updatesTarget.liveProbe.httpStatus === "number") {
    lines.push(`- updates target http status: \`${result.updatesTarget.liveProbe.httpStatus}\``);
  }
  if (typeof result.alertsTarget.liveProbe.httpStatus === "number") {
    lines.push(`- alerts target http status: \`${result.alertsTarget.liveProbe.httpStatus}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildDiscordPublicationStatus(options);
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
    TOOLCHAIN_COMMANDS,
    parseArgs,
    hasValue,
    classifyToolchain,
    classifyChannelSeparation,
    classifyPublicationStatusEvent,
    buildDiscordPublicationStatus,
    renderMarkdown,
  },
};
