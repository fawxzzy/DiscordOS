const {
  _internals: supabaseRpcInternals,
} = require("./discordos-supabase-service-rpc");

const MASTER_SUPABASE_REF = "bxtcuhkotumitoqtrcej";
const LEGACY_SUPABASE_REF = "nwexsktuuenfdegzrbut";

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getBoardModerationRpcConfig(env = process.env) {
  const baseConfig = supabaseRpcInternals.getServiceRoleRpcConfig(env);
  const projectRef = hasValue(env.DISCORDOS_SUPABASE_PROJECT_REF)
    ? env.DISCORDOS_SUPABASE_PROJECT_REF.trim()
    : null;
  const masterSelected = projectRef === MASTER_SUPABASE_REF;
  const legacySelected = projectRef === LEGACY_SUPABASE_REF;
  const expectedMasterUrl = `https://${MASTER_SUPABASE_REF}.supabase.co`;
  const expectedLegacyUrl = `https://${LEGACY_SUPABASE_REF}.supabase.co`;
  const masterBound = masterSelected && baseConfig.supabaseUrl === expectedMasterUrl;
  const legacyBound = legacySelected && baseConfig.supabaseUrl === expectedLegacyUrl;

  const reasonCodes = [...baseConfig.reasonCodes];
  if (projectRef === null) {
    reasonCodes.push("missing_supabase_project_ref");
  } else if (!masterSelected && !legacySelected) {
    reasonCodes.push("unsupported_supabase_project_ref");
  } else if (!masterBound && !legacyBound) {
    reasonCodes.push("supabase_project_binding_mismatch");
  }
  if (masterBound && !baseConfig.serviceRoleKeyConfigured) {
    reasonCodes.push("master_direct_service_role_required");
  }

  const runtimeTarget = masterBound
    ? "master_direct"
    : legacyBound && baseConfig.serviceRoleKeyConfigured
      ? "legacy_direct"
      : legacyBound
        ? "legacy_edge_fallback"
        : "none";

  return {
    ...baseConfig,
    ok: reasonCodes.length === 0,
    projectRef,
    masterSelected,
    masterBound,
    legacySelected,
    legacyBound,
    transport: masterBound && !baseConfig.serviceRoleKeyConfigured
      ? "none"
      : baseConfig.transport,
    runtimeTarget,
    edgeProxyEnabled: legacyBound && baseConfig.edgeProxyEnabled,
    reasonCodes,
  };
}

async function callBoardModerationRpc({ env = process.env, ...options } = {}) {
  const config = getBoardModerationRpcConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      attempted: false,
      httpStatus: null,
      payload: null,
      transport: config.transport,
      runtimeTarget: config.runtimeTarget,
      reasonCodes: config.reasonCodes,
    };
  }

  const result = await supabaseRpcInternals.callServiceRoleRpc({
    ...config,
    ...options,
  });

  return {
    ...result,
    attempted: true,
    runtimeTarget: config.runtimeTarget,
    reasonCodes: result.ok ? [] : ["board_moderation_rpc_failed"],
  };
}

module.exports = {
  _internals: {
    MASTER_SUPABASE_REF,
    LEGACY_SUPABASE_REF,
    getBoardModerationRpcConfig,
    callBoardModerationRpc,
  },
};
