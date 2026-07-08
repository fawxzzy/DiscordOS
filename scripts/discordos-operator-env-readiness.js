const {
  _internals: updateTargetInternals,
} = require("./discord-update-target-admission");
const {
  _internals: alertTargetInternals,
} = require("./runtime-health-alert-target-admission");

function parseArgs(args) {
  const options = {
    json: false,
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function classifyChannelId(value, missingReason, invalidReason) {
  const present = updateTargetInternals.hasValue(value);
  const shapeValid = updateTargetInternals.isSnowflake(value);
  const reasonCodes = [];

  if (!present) {
    reasonCodes.push(missingReason);
  } else if (!shapeValid) {
    reasonCodes.push(invalidReason);
  }

  return {
    present,
    shapeValid,
    reasonCodes,
  };
}

function classifySecretPresence(value, missingReason) {
  const present = updateTargetInternals.hasValue(value);
  return {
    present,
    reasonCodes: present ? [] : [missingReason],
  };
}

function classifyHttpsUrl(value, missingReason, invalidReason) {
  const present = updateTargetInternals.hasValue(value);
  let shapeValid = false;
  if (present) {
    try {
      const parsed = new URL(String(value).trim());
      shapeValid = parsed.protocol === "https:";
    } catch {
      shapeValid = false;
    }
  }

  return {
    present,
    shapeValid,
    reasonCodes: !present ? [missingReason] : shapeValid ? [] : [invalidReason],
  };
}

function classifyOptionalChannelId(value, invalidReason) {
  const present = updateTargetInternals.hasValue(value);
  const shapeValid = !present || updateTargetInternals.isSnowflake(value);
  return {
    present,
    shapeValid,
    reasonCodes: shapeValid ? [] : [invalidReason],
  };
}

function classifyOptionalMemberLinkConfig(env = process.env) {
  const url = classifyHttpsUrl(
    env.DISCORDOS_MEMBER_LINK_SUPABASE_URL || env.DISCORDOS_SUPABASE_URL,
    "discord_member_link_supabase_url_missing",
    "discord_member_link_supabase_url_shape_invalid"
  );
  const serviceRole = classifySecretPresence(
    env.DISCORDOS_MEMBER_LINK_SUPABASE_SERVICE_ROLE_KEY || env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY,
    "discord_member_link_service_role_missing"
  );
  const anyPresent = url.present || serviceRole.present;
  const ready = !anyPresent || (url.shapeValid && serviceRole.present);

  return {
    configured: anyPresent,
    ready,
    supabaseUrlPresent: url.present,
    supabaseUrlShapeValid: !url.present || url.shapeValid,
    serviceRolePresent: serviceRole.present,
    reasonCodes: ready ? [] : [
      ...(url.present && !url.shapeValid ? url.reasonCodes : []),
      ...(url.present ? [] : ["discord_member_link_supabase_url_missing"]),
      ...(serviceRole.present ? [] : serviceRole.reasonCodes),
    ],
  };
}

function classifyOperatorEnvReadiness(env = process.env) {
  const updatesChannel = classifyChannelId(
    env.DISCORDOS_UPDATES_CHANNEL_ID,
    "updates_channel_id_missing",
    "updates_channel_id_shape_invalid"
  );
  const alertChannel = classifyChannelId(
    env.DISCORDOS_RUNTIME_HEALTH_ALERT_CHANNEL_ID,
    "alert_channel_id_missing",
    "alert_channel_id_shape_invalid"
  );
  const botToken = classifySecretPresence(env.DISCORDOS_BOT_TOKEN, "bot_token_missing");
  const alertWebhook = alertTargetInternals.classifyWebhookUrl(
    env.DISCORDOS_RUNTIME_HEALTH_ALERT_WEBHOOK_URL
  );
  const fitnessVerifyEndpoint = classifyHttpsUrl(
    env.DISCORDOS_FITNESS_VERIFY_ENDPOINT || env.FITNESS_DISCORD_VERIFY_ENDPOINT,
    "fitness_verify_endpoint_missing",
    "fitness_verify_endpoint_shape_invalid"
  );
  const fitnessVerifySecret = classifySecretPresence(
    env.DISCORDOS_FITNESS_VERIFY_SECRET || env.DISCORD_VERIFICATION_BOT_SECRET,
    "fitness_verify_secret_missing"
  );
  const fitnessVerifyVerifiedRole = classifyChannelId(
    env.DISCORDOS_VERIFIED_ROLE_ID || env.DISCORD_VERIFIED_ROLE_ID,
    "fitness_verify_verified_role_id_missing",
    "fitness_verify_verified_role_id_shape_invalid"
  );
  const fitnessVerifyUnverifiedRole = classifyOptionalChannelId(
    env.DISCORDOS_UNVERIFIED_ROLE_ID || env.DISCORD_UNVERIFIED_ROLE_ID,
    "fitness_verify_unverified_role_id_shape_invalid"
  );
  const memberLink = classifyOptionalMemberLinkConfig(env);
  const updatesTargetReady = updatesChannel.shapeValid && botToken.present;
  const alertTargetReady = alertWebhook.shapeValid || (alertChannel.shapeValid && botToken.present);
  const fitnessVerifyReady = fitnessVerifyEndpoint.shapeValid
    && fitnessVerifySecret.present
    && fitnessVerifyVerifiedRole.shapeValid
    && fitnessVerifyUnverifiedRole.shapeValid
    && botToken.present;
  const reasonCodes = [
    ...(updatesTargetReady ? [] : updatesChannel.reasonCodes),
    ...(updatesTargetReady || botToken.present ? [] : botToken.reasonCodes),
    ...(alertTargetReady ? [] : alertWebhook.present ? alertWebhook.reasonCodes : alertChannel.reasonCodes),
    ...(alertTargetReady || alertWebhook.shapeValid || botToken.present ? [] : botToken.reasonCodes),
    ...(fitnessVerifyReady ? [] : fitnessVerifyEndpoint.reasonCodes),
    ...(fitnessVerifyReady || fitnessVerifySecret.present ? [] : fitnessVerifySecret.reasonCodes),
    ...(fitnessVerifyReady ? [] : fitnessVerifyVerifiedRole.reasonCodes),
    ...(fitnessVerifyReady ? [] : fitnessVerifyUnverifiedRole.reasonCodes),
    ...(fitnessVerifyReady || botToken.present ? [] : botToken.reasonCodes),
  ];
  const ok = updatesTargetReady && alertTargetReady && fitnessVerifyReady;

  return {
    ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: ok ? "ready" : "blocked",
    updates: {
      targetReady: updatesTargetReady,
      channelPresent: updatesChannel.present,
      channelShapeValid: updatesChannel.shapeValid,
      botTokenPresent: botToken.present,
    },
    alerts: {
      targetReady: alertTargetReady,
      webhookPresent: alertWebhook.present,
      webhookShapeValid: alertWebhook.shapeValid,
      channelPresent: alertChannel.present,
      channelShapeValid: alertChannel.shapeValid,
      botTokenPresent: botToken.present,
      targetMode: alertWebhook.present ? "discord_webhook" : alertChannel.present ? "discord_bot_channel" : "none",
    },
    fitnessVerify: {
      targetReady: fitnessVerifyReady,
      endpointPresent: fitnessVerifyEndpoint.present,
      endpointShapeValid: fitnessVerifyEndpoint.shapeValid,
      secretPresent: fitnessVerifySecret.present,
      verifiedRolePresent: fitnessVerifyVerifiedRole.present,
      verifiedRoleShapeValid: fitnessVerifyVerifiedRole.shapeValid,
      unverifiedRolePresent: fitnessVerifyUnverifiedRole.present,
      unverifiedRoleShapeValid: fitnessVerifyUnverifiedRole.shapeValid,
      botTokenPresent: botToken.present,
      memberLinkConfigured: memberLink.configured,
      memberLinkReady: memberLink.ready,
      memberLinkSupabaseUrlPresent: memberLink.supabaseUrlPresent,
      memberLinkSupabaseUrlShapeValid: memberLink.supabaseUrlShapeValid,
      memberLinkServiceRolePresent: memberLink.serviceRolePresent,
    },
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function buildReadinessCheck({ id, scope, ready, requiredFor, reasonCodes = [], nextAction }) {
  return {
    id,
    scope,
    ready,
    requiredFor,
    reasonCodes,
    nextAction: ready ? null : nextAction,
  };
}

function buildOperatorEnvReadinessPlan(result) {
  const alertUsesWebhook = result.alerts.webhookPresent;
  const alertUsesBotChannel = !alertUsesWebhook && result.alerts.channelPresent;
  const checks = [
    buildReadinessCheck({
      id: "updates_channel",
      scope: "updates",
      ready: result.updates.channelShapeValid,
      requiredFor: ["updates_probe", "updates_post"],
      reasonCodes: result.updates.channelShapeValid ? [] : result.reasonCodes.filter((code) =>
        code.startsWith("updates_channel_id_")
      ),
      nextAction: "configure_discordos_updates_channel_id",
    }),
    buildReadinessCheck({
      id: "bot_token_for_updates",
      scope: "updates",
      ready: result.updates.botTokenPresent,
      requiredFor: ["updates_probe", "updates_post"],
      reasonCodes: result.updates.botTokenPresent ? [] : ["bot_token_missing"],
      nextAction: "load_discordos_bot_token",
    }),
    buildReadinessCheck({
      id: "alert_target",
      scope: "alerts",
      ready: result.alerts.webhookShapeValid || result.alerts.channelShapeValid,
      requiredFor: ["alert_probe", "critical_alert_delivery"],
      reasonCodes: result.alerts.webhookShapeValid || result.alerts.channelShapeValid
        ? []
        : result.reasonCodes.filter((code) =>
          code.startsWith("alert_channel_id_") || code.startsWith("alert_webhook_")
        ),
      nextAction: "configure_discordos_alert_target",
    }),
    buildReadinessCheck({
      id: "bot_token_for_alert_channel",
      scope: "alerts",
      ready: !alertUsesBotChannel || result.alerts.botTokenPresent,
      requiredFor: ["alert_bot_channel_probe", "critical_alert_delivery"],
      reasonCodes: !alertUsesBotChannel || result.alerts.botTokenPresent ? [] : ["bot_token_missing"],
      nextAction: "load_discordos_bot_token",
    }),
    buildReadinessCheck({
      id: "fitness_verify_endpoint",
      scope: "fitness_verify",
      ready: result.fitnessVerify.endpointShapeValid,
      requiredFor: ["fitness_verify_modal_submit"],
      reasonCodes: result.fitnessVerify.endpointShapeValid
        ? []
        : result.reasonCodes.filter((code) => code.startsWith("fitness_verify_endpoint_")),
      nextAction: "configure_discordos_fitness_verify_endpoint",
    }),
    buildReadinessCheck({
      id: "fitness_verify_secret",
      scope: "fitness_verify",
      ready: result.fitnessVerify.secretPresent,
      requiredFor: ["fitness_verify_modal_submit"],
      reasonCodes: result.fitnessVerify.secretPresent ? [] : ["fitness_verify_secret_missing"],
      nextAction: "load_discordos_fitness_verify_secret",
    }),
    buildReadinessCheck({
      id: "fitness_verify_verified_role",
      scope: "fitness_verify",
      ready: result.fitnessVerify.verifiedRoleShapeValid,
      requiredFor: ["fitness_verify_role_grant"],
      reasonCodes: result.fitnessVerify.verifiedRoleShapeValid
        ? []
        : result.reasonCodes.filter((code) => code.startsWith("fitness_verify_verified_role_id_")),
      nextAction: "configure_discordos_verified_role_id",
    }),
    buildReadinessCheck({
      id: "fitness_verify_unverified_role_optional",
      scope: "fitness_verify",
      ready: result.fitnessVerify.unverifiedRoleShapeValid,
      requiredFor: ["fitness_verify_unverified_role_clear"],
      reasonCodes: result.fitnessVerify.unverifiedRoleShapeValid
        ? []
        : ["fitness_verify_unverified_role_id_shape_invalid"],
      nextAction: "fix_discordos_unverified_role_id_or_leave_unset",
    }),
    buildReadinessCheck({
      id: "fitness_verify_bot_token",
      scope: "fitness_verify",
      ready: result.fitnessVerify.botTokenPresent,
      requiredFor: ["fitness_verify_role_grant", "fitness_verify_nickname_sync"],
      reasonCodes: result.fitnessVerify.botTokenPresent ? [] : ["bot_token_missing"],
      nextAction: "load_discordos_bot_token",
    }),
    buildReadinessCheck({
      id: "discord_member_link_optional_storage",
      scope: "fitness_verify",
      ready: true,
      requiredFor: ["fitness_verify_member_link_optional_write"],
      reasonCodes: [],
      nextAction: null,
    }),
  ];
  const blockedChecks = checks.filter((check) => !check.ready);
  const advisoryChecks = [
    {
      id: "discord_member_link_optional_storage",
      scope: "fitness_verify",
      ready: result.fitnessVerify.memberLinkReady,
      requiredFor: ["fitness_verify_member_link_optional_write"],
      reasonCodes: result.fitnessVerify.memberLinkReady
        ? []
        : result.fitnessVerify.memberLinkConfigured
          ? ["discord_member_link_service_role_missing"]
          : [],
      nextAction: result.fitnessVerify.memberLinkReady || !result.fitnessVerify.memberLinkConfigured
        ? null
        : "configure_discordos_member_link_storage_or_leave_all_member_link_env_unset",
    },
  ];
  const advisoryNextActions = advisoryChecks
    .map((check) => check.nextAction)
    .filter(Boolean);

  return {
    status: blockedChecks.length === 0 ? "ready" : "action_required",
    checks,
    advisoryChecks,
    readyCheckCount: checks.length - blockedChecks.length,
    blockedCheckCount: blockedChecks.length,
    advisoryCheckCount: advisoryChecks.length,
    advisoryActionCount: advisoryNextActions.length,
    liveActionReadiness: {
      updatesProbeReady: result.updates.targetReady,
      updatesPostReady: result.updates.targetReady,
      alertProbeReady: result.alerts.targetReady,
      criticalAlertDeliveryReady: result.alerts.targetReady,
      alertTargetMode: result.alerts.targetMode,
      alertUsesWebhook,
      alertUsesBotChannel,
      fitnessVerifyReady: result.fitnessVerify.targetReady,
      fitnessVerifyMemberLinkReady: result.fitnessVerify.memberLinkReady,
    },
    nextActions: [...new Set(blockedChecks.map((check) => check.nextAction).filter(Boolean))],
    advisoryNextActions: [...new Set(advisoryNextActions)],
  };
}

function classifyOperatorEnvReadinessEvent(result) {
  return {
    type: result.ok
      ? "discordos.operator.env_ready"
      : "discordos.operator.env_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.operator.env",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      updatesTargetReady: result.updates.targetReady,
      alertTargetReady: result.alerts.targetReady,
      fitnessVerifyReady: result.fitnessVerify.targetReady,
      alertTargetMode: result.alerts.targetMode,
      readinessPlanStatus: result.readinessPlan.status,
      blockedCheckCount: result.readinessPlan.blockedCheckCount,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildDiscordOSOperatorEnvReadiness({ env = process.env } = {}) {
  const classified = classifyOperatorEnvReadiness(env);
  const result = {
    ...classified,
    readinessPlan: buildOperatorEnvReadinessPlan(classified),
  };
  return {
    ...result,
    event: classifyOperatorEnvReadinessEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Operator Env Readiness",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- event severity: \`${result.event.severity}\``,
    `- updates target ready: \`${result.updates.targetReady ? "true" : "false"}\``,
    `- updates channel present: \`${result.updates.channelPresent ? "true" : "false"}\``,
    `- updates channel shape valid: \`${result.updates.channelShapeValid ? "true" : "false"}\``,
    `- alerts target ready: \`${result.alerts.targetReady ? "true" : "false"}\``,
    `- alerts target mode: \`${result.alerts.targetMode}\``,
    `- alerts webhook present: \`${result.alerts.webhookPresent ? "true" : "false"}\``,
    `- alerts webhook shape valid: \`${result.alerts.webhookShapeValid ? "true" : "false"}\``,
    `- alerts channel present: \`${result.alerts.channelPresent ? "true" : "false"}\``,
    `- alerts channel shape valid: \`${result.alerts.channelShapeValid ? "true" : "false"}\``,
    `- fitness verify ready: \`${result.fitnessVerify.targetReady ? "true" : "false"}\``,
    `- fitness verify endpoint present: \`${result.fitnessVerify.endpointPresent ? "true" : "false"}\``,
    `- fitness verify endpoint shape valid: \`${result.fitnessVerify.endpointShapeValid ? "true" : "false"}\``,
    `- fitness verify secret present: \`${result.fitnessVerify.secretPresent ? "true" : "false"}\``,
    `- fitness verify verified role present: \`${result.fitnessVerify.verifiedRolePresent ? "true" : "false"}\``,
    `- fitness verify verified role shape valid: \`${result.fitnessVerify.verifiedRoleShapeValid ? "true" : "false"}\``,
    `- fitness verify unverified role present: \`${result.fitnessVerify.unverifiedRolePresent ? "true" : "false"}\``,
    `- fitness verify unverified role shape valid: \`${result.fitnessVerify.unverifiedRoleShapeValid ? "true" : "false"}\``,
    `- discord member link configured: \`${result.fitnessVerify.memberLinkConfigured ? "true" : "false"}\``,
    `- discord member link ready: \`${result.fitnessVerify.memberLinkReady ? "true" : "false"}\``,
    `- bot token present: \`${result.updates.botTokenPresent ? "true" : "false"}\``,
    `- readiness plan: \`${result.readinessPlan.status}\``,
    `- ready checks: \`${result.readinessPlan.readyCheckCount}\``,
    `- blocked checks: \`${result.readinessPlan.blockedCheckCount}\``,
    `- advisory actions: \`${result.readinessPlan.advisoryActionCount}\``,
    `- next actions: \`${result.readinessPlan.nextActions.join(",") || "none"}\``,
    `- advisory next actions: \`${result.readinessPlan.advisoryNextActions.join(",") || "none"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildDiscordOSOperatorEnvReadiness();
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
    classifyChannelId,
    classifySecretPresence,
    classifyOperatorEnvReadiness,
    buildReadinessCheck,
    buildOperatorEnvReadinessPlan,
    classifyOperatorEnvReadinessEvent,
    buildDiscordOSOperatorEnvReadiness,
    renderMarkdown,
  },
};
