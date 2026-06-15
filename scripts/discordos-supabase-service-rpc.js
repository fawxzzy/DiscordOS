function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getServiceRoleRpcConfig(env = process.env) {
  const supabaseUrl = hasValue(env.DISCORDOS_SUPABASE_URL)
    ? cleanUrl(env.DISCORDOS_SUPABASE_URL)
    : null;
  const serviceRoleKey = hasValue(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY)
    ? env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY.trim()
    : null;
  const anonKey = hasValue(env.DISCORDOS_SUPABASE_ANON_KEY)
    ? env.DISCORDOS_SUPABASE_ANON_KEY.trim()
    : null;
  const edgeProxyEnabled = env.DISCORDOS_SUPABASE_WORKFLOW_RPC_EDGE === "enabled";
  const reasonCodes = [];

  if (!supabaseUrl) {
    reasonCodes.push("missing_supabase_url");
  }
  if (!serviceRoleKey && !edgeProxyEnabled) {
    reasonCodes.push("missing_service_role_key");
  }
  if (!serviceRoleKey && edgeProxyEnabled && !anonKey) {
    reasonCodes.push("missing_supabase_anon_key");
  }

  return {
    ok: reasonCodes.length === 0,
    supabaseUrl,
    transport: serviceRoleKey ? "service_role_rest" : "edge_proxy",
    serviceRoleKeyConfigured: serviceRoleKey !== null,
    serviceRoleKey,
    anonKeyConfigured: anonKey !== null,
    anonKey,
    edgeProxyEnabled,
    reasonCodes,
  };
}

async function callServiceRoleRpc({
  supabaseUrl,
  serviceRoleKey,
  anonKey,
  edgeProxyEnabled = false,
  functionName,
  payload = {},
  fetchImpl = fetch,
}) {
  if (!hasValue(supabaseUrl)) {
    throw new Error("missing_supabase_url");
  }
  if (!hasValue(functionName)) {
    throw new Error("missing_rpc_function_name");
  }

  if (!hasValue(serviceRoleKey) && edgeProxyEnabled) {
    if (!hasValue(anonKey)) {
      throw new Error("missing_supabase_anon_key");
    }

    const endpoint = `${cleanUrl(supabaseUrl)}/functions/v1/discordos-product-workflow-rpc`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        rpc: functionName.trim(),
        payload,
      }),
    });
    const responsePayload = await response.json().catch(() => null);

    if (!response.ok || responsePayload?.ok === false) {
      return {
        ok: false,
        endpoint,
        transport: "edge_proxy",
        httpStatus: response.status,
        code: typeof responsePayload?.error === "string" ? responsePayload.error : "SUPABASE_EDGE_RPC_FAILED",
        payload: responsePayload,
      };
    }

    return {
      ok: true,
      endpoint,
      transport: "edge_proxy",
      httpStatus: response.status,
      payload: responsePayload?.payload ?? responsePayload,
    };
  }

  if (!hasValue(serviceRoleKey)) {
    throw new Error("missing_service_role_key");
  }

  const endpoint = `${cleanUrl(supabaseUrl)}/rest/v1/rpc/${functionName.trim()}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      endpoint,
      transport: "service_role_rest",
      httpStatus: response.status,
      code: typeof responsePayload?.code === "string" ? responsePayload.code : "SUPABASE_RPC_FAILED",
      payload: responsePayload,
    };
  }

  return {
    ok: true,
    endpoint,
    transport: "service_role_rest",
    httpStatus: response.status,
    payload: responsePayload,
  };
}

module.exports = {
  _internals: {
    hasValue,
    cleanUrl,
    getServiceRoleRpcConfig,
    callServiceRoleRpc,
  },
};
