const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_SURFACES_PATH = path.resolve(process.cwd(), "config", "discordos-no-slash-workflow-surfaces.json");
const REQUIRED_SURFACES = new Set(["music_sesh", "board", "moderation"]);
const ALLOWED_INTERACTION_TYPES = new Set(["MESSAGE_COMPONENT", "MESSAGE_CREATE"]);

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
    surfacesPath: DEFAULT_SURFACES_PATH,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--surfaces") {
      options.surfacesPath = path.resolve(readValue(args, index, "missing_surfaces_value"));
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

async function readSurfaces(surfacesPath = DEFAULT_SURFACES_PATH, fsImpl = fs) {
  return JSON.parse(await fsImpl.readFile(surfacesPath, "utf8"));
}

function classifySurface(surface) {
  const reasonCodes = [];
  if (!REQUIRED_SURFACES.has(surface?.id)) {
    reasonCodes.push("surface_id_not_admitted");
  }
  if (surface?.slashCommandSurface !== null) {
    reasonCodes.push("slash_command_surface_present");
  }
  if (typeof surface?.postButtonSurface !== "string" || !surface.postButtonSurface.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("post_button_surface_missing");
  }
  if (typeof surface?.chatMessageSurface !== "string" || !surface.chatMessageSurface.startsWith("npm run ops:discordos:")) {
    reasonCodes.push("chat_message_surface_missing");
  }

  return {
    ok: reasonCodes.length === 0,
    id: surface?.id || null,
    label: surface?.label || null,
    postButtonSurface: surface?.postButtonSurface || null,
    chatMessageSurface: surface?.chatMessageSurface || null,
    slashCommandSurface: surface?.slashCommandSurface ?? null,
    reasonCodes,
  };
}

function buildNoSlashWorkflowSurfaceModel(config = {}) {
  const reasonCodes = [];
  if (config.version !== 1) {
    reasonCodes.push("surface_config_version_invalid");
  }
  if (config.slashCommandsAllowed !== false) {
    reasonCodes.push("slash_commands_not_disabled");
  }

  const interactionTypes = Array.isArray(config.allowedInteractionTypes)
    ? config.allowedInteractionTypes
    : [];
  if (interactionTypes.length === 0 || interactionTypes.some((type) => !ALLOWED_INTERACTION_TYPES.has(type))) {
    reasonCodes.push("interaction_type_not_admitted");
  }

  const surfaces = Array.isArray(config.surfaces) ? config.surfaces.map(classifySurface) : [];
  if (surfaces.length === 0) {
    reasonCodes.push("surfaces_missing");
  }
  for (const required of REQUIRED_SURFACES) {
    if (!surfaces.some((surface) => surface.id === required)) {
      reasonCodes.push(`surface_missing:${required}`);
    }
  }
  reasonCodes.push(...surfaces.flatMap((surface) => surface.reasonCodes));

  return {
    ok: reasonCodes.length === 0,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    slashCommandsAllowed: config.slashCommandsAllowed === false ? false : Boolean(config.slashCommandsAllowed),
    allowedInteractionTypes: interactionTypes,
    surfaceCount: surfaces.length,
    noSlashSurfaceCount: surfaces.filter((surface) => surface.slashCommandSurface === null).length,
    surfaces,
    reasonCodes: [...new Set(reasonCodes)],
  };
}

async function buildNoSlashWorkflowSurfaces({
  surfacesPath = DEFAULT_SURFACES_PATH,
  fsImpl = fs,
} = {}) {
  const config = await readSurfaces(surfacesPath, fsImpl);
  const model = buildNoSlashWorkflowSurfaceModel(config);
  const result = {
    ...model,
    status: model.ok ? "no_slash_surfaces_ready" : "blocked",
  };

  return {
    ...result,
    event: {
      type: result.ok
        ? "discordos.no_slash_workflow_surfaces_ready"
        : "discordos.no_slash_workflow_surfaces_blocked",
      severity: result.ok ? "info" : "warning",
      subject: "discordos.no_slash_workflow_surfaces",
      status: result.ok ? "pass" : "fail",
      dimensions: {
        surfaceCount: result.surfaceCount,
        noSlashSurfaceCount: result.noSlashSurfaceCount,
      },
    },
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS No-Slash Workflow Surfaces",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- slash commands allowed: \`${result.slashCommandsAllowed ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- surfaces: \`${result.surfaceCount}\``,
    `- no-slash surfaces: \`${result.noSlashSurfaceCount}\``,
    `- interaction types: \`${result.allowedInteractionTypes.join(",")}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
  ];

  for (const surface of result.surfaces) {
    lines.push(`- surface ${surface.id}: post \`${surface.postButtonSurface}\`, chat \`${surface.chatMessageSurface}\``);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildNoSlashWorkflowSurfaces(options);
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
    DEFAULT_SURFACES_PATH,
    REQUIRED_SURFACES,
    ALLOWED_INTERACTION_TYPES,
    parseArgs,
    classifySurface,
    buildNoSlashWorkflowSurfaceModel,
    buildNoSlashWorkflowSurfaces,
    renderMarkdown,
  },
};
