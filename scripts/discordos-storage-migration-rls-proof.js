const fs = require("node:fs/promises");
const path = require("node:path");

const MIGRATIONS = {
  board: {
    label: "DiscordOS Board Card Storage Migration",
    path: path.resolve(process.cwd(), "supabase", "migrations", "20260614231000_discordos_board_cards.sql"),
    table: "discordos.discordos_board_cards",
    idempotencyColumn: "card_id",
    requiredTokens: [
      "create table if not exists discordos.discordos_board_cards",
      "card_id text primary key",
      "workflow text not null",
      "current_state text not null",
      "proof_payload jsonb not null",
      "create index if not exists discordos_board_cards_workflow_idx",
      "create index if not exists discordos_board_cards_current_state_idx",
      "alter table discordos.discordos_board_cards enable row level security",
      "revoke all on table discordos.discordos_board_cards from public, anon, authenticated",
      "grant all privileges on table discordos.discordos_board_cards to service_role",
      "Service-role only; no public policies",
    ],
  },
  moderation: {
    label: "DiscordOS Moderation Audit Storage Migration",
    path: path.resolve(process.cwd(), "supabase", "migrations", "20260614232000_discordos_moderation_audit_log.sql"),
    table: "discordos.discordos_moderation_audit_log",
    idempotencyColumn: "case_id",
    requiredTokens: [
      "create table if not exists discordos.discordos_moderation_audit_log",
      "case_id text primary key",
      "action_type text not null",
      "actor_discord_user_fingerprint text not null",
      "subject_discord_user_fingerprint text not null",
      "proof_payload jsonb not null",
      "create index if not exists discordos_moderation_audit_log_action_type_idx",
      "create index if not exists discordos_moderation_audit_log_subject_idx",
      "alter table discordos.discordos_moderation_audit_log enable row level security",
      "revoke all on table discordos.discordos_moderation_audit_log from public, anon, authenticated",
      "grant all privileges on table discordos.discordos_moderation_audit_log to service_role",
      "Service-role only; no public policies",
    ],
  },
};

const FORBIDDEN_TOKENS = [
  "create policy ",
  " to anon",
  " to authenticated",
  "grant select",
  "grant insert",
  "grant update",
  "grant delete",
  "security definer",
  "process.env",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function parseArgs(args) {
  const options = {
    json: false,
    feature: "board",
    migrationPath: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--feature") {
      const value = readValue(args, index, "missing_feature_value");
      if (!MIGRATIONS[value]) {
        throw new Error(`unsupported_feature:${value}`);
      }
      options.feature = value;
      index += 1;
    } else if (arg === "--migration-file") {
      options.migrationPath = path.resolve(readValue(args, index, "missing_migration_file_value"));
      index += 1;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function readValue(args, index, missingCode) {
  const value = args[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(missingCode);
  }
  return value.trim();
}

async function readMigration(filePath, fsImpl = fs) {
  try {
    return {
      ok: true,
      sql: await fsImpl.readFile(filePath, "utf8"),
      reasonCodes: [],
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ok: false,
        sql: "",
        reasonCodes: ["migration_file_missing"],
      };
    }
    throw error;
  }
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function classifyRequiredTokens(normalizedSql, requiredTokens) {
  const present = requiredTokens.filter((token) => normalizedSql.includes(normalizeSql(token)));
  const missing = requiredTokens.filter((token) => !present.includes(token));

  return {
    ok: missing.length === 0,
    present,
    missing,
    reasonCodes: missing.length === 0 ? [] : ["migration_required_token_missing"],
  };
}

function classifyForbiddenTokens(normalizedSql) {
  const lowered = normalizedSql.toLowerCase();
  const present = FORBIDDEN_TOKENS.filter((token) => lowered.includes(token.toLowerCase()));

  return {
    ok: present.length === 0,
    present,
    reasonCodes: present.length === 0 ? [] : ["migration_forbidden_token_present"],
  };
}

function classifyMigrationEvent(result) {
  return {
    type: result.ok
      ? "discordos.storage_migration.rls_proof_ready"
      : "discordos.storage_migration.rls_proof_blocked",
    severity: result.ok ? "info" : "warning",
    subject: `discordos.storage_migration.${result.feature}`,
    status: result.ok ? "pass" : "fail",
    dimensions: {
      feature: result.feature,
      table: result.table,
      missingTokenCount: result.required.missing.length,
      forbiddenTokenCount: result.forbidden.present.length,
      rlsEnabled: result.rlsEnabled,
      serviceRoleOnly: result.serviceRoleOnly,
    },
  };
}

async function buildStorageMigrationRlsProof({
  feature = "board",
  migrationPath = null,
  fsImpl = fs,
} = {}) {
  const config = MIGRATIONS[feature];
  if (!config) {
    throw new Error(`unsupported_feature:${feature}`);
  }
  const filePath = migrationPath || config.path;
  const migration = await readMigration(filePath, fsImpl);
  const normalizedSql = normalizeSql(migration.sql);
  const required = migration.ok
    ? classifyRequiredTokens(normalizedSql, config.requiredTokens)
    : {
      ok: false,
      present: [],
      missing: config.requiredTokens,
      reasonCodes: migration.reasonCodes,
    };
  const forbidden = migration.ok
    ? classifyForbiddenTokens(normalizedSql)
    : {
      ok: false,
      present: [],
      reasonCodes: migration.reasonCodes,
    };
  const reasonCodes = [...new Set([
    ...migration.reasonCodes,
    ...required.reasonCodes,
    ...forbidden.reasonCodes,
  ])];
  const result = {
    ok: migration.ok && required.ok && forbidden.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: reasonCodes.length === 0 ? "ready" : "blocked",
    feature,
    label: config.label,
    migrationPath: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
    table: config.table,
    idempotencyColumn: config.idempotencyColumn,
    rlsEnabled: required.present.some((token) => token.includes("enable row level security")),
    serviceRoleOnly: required.present.some((token) => token.includes("to service_role"))
      && required.present.some((token) => token.includes("from public, anon, authenticated")),
    publicPoliciesAllowed: false,
    dataApiPublicExposureAllowed: false,
    migrationApplied: false,
    required,
    forbidden,
    reasonCodes,
  };

  return {
    ...result,
    event: classifyMigrationEvent(result),
  };
}

function renderMarkdown(result) {
  return [
    "# DiscordOS Storage Migration RLS Proof",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- feature: \`${result.feature}\``,
    `- migration: \`${result.migrationPath}\``,
    `- table: \`${result.table}\``,
    `- idempotency column: \`${result.idempotencyColumn}\``,
    `- RLS enabled: \`${result.rlsEnabled ? "true" : "false"}\``,
    `- service-role only: \`${result.serviceRoleOnly ? "true" : "false"}\``,
    `- public policies allowed: \`${result.publicPoliciesAllowed ? "true" : "false"}\``,
    `- Data API public exposure allowed: \`${result.dataApiPublicExposureAllowed ? "true" : "false"}\``,
    `- migration applied: \`${result.migrationApplied ? "true" : "false"}\``,
    `- missing tokens: \`${result.required.missing.length}\``,
    `- forbidden tokens: \`${result.forbidden.present.length}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
  ].join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await buildStorageMigrationRlsProof(options);
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
    MIGRATIONS,
    FORBIDDEN_TOKENS,
    parseArgs,
    normalizeSql,
    classifyRequiredTokens,
    classifyForbiddenTokens,
    classifyMigrationEvent,
    buildStorageMigrationRlsProof,
    renderMarkdown,
  },
};
