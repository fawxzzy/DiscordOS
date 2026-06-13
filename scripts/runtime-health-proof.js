const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_ENDPOINT = "https://fawxzzy-discordos.vercel.app/api/runtime-health";
const DEFAULT_SNAPSHOT_DIR = path.resolve(__dirname, "..", "..", "..", "runtime", "discordos", "runtime-health");

function parseArgs(args) {
  const options = {
    endpoint: DEFAULT_ENDPOINT,
    json: false,
    expectOperational: true,
    writeSnapshot: false,
    snapshotDir: DEFAULT_SNAPSHOT_DIR,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-action-required") {
      options.expectOperational = false;
    } else if (arg === "--write-snapshot") {
      options.writeSnapshot = true;
    } else if (arg === "--snapshot-dir") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_snapshot_dir_value");
      }
      options.snapshotDir = path.resolve(value.trim());
      index += 1;
    } else if (arg === "--endpoint") {
      const value = args[index + 1];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("missing_endpoint_value");
      }
      options.endpoint = value.trim();
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function snapshotNameFromProof(proof) {
  const rawGeneratedAt = proof.summary.generatedAt || new Date().toISOString();
  const safeGeneratedAt = rawGeneratedAt.replace(/[:.]/g, "-");
  const status = proof.ok ? "pass" : "fail";
  return `${safeGeneratedAt}-${status}.json`;
}

function validateRuntimeHealthPayload(payload, { expectOperational = true } = {}) {
  const failures = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      failures: ["payload_must_be_object"],
    };
  }

  if (payload.service !== "discordos-runtime-health") {
    failures.push("unexpected_service");
  }

  if (payload.runtime !== "vercel-serverless-function") {
    failures.push("unexpected_runtime");
  }

  if (expectOperational && payload.ok !== true) {
    failures.push("runtime_health_not_ok");
  }

  if (expectOperational && payload.posture !== "operational") {
    failures.push("runtime_health_not_operational");
  }

  if (expectOperational && payload.readinessPercent !== 100) {
    failures.push("readiness_percent_not_100");
  }

  const components = payload.components && typeof payload.components === "object" ? payload.components : {};
  const requiredComponents = [
    "supabaseProject",
    "serviceRole",
    "discordBot",
    "activationGuard",
    "persistedWriter",
    "liveTransferStatus",
  ];

  for (const componentName of requiredComponents) {
    if (components[componentName]?.state !== "ready") {
      failures.push(`${componentName}_not_ready`);
    }
  }

  if (expectOperational && Array.isArray(payload.blockedReasons) && payload.blockedReasons.length > 0) {
    failures.push("blocked_reasons_present");
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

function classifyRuntimeHealthEvent(proof) {
  const operational = proof.httpStatus === 200 && proof.summary.posture === "operational" && proof.validation.ok;
  const serverFailure = proof.httpStatus >= 500 || proof.validation.failures.includes("payload_must_be_object");
  const blocked = proof.summary.blockedReasons.length > 0 || proof.validation.failures.length > 0;

  return {
    type: operational ? "discordos.runtime_health.operational" : "discordos.runtime_health.action_required",
    severity: operational ? "info" : serverFailure ? "error" : "warning",
    subject: "discordos.runtime",
    status: operational ? "pass" : "fail",
    dimensions: {
      endpoint: proof.endpoint,
      httpStatus: proof.httpStatus,
      posture: proof.summary.posture,
      readinessPercent: proof.summary.readinessPercent,
      serviceRoleRuntime: proof.summary.serviceRoleRuntime,
      writerMode: proof.summary.writerMode,
      trafficTransferMode: proof.summary.trafficTransferMode,
      rollbackMode: proof.summary.rollbackMode,
      liveCutover: proof.summary.liveCutover,
      fitnessTrafficMoved: proof.summary.fitnessTrafficMoved,
      blockedReasonCount: proof.summary.blockedReasons.length,
      validationFailureCount: proof.validation.failures.length,
      blocked,
    },
  };
}

async function fetchRuntimeHealthProof({ endpoint, fetchImpl = fetch, expectOperational = true }) {
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  const validation = validateRuntimeHealthPayload(payload, { expectOperational });

  const proof = {
    ok: response.ok && validation.ok,
    endpoint,
    httpStatus: response.status,
    validation,
    summary: {
      service: payload?.service || null,
      posture: payload?.posture || null,
      readinessPercent: Number.isInteger(payload?.readinessPercent) ? payload.readinessPercent : null,
      componentStates:
        payload?.components && typeof payload.components === "object"
          ? Object.fromEntries(Object.entries(payload.components).map(([key, value]) => [key, value?.state || null]))
          : null,
      serviceRoleRuntime: payload?.components?.serviceRole?.runtime || null,
      writerMode: payload?.activation?.writerMode || null,
      trafficTransferMode: payload?.activation?.trafficTransferMode || null,
      rollbackMode: payload?.activation?.rollbackMode || null,
      writerActivationAllowed: payload?.activation?.writerActivationAllowed === true,
      liveCutover: payload?.activation?.liveCutover === true,
      fitnessTrafficMoved: payload?.activation?.fitnessTrafficMoved === true,
      blockedReasons: Array.isArray(payload?.blockedReasons) ? payload.blockedReasons : [],
      generatedAt: payload?.generatedAt || null,
    },
  };
  return {
    ...proof,
    event: classifyRuntimeHealthEvent(proof),
  };
}

function renderMarkdown(proof) {
  const lines = [
    "# DiscordOS Runtime Health Proof",
    "",
    `- endpoint: \`${proof.endpoint}\``,
    `- result: \`${proof.ok ? "pass" : "fail"}\``,
    `- http status: \`${proof.httpStatus}\``,
    `- posture: \`${proof.summary.posture}\``,
    `- readiness percent: \`${proof.summary.readinessPercent}\``,
    `- service-role runtime: \`${proof.summary.serviceRoleRuntime}\``,
    `- writer mode: \`${proof.summary.writerMode}\``,
    `- traffic transfer mode: \`${proof.summary.trafficTransferMode}\``,
    `- rollback mode: \`${proof.summary.rollbackMode}\``,
    `- writer activation allowed: \`${proof.summary.writerActivationAllowed}\``,
    `- live cutover: \`${proof.summary.liveCutover}\``,
    `- fitness traffic moved: \`${proof.summary.fitnessTrafficMoved}\``,
    `- blocked reasons: \`${proof.summary.blockedReasons.join(",") || "none"}\``,
    `- validation failures: \`${proof.validation.failures.join(",") || "none"}\``,
    `- event type: \`${proof.event.type}\``,
    `- event severity: \`${proof.event.severity}\``,
    `- snapshot path: \`${proof.snapshotPath || "not-written"}\``,
    `- generated at: \`${proof.summary.generatedAt || "unknown"}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function writeRuntimeHealthSnapshot(proof, { snapshotDir }) {
  await fs.mkdir(snapshotDir, { recursive: true });
  const snapshotPath = path.join(snapshotDir, snapshotNameFromProof(proof));
  const snapshot = {
    ...proof,
    snapshot: {
      path: snapshotPath,
      writtenAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return {
    ...snapshot,
    snapshotPath,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    let proof = await fetchRuntimeHealthProof(options);
    if (options.writeSnapshot) {
      proof = await writeRuntimeHealthSnapshot(proof, {
        snapshotDir: options.snapshotDir,
      });
    }
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
    DEFAULT_ENDPOINT,
    DEFAULT_SNAPSHOT_DIR,
    parseArgs,
    snapshotNameFromProof,
    validateRuntimeHealthPayload,
    classifyRuntimeHealthEvent,
    fetchRuntimeHealthProof,
    renderMarkdown,
    writeRuntimeHealthSnapshot,
  },
};
