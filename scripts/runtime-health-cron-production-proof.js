const DEFAULT_BASE_URL = "https://fawxzzy-discordos.vercel.app";

function parseArgs(args) {
  const options = {
    json: false,
    baseUrl: DEFAULT_BASE_URL,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--base-url") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_base_url_value");
      }
      options.baseUrl = value.trim().replace(/\/+$/, "");
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function classifyCronProductionProofEvent(proof) {
  return {
    type: proof.ok
      ? "discordos.runtime_health.cron_production_guard_pass"
      : "discordos.runtime_health.cron_production_guard_fail",
    severity: proof.ok ? "info" : "error",
    subject: "discordos.runtime",
    status: proof.ok ? "pass" : "fail",
    dimensions: {
      baseUrl: proof.baseUrl,
      runtimeHealthStatus: proof.runtimeHealth.status,
      cronStatus: proof.cron.status,
      readinessPercent: proof.runtimeHealth.readinessPercent,
      blockedReasonCount: proof.runtimeHealth.blockedReasons.length,
    },
  };
}

async function fetchJsonOrNull(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  return {
    response,
    payload,
  };
}

async function buildRuntimeHealthCronProductionProof({ baseUrl, fetchImpl = fetch }) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const runtimeHealthUrl = `${normalizedBaseUrl}/api/runtime-health`;
  const cronUrl = `${normalizedBaseUrl}/api/cron/runtime-health`;
  const [runtimeHealthResult, cronResult] = await Promise.all([
    fetchJsonOrNull(runtimeHealthUrl, fetchImpl),
    fetchJsonOrNull(cronUrl, fetchImpl),
  ]);
  const runtimeHealthPayload = runtimeHealthResult.payload;
  const cronPayload = cronResult.payload;
  const runtimeHealthOk =
    runtimeHealthResult.response.status === 200 &&
    runtimeHealthPayload?.ok === true &&
    runtimeHealthPayload?.posture === "operational" &&
    runtimeHealthPayload?.readinessPercent === 100 &&
    Array.isArray(runtimeHealthPayload?.blockedReasons) &&
    runtimeHealthPayload.blockedReasons.length === 0;
  const cronPubliclyLocked =
    cronResult.response.status === 401 &&
    (cronPayload === null || cronPayload?.error === "cron_secret_mismatch");
  const proof = {
    ok: runtimeHealthOk && cronPubliclyLocked,
    baseUrl: normalizedBaseUrl,
    runtimeHealth: {
      url: runtimeHealthUrl,
      status: runtimeHealthResult.response.status,
      ok: runtimeHealthPayload?.ok === true,
      posture: runtimeHealthPayload?.posture || null,
      readinessPercent: runtimeHealthPayload?.readinessPercent ?? null,
      blockedReasons: Array.isArray(runtimeHealthPayload?.blockedReasons)
        ? runtimeHealthPayload.blockedReasons
        : [],
      liveCutover: runtimeHealthPayload?.activation?.liveCutover === true,
      fitnessTrafficMoved: runtimeHealthPayload?.activation?.fitnessTrafficMoved === true,
    },
    cron: {
      url: cronUrl,
      status: cronResult.response.status,
      publiclyLocked: cronPubliclyLocked,
      error: cronPayload?.error || null,
    },
  };

  return {
    ...proof,
    event: classifyCronProductionProofEvent(proof),
  };
}

function renderMarkdown(proof) {
  const lines = [
    "# DiscordOS Runtime Health Cron Production Proof",
    "",
    `- result: \`${proof.ok ? "pass" : "fail"}\``,
    `- base url: \`${proof.baseUrl}\``,
    `- event type: \`${proof.event.type}\``,
    `- event severity: \`${proof.event.severity}\``,
    `- runtime health status: \`${proof.runtimeHealth.status}\``,
    `- runtime health posture: \`${proof.runtimeHealth.posture || "unknown"}\``,
    `- runtime health readiness percent: \`${proof.runtimeHealth.readinessPercent ?? "unknown"}\``,
    `- runtime health blocked reasons: \`${proof.runtimeHealth.blockedReasons.join(",") || "none"}\``,
    `- live cutover: \`${proof.runtimeHealth.liveCutover ? "true" : "false"}\``,
    `- fitness traffic moved: \`${proof.runtimeHealth.fitnessTrafficMoved ? "true" : "false"}\``,
    `- cron status: \`${proof.cron.status}\``,
    `- cron publicly locked: \`${proof.cron.publiclyLocked ? "true" : "false"}\``,
    `- cron error: \`${proof.cron.error || "none"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const proof = await buildRuntimeHealthCronProductionProof(options);
    process.stdout.write(options.json ? `${JSON.stringify(proof, null, 2)}\n` : renderMarkdown(proof));
    if (!proof.ok) {
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
    DEFAULT_BASE_URL,
    parseArgs,
    classifyCronProductionProofEvent,
    buildRuntimeHealthCronProductionProof,
    renderMarkdown,
  },
};
