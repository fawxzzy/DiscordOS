const {
  _internals: computaInternals,
} = require("./discordos-computa-runtime");

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function mustGetValue(value, label) {
  if (!hasValue(value)) {
    throw new Error(`Missing required value: ${label}`);
  }
  return value.trim();
}

async function main() {
  const applicationId = mustGetValue(
    computaInternals.resolveApplicationId(process.env),
    "DISCORDOS application id",
  );
  const botToken = mustGetValue(
    computaInternals.resolveBotToken(process.env),
    "DISCORDOS bot token",
  );
  const guildId = mustGetValue(
    computaInternals.resolveGuildId(process.env),
    "DISCORDOS guild id",
  );

  const response = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        authorization: `Bot ${botToken}`,
        "content-type": "application/json",
        "user-agent": "discordos-computa-runtime/1.0",
      },
      body: JSON.stringify(computaInternals.buildGuildCommandsDefinition()),
    },
  );

  const text = await response.text();
  const body = hasValue(text) ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Discord command registration failed (${response.status}): ${body?.message || response.statusText}`);
  }

  const count = Array.isArray(body) ? body.length : 0;
  console.log(`Registered ${count} DiscordOS Computa guild command${count === 1 ? "" : "s"}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
