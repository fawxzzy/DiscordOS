const {
  _internals: reviewInternals,
} = require("../scripts/discordos-interaction-reliability-review");

function runtimeIdentity(env = process.env) {
  return {
    sourceRevision: env.VERCEL_GIT_COMMIT_SHA || "UNKNOWN",
    deploymentId: env.VERCEL_DEPLOYMENT_ID || null,
    runtimeUrl: env.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : "https://fawxzzy-discordos.vercel.app",
    environment: env.VERCEL_ENV || "local",
  };
}

module.exports = async function interactionReliabilityReview(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-DiscordOS-Canary", "interaction-reliability-review-v1");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  const review = reviewInternals.buildInteractionReliabilityReview(runtimeIdentity());
  res.setHeader("X-DiscordOS-Review-Id", review.reviewId);
  res.setHeader("X-DiscordOS-Review-Digest", review.reviewDigest);
  return res.status(review.ok ? 200 : 409).json(review);
};

module.exports._internals = {
  runtimeIdentity,
};
