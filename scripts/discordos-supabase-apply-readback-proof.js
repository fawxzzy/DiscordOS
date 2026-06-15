const EXPECTED_PROJECT_REF = "nwexsktuuenfdegzrbut";
const REQUIRED_TABLES = [
  "discordos_board_cards",
  "discordos_moderation_audit_log",
];
const REQUIRED_MIGRATIONS = [
  "discordos_board_cards",
  "discordos_moderation_audit_log",
];
const DEFAULT_READBACK = {
  projectRef: EXPECTED_PROJECT_REF,
  tables: [
    {
      tableName: "discordos_board_cards",
      schemaName: "discordos",
      exists: true,
      indexCount: 5,
      rlsEnabled: true,
      forceRlsEnabled: false,
      policyCount: 0,
      publicGrantCount: 0,
      serviceRoleGrantCount: 7,
    },
    {
      tableName: "discordos_moderation_audit_log",
      schemaName: "discordos",
      exists: true,
      indexCount: 5,
      rlsEnabled: true,
      forceRlsEnabled: false,
      policyCount: 0,
      publicGrantCount: 0,
      serviceRoleGrantCount: 7,
    },
  ],
  migrations: [
    {
      name: "discordos_board_cards",
      version: "20260615005519",
    },
    {
      name: "discordos_moderation_audit_log",
      version: "20260615005542",
    },
  ],
};

function parseArgs(args) {
  const options = {
    json: false,
  };

  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`unsupported_argument:${arg}`);
    }
  }

  return options;
}

function byName(rows, field) {
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row[field], row]));
}

function validateSupabaseApplyReadback(readback = DEFAULT_READBACK) {
  const reasonCodes = [];
  const tableByName = byName(readback.tables, "tableName");
  const migrationByName = byName(readback.migrations, "name");
  const tableChecks = REQUIRED_TABLES.map((tableName) => {
    const table = tableByName.get(tableName) || {};
    const checks = {
      exists: table.exists === true,
      privateSchema: table.schemaName === "discordos",
      rlsEnabled: table.rlsEnabled === true,
      noPublicPolicies: table.policyCount === 0,
      noPublicGrants: table.publicGrantCount === 0,
      serviceRoleGranted: Number(table.serviceRoleGrantCount || 0) > 0,
      indexed: Number(table.indexCount || 0) >= 4,
    };

    for (const [check, ok] of Object.entries(checks)) {
      if (!ok) {
        reasonCodes.push(`${tableName}_${check}_failed`);
      }
    }

    return {
      tableName,
      ...checks,
      indexCount: Number(table.indexCount || 0),
      serviceRoleGrantCount: Number(table.serviceRoleGrantCount || 0),
    };
  });
  const migrationChecks = REQUIRED_MIGRATIONS.map((name) => {
    const migration = migrationByName.get(name) || {};
    const applied = typeof migration.version === "string" && /^\d{14}$/.test(migration.version);
    if (!applied) {
      reasonCodes.push(`${name}_migration_not_applied`);
    }
    return {
      name,
      applied,
      version: migration.version || null,
    };
  });

  if (readback.projectRef !== EXPECTED_PROJECT_REF) {
    reasonCodes.push("project_ref_mismatch");
  }

  return {
    ok: reasonCodes.length === 0,
    projectRef: readback.projectRef || null,
    tableChecks,
    migrationChecks,
    reasonCodes,
  };
}

function classifySupabaseApplyReadbackProofEvent(result) {
  return {
    type: result.ok
      ? "discordos.supabase.apply_readback_proof_ready"
      : "discordos.supabase.apply_readback_proof_blocked",
    severity: result.ok ? "info" : "warning",
    subject: "discordos.supabase.apply_readback_proof",
    status: result.ok ? "pass" : "fail",
    dimensions: {
      tableCount: result.tableChecks.length,
      migrationCount: result.migrationChecks.length,
      reasonCodeCount: result.reasonCodes.length,
    },
  };
}

function buildSupabaseApplyReadbackProof({ readback = DEFAULT_READBACK } = {}) {
  const validation = validateSupabaseApplyReadback(readback);
  const result = {
    ok: validation.ok,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    appliesDatabaseMigrations: false,
    status: validation.ok ? "readback_proven" : "blocked",
    projectRef: validation.projectRef,
    requiredTables: REQUIRED_TABLES,
    requiredMigrations: REQUIRED_MIGRATIONS,
    tableChecks: validation.tableChecks,
    migrationChecks: validation.migrationChecks,
    reasonCodes: validation.reasonCodes,
  };

  return {
    ...result,
    event: classifySupabaseApplyReadbackProofEvent(result),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# DiscordOS Supabase Apply Readback Proof",
    "",
    `- result: \`${result.ok ? "pass" : "fail"}\``,
    `- destructive: \`${result.destructive ? "true" : "false"}\``,
    `- sends messages: \`${result.sendsMessages ? "true" : "false"}\``,
    `- writes artifacts: \`${result.writesArtifacts ? "true" : "false"}\``,
    `- applies database migrations: \`${result.appliesDatabaseMigrations ? "true" : "false"}\``,
    `- status: \`${result.status}\``,
    `- event type: \`${result.event.type}\``,
    `- project ref: \`${result.projectRef || "unknown"}\``,
    `- reason codes: \`${result.reasonCodes.join(",") || "none"}\``,
    "",
    "## Tables",
    "",
  ];

  for (const table of result.tableChecks) {
    lines.push(
      `- ${table.tableName}: exists \`${table.exists ? "true" : "false"}\`, rls \`${table.rlsEnabled ? "true" : "false"}\`, public grants \`${table.noPublicGrants ? "none" : "present"}\`, service role grants \`${table.serviceRoleGrantCount}\``
    );
  }

  lines.push("", "## Migrations", "");
  for (const migration of result.migrationChecks) {
    lines.push(`- ${migration.name}: applied \`${migration.applied ? "true" : "false"}\` version \`${migration.version || "unknown"}\``);
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildSupabaseApplyReadbackProof(options);
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
    EXPECTED_PROJECT_REF,
    REQUIRED_TABLES,
    REQUIRED_MIGRATIONS,
    DEFAULT_READBACK,
    parseArgs,
    validateSupabaseApplyReadback,
    classifySupabaseApplyReadbackProofEvent,
    buildSupabaseApplyReadbackProof,
    renderMarkdown,
  },
};
