const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_RECEIPT_DIR = path.resolve(process.cwd(), "docs", "ops");

function classifyReceiptState(fileNames = []) {
  return {
    liveOperatorStatusProof: fileNames.some((fileName) =>
      fileName.includes("discordos-operator-live-status-proof-pass")
    ),
    liveTargetAdmissionProof: fileNames.some((fileName) =>
      fileName.includes("discordos-live-target-admission-proof-pass")
    ),
    authorizedCronProof: fileNames.some((fileName) =>
      fileName.includes("discordos-runtime-health-authorized-cron-proof-pass")
    ),
    scheduledCronIdentityGuard: fileNames.some((fileName) =>
      fileName.includes("discordos-scheduled-cron-log-identity-guard-pass")
    ),
    scheduledCronAuditProof: fileNames.some((fileName) =>
      fileName.includes("discordos-runtime-health-scheduled-audit-proof-pass")
    ),
    runtimeOperationsAdmissionProof: fileNames.some((fileName) =>
      fileName.includes("discordos-next-work-wait-state-ranking-pass")
    ),
    finalFollowupUpdateProof: fileNames.some((fileName) =>
      fileName.includes("discordos-runtime-product-hardening-followup-live-post-pass")
        || fileName.includes("discordos-runtime-product-hardening-followup-update-post")
    ),
  };
}

async function readReceiptState(docsDir = DEFAULT_RECEIPT_DIR) {
  try {
    return classifyReceiptState(await fs.readdir(docsDir));
  } catch {
    return classifyReceiptState([]);
  }
}

module.exports = {
  _internals: {
    DEFAULT_RECEIPT_DIR,
    classifyReceiptState,
    readReceiptState,
  },
};
