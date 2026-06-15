const {
  _internals: updatePostInternals,
} = require("./discord-update-post");

const PROVISION_ENV = "DISCORDOS_TESTING_SURFACE_PROVISION";
const PROVISION_ENV_VALUE = "enabled";
const DEFAULT_CATEGORY_NAME = "testing";
const DEFAULT_CHANNEL_NAME = "discordos-testing";

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
    guildId: null,
    categoryName: DEFAULT_CATEGORY_NAME,
    channelName: DEFAULT_CHANNEL_NAME,
    allowProvision: false,
    apply: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--guild-id") {
      options.guildId = readValue(args, index, "missing_guild_id_value");
      index += 1;
    } else if (arg === "--category-name") {
      options.categoryName = readValue(args, index, "missing_category_name_value");
      index += 1;
    } else if (arg === "--channel-name") {
      options.channelName = readValue(args, index, "missing_channel_name_value");
      index += 1;
    } else if (arg === "--allow-provision") {
      options.allowProvision = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveProvisionAdmission({ allowProvision, env }) {
  const envEnabled = env?.[PROVISION_ENV] === PROVISION_ENV_VALUE;
  if (!allowProvision && !envEnabled) {
    return {
      requested: false,
      admitted: false,
      status: "provision_guard_not_requested",
      reasonCodes: [],
    };
  }
  if (allowProvision && envEnabled) {
    return {
      requested: true,
      admitted: true,
      status: "provision_admitted",
      reasonCodes: [],
    };
  }
  return {
    requested: true,
    admitted: false,
    status: "blocked",
    reasonCodes: ["testing_surface_double_guard_missing"],
  };
}

function summarizeChannel(channel) {
  if (!channel) {
    return null;
  }
  return {
    id: channel.id || null,
    name: channel.name || null,
    type: channel.type,
    parentId: channel.parent_id || null,
  };
}

function findTestingCategory(channels, categoryName = DEFAULT_CATEGORY_NAME) {
  const expected = normalizeName(categoryName);
  return channels.find((channel) =>
    channel?.type === 4 && normalizeName(channel.name) === expected
  ) || null;
}

function findTestingChannel(channels, channelName = DEFAULT_CHANNEL_NAME, category = null) {
  const expected = normalizeName(channelName);
  return channels.find((channel) =>
    channel?.type === 0
      && normalizeName(channel.name) === expected
      && (!category || channel.parent_id === category.id)
  ) || null;
}

async function discordRequest({ path, token, method = "GET", body = null, fetchImpl = fetch }) {
  const response = await fetchImpl(`${updatePostInternals.DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = typeof response.json === "function" ? await response.json().catch(() => null) : null;
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function fetchGuildChannels({ guildId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/guilds/${guildId}/channels`,
    token,
    fetchImpl,
  });
}

async function createGuildChannel({ guildId, token, payload, fetchImpl = fetch }) {
  return discordRequest({
    path: `/guilds/${guildId}/channels`,
    token,
    method: "POST",
    body: payload,
    fetchImpl,
  });
}

async function buildTestingSurfaceProvision({
  env = process.env,
  fetchImpl = fetch,
  guildId = null,
  categoryName = DEFAULT_CATEGORY_NAME,
  channelName = DEFAULT_CHANNEL_NAME,
  allowProvision = false,
  apply = false,
} = {}) {
  const resolvedGuildId = guildId || env.DISCORDOS_GUILD_ID || null;
  const token = env.DISCORDOS_BOT_TOKEN || null;
  const admission = resolveProvisionAdmission({ allowProvision, env });
  const reasonCodes = [...admission.reasonCodes];

  if (!hasValue(resolvedGuildId)) {
    reasonCodes.push("guild_id_missing");
  }
  if (!hasValue(token) && apply) {
    reasonCodes.push("bot_token_missing");
  }

  let channelState = {
    fetched: false,
    category: null,
    channel: hasValue(env.DISCORDOS_TESTING_CHANNEL_ID)
      ? { id: env.DISCORDOS_TESTING_CHANNEL_ID.trim(), name: null, type: 0, parentId: null }
      : null,
    createdCategory: false,
    createdChannel: false,
  };

  if (apply && reasonCodes.length === 0 && admission.admitted) {
    const fetched = await fetchGuildChannels({
      guildId: resolvedGuildId,
      token,
      fetchImpl,
    });
    if (!fetched.ok || !Array.isArray(fetched.payload)) {
      reasonCodes.push("guild_channels_fetch_failed");
    } else {
      channelState.fetched = true;
      let category = findTestingCategory(fetched.payload, categoryName);
      if (!category) {
        const created = await createGuildChannel({
          guildId: resolvedGuildId,
          token,
          payload: {
            name: categoryName,
            type: 4,
          },
          fetchImpl,
        });
        if (!created.ok) {
          reasonCodes.push("testing_category_create_failed");
        } else {
          category = created.payload;
          channelState.createdCategory = true;
        }
      }

      let channel = findTestingChannel(fetched.payload, channelName, category);
      if (!channel && category) {
        const created = await createGuildChannel({
          guildId: resolvedGuildId,
          token,
          payload: {
            name: channelName,
            type: 0,
            parent_id: category.id,
          },
          fetchImpl,
        });
        if (!created.ok) {
          reasonCodes.push("testing_channel_create_failed");
        } else {
          channel = created.payload;
          channelState.createdChannel = true;
        }
      }

      channelState = {
        ...channelState,
        category: summarizeChannel(category),
        channel: summarizeChannel(channel),
      };
    }
  }

  const result = {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    callsDiscordApi: apply && admission.admitted,
    status: reasonCodes.length === 0
      ? apply
        ? "testing_surface_ready"
        : "dry_run"
      : "blocked",
    guildId: resolvedGuildId,
    categoryName,
    channelName,
    admission,
    channelState,
    testingChannelId: channelState.channel?.id || null,
    reasonCodes: [...new Set(reasonCodes)],
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.testing_surface.provision_ready"
        : "discordos.testing_surface.provision_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.testing_surface",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        callsDiscordApi: result.callsDiscordApi,
        createdChannel: result.channelState.createdChannel,
      },
    },
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Testing Surface Provision",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- calls Discord API: \`${result.callsDiscordApi ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- category: \`${result.channelState.category?.name || result.categoryName}\``,
    `- channel: \`${result.channelState.channel?.name || result.channelName}\``,
    `- testing channel id: \`${result.testingChannelId || "none"}\``,
    `- created category: \`${result.channelState.createdCategory ? "true" : "false"}\``,
    `- created channel: \`${result.channelState.createdChannel ? "true" : "false"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildTestingSurfaceProvision(options);
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
    PROVISION_ENV,
    PROVISION_ENV_VALUE,
    DEFAULT_CATEGORY_NAME,
    DEFAULT_CHANNEL_NAME,
    parseArgs,
    hasValue,
    normalizeName,
    resolveProvisionAdmission,
    summarizeChannel,
    findTestingCategory,
    findTestingChannel,
    discordRequest,
    fetchGuildChannels,
    createGuildChannel,
    buildTestingSurfaceProvision,
    renderMarkdown,
  },
};
