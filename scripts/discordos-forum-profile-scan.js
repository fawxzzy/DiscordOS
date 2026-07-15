const fs = require("node:fs/promises");
const path = require("node:path");
const {
  _internals: forumProfile,
} = require("./discordos-forum-profile");

const DEFAULT_BOARD_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-board-registry.json");
const DEFAULT_PROFILE_REGISTRY_PATH = path.resolve(__dirname, "..", "config", "discordos-forum-profile-registry.json");

function readValue(args, index, code) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(code);
  return value.trim();
}

function parseArgs(args) {
  const options = {
    boardRegistryPath: DEFAULT_BOARD_REGISTRY_PATH,
    profileRegistryPath: DEFAULT_PROFILE_REGISTRY_PATH,
    outputPath: null,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--registry") {
      options.boardRegistryPath = path.resolve(readValue(args, index, "missing_registry_path"));
      index += 1;
    } else if (arg === "--profiles") {
      options.profileRegistryPath = path.resolve(readValue(args, index, "missing_profiles_path"));
      index += 1;
    } else if (arg === "--output") {
      options.outputPath = path.resolve(readValue(args, index, "missing_output_path"));
      index += 1;
    } else if (arg === "--json") options.json = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!options.outputPath) throw new Error("output_path_missing");
  return options;
}

function renderMarkdown(receipt) {
  return [
    "# DiscordOS Forum Profile Scan",
    "",
    `- status: \`${receipt.status}\``,
    `- coverage: \`${receipt.denominator.coverageStatus}\``,
    `- boards: \`${receipt.denominator.inspectedBoardCount}/${receipt.denominator.requiredBoardCount}\``,
    `- uncovered: \`${receipt.denominator.uncoveredBoardCount}\``,
    `- current cards: \`${receipt.cards.currentCardCount}\``,
    `- healthy cards: \`${receipt.cards.healthyCardCount}\``,
    `- drifted cards: \`${receipt.cards.driftedCardCount}\``,
    `- reason codes: \`${receipt.reasonCodes.join(",") || "none"}\``,
    "- Discord mutation: `false`",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [boardRegistry, profileRegistry] = await Promise.all([
    forumProfile.readJson(options.boardRegistryPath),
    forumProfile.readJson(options.profileRegistryPath),
  ]);
  const { receipt } = await forumProfile.buildLiveForumProfileScan({ boardRegistry, profileRegistry });
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, json, "utf8");
  process.stdout.write(options.json ? json : renderMarkdown(receipt));
  process.exitCode = receipt.ok ? 0 : 1;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

module.exports = {
  _internals: {
    DEFAULT_BOARD_REGISTRY_PATH,
    DEFAULT_PROFILE_REGISTRY_PATH,
    parseArgs,
    renderMarkdown,
  },
};
