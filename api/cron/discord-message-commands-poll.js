const {
  _internals: computaInternals,
} = require("../../scripts/discordos-computa-runtime");

module.exports = async function cronDiscordMessageCommandsPoll(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const result = await computaInternals.buildDiscordMessageCommandPollResponse({
    headers: req.headers,
  });

  return res.status(result.statusCode).json(result.body);
};

module.exports._internals = {
  buildDiscordMessageCommandPollResponse: computaInternals.buildDiscordMessageCommandPollResponse,
};
