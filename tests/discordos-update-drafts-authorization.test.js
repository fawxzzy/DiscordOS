const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULE_PATH = path.join(
  REPO_ROOT,
  "supabase",
  "functions",
  "discordos-update-drafts",
  "handler.mjs",
);
const modulePromise = import(pathToFileURL(MODULE_PATH).href);
const NAMED_KEY = `sb_secret_${"a".repeat(32)}`;
const OTHER_KEY = `sb_secret_${"b".repeat(32)}`;
const PUBLISHABLE_KEY = `sb_publishable_${"c".repeat(32)}`;
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_DRAFT_ID = "22222222-2222-4222-8222-222222222222";

function stableSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fakeVerifyAuth(request, options) {
  const supplied = request.headers.get("apikey");
  const selected = options.auth;
  if (selected === "secret:discordos-update-drafts-caller" && supplied === NAMED_KEY) {
    return Promise.resolve({
      data: {
        authMode: "secret",
        keyName: "discordos-update-drafts-caller",
      },
      error: null,
    });
  }
  if (selected === "secret:*" && (supplied === NAMED_KEY || supplied === OTHER_KEY)) {
    return Promise.resolve({
      data: {
        authMode: "secret",
        keyName: supplied === NAMED_KEY ? "discordos-update-drafts-caller" : "other-service",
      },
      error: null,
    });
  }
  return Promise.resolve({ data: null, error: { status: 401, code: "invalid_credentials" } });
}

class FakeRpcStore {
  constructor(seed = true) {
    this.calls = [];
    this.writes = 0;
    this.failNext = null;
    this.rows = seed
      ? [
          {
            id: DRAFT_ID,
            owner_service: "discordos-update-drafts-caller",
            source: "vercel",
            status: "draft",
            deployment_id: "dpl_seed",
            git_commit_sha: "a".repeat(40),
            user_facing_title: "Seed",
            revision: 1,
          },
          {
            id: SECOND_DRAFT_ID,
            owner_service: "discordos-update-drafts-caller",
            source: "vercel",
            status: "draft",
            deployment_id: "dpl_second",
            git_commit_sha: "b".repeat(40),
            user_facing_title: "Second",
            revision: 1,
          },
        ]
      : [];
  }

  snapshot() {
    return JSON.stringify(this.rows);
  }

  rpc = async (name, { payload }) => {
    this.calls.push({ name, payload });
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      return { data: null, error };
    }
    if (name === "discordos_list_update_drafts") {
      const filtered = payload.status
        ? this.rows.filter((row) => row.status === payload.status)
        : this.rows;
      return { data: filtered.slice(0, payload.limit ?? 5), error: null };
    }
    if (name === "discordos_get_update_draft_by_deployment_id") {
      return {
        data: this.rows.filter((row) => row.deployment_id === payload.deployment_id).slice(0, 1),
        error: null,
      };
    }
    if (name === "discordos_get_update_draft_by_id") {
      return { data: this.rows.filter((row) => row.id === payload.id).slice(0, 1), error: null };
    }
    if (name === "discordos_get_update_draft_by_prefix") {
      return {
        data: this.rows
          .filter((row) => row.id >= payload.lower_bound && row.id <= payload.upper_bound)
          .slice(0, payload.limit ?? 2),
        error: null,
      };
    }
    if (name === "discordos_insert_update_draft") {
      const existing = this.rows.find((row) => row.deployment_id === payload.deployment_id);
      if (existing) {
        const immutableFields = [
          "deployment_url",
          "production_url",
          "vercel_project_id",
          "vercel_project_name",
          "vercel_target",
          "git_commit_sha",
          "git_commit_ref",
          "git_commit_message",
        ];
        const conflict = immutableFields.some(
          (field) => (existing[field] ?? null) !== (payload[field] ?? null),
        );
        return conflict
          ? { data: null, error: { code: "DU001", message: "sensitive insert detail" } }
          : { data: [existing], error: null };
      }
      const row = {
        id: "33333333-3333-4333-8333-333333333333",
        owner_service: "discordos-update-drafts-caller",
        source: "vercel",
        status: "draft",
        revision: 1,
        ...payload,
      };
      this.rows.push(row);
      this.writes += 1;
      return { data: [row], error: null };
    }
    if (name === "discordos_update_update_draft") {
      const row = this.rows.find((candidate) => candidate.id === payload.id);
      if (!row) return { data: null, error: { code: "DU002", message: "sensitive missing detail" } };
      if (row.revision !== payload.expected_revision) {
        return { data: null, error: { code: "DU003", message: "sensitive revision detail" } };
      }
      if (row.status !== "draft") {
        return { data: null, error: { code: "DU004", message: "sensitive lifecycle detail" } };
      }
      for (const field of ["user_facing_title", "user_facing_changes", "user_facing_why_it_matters"]) {
        if (field in payload) row[field] = payload[field];
      }
      if (payload.transition_to) row.status = payload.transition_to;
      row.revision += 1;
      this.writes += 1;
      return { data: [row], error: null };
    }
    throw new Error(`unexpected RPC ${name}`);
  };
}

async function createHarness({ seed = true, authenticate } = {}) {
  const {
    createDiscordUpdateDraftsHandler,
    createNamedServiceAuthenticator,
  } = await modulePromise;
  const store = new FakeRpcStore(seed);
  const callerBindings = [];
  const handler = createDiscordUpdateDraftsHandler({
    authenticate: authenticate ?? createNamedServiceAuthenticator(fakeVerifyAuth),
    createRpcClient: (binding) => {
      callerBindings.push(binding);
      return store;
    },
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });
  return { handler, store, callerBindings };
}

function requestFor(body, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (!options.omitContentType && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!options.omitKey && !headers.has("apikey")) headers.set("apikey", NAMED_KEY);
  return new Request("https://example.invalid/functions/v1/discordos-update-drafts", {
    method: options.method ?? "POST",
    headers,
    body: ["GET", "HEAD"].includes(options.method) ? undefined : (options.rawBody ?? JSON.stringify(body)),
  });
}

async function readResult(handler, request) {
  const response = await handler(request);
  return { response, body: await response.json() };
}

test("frozen 23-case negative matrix", async (t) => {
  const cases = [
    {
      id: "N01_missing_service_api_key",
      expected: 401,
      build: () => requestFor({ action: "list_latest", payload: {} }, { omitKey: true }),
    },
    {
      id: "N02_malformed_service_api_key",
      expected: 401,
      build: () => requestFor({ action: "list_latest", payload: {} }, { headers: { apikey: "not-a-key" } }),
    },
    {
      id: "N03_publishable_key",
      expected: 401,
      build: () => requestFor({ action: "list_latest", payload: {} }, { headers: { apikey: PUBLISHABLE_KEY } }),
    },
    {
      id: "N04_differently_named_secret_key",
      expected: 403,
      build: () => requestFor({ action: "list_latest", payload: {} }, { headers: { apikey: OTHER_KEY } }),
    },
    ...[
      "N05_legacy_anon_jwt_bearer",
      "N06_authenticated_user_jwt",
      "N07_anonymous_session_jwt",
      "N08_legacy_service_role_jwt_bearer",
      "N09_wrong_claims_jwt",
      "N10_expired_jwt",
    ].map((id) => ({
      id,
      expected: 401,
      build: () => requestFor(
        { action: "list_latest", payload: {} },
        { omitKey: true, headers: { authorization: "Bearer redacted.jwt.value" } },
      ),
    })),
    {
      id: "N11_get_method",
      expected: 405,
      build: () => requestFor(null, { method: "GET", omitKey: true, omitContentType: true }),
    },
    {
      id: "N12_browser_preflight",
      expected: 405,
      build: () => requestFor(null, {
        method: "OPTIONS",
        omitKey: true,
        omitContentType: true,
        headers: { origin: "https://browser.invalid" },
      }),
    },
    {
      id: "N13_non_browser_missing_named_key",
      expected: 401,
      build: () => requestFor({ action: "find_by_id", payload: { draftId: DRAFT_ID } }, { omitKey: true }),
    },
    {
      id: "N14_invalid_json",
      expected: 400,
      build: () => requestFor(null, { rawBody: "{" }),
    },
    {
      id: "N15_unsupported_action",
      expected: 400,
      build: () => requestFor({ action: "delete", payload: {} }),
    },
    {
      id: "N16_invalid_selector",
      expected: 400,
      build: () => requestFor({ action: "find_by_id", payload: {} }),
    },
    {
      id: "N17_owner_override",
      expected: 403,
      build: () => requestFor({ action: "list_latest", payload: { ownerService: "other" } }),
    },
    {
      id: "N18_server_owned_field_override",
      expected: 422,
      build: () => requestFor({
        action: "insert",
        payload: { values: { deploymentId: "dpl_new", status: "published" } },
      }),
    },
    {
      id: "N19_illegal_transition",
      expected: 422,
      build: () => requestFor({
        action: "update",
        payload: { draftId: DRAFT_ID, expectedRevision: 1, transition: { to: "draft" } },
      }),
    },
    {
      id: "N20_batch_payload",
      expected: 422,
      build: () => requestFor({ action: "insert", payload: [{ values: { deploymentId: "dpl_new" } }] }),
    },
    { id: "N21_conflicting_insert_replay", expected: 409, special: "insert_replay" },
    { id: "N22_stale_update_revision", expected: 409, special: "stale_update" },
    { id: "N23_unknown_or_downstream_failure", expected: 500, special: "downstream" },
  ];

  assert.equal(cases.length, 23);
  for (const entry of cases) {
    await t.test(entry.id, async () => {
      const { handler, store } = await createHarness({ seed: entry.special !== "insert_replay" });
      let before = store.snapshot();
      let result;
      if (entry.special === "insert_replay") {
        const first = await readResult(handler, requestFor({
          action: "insert",
          payload: { values: { deploymentId: "dpl_replay", gitCommitSha: "a".repeat(40) } },
        }));
        assert.equal(first.response.status, 200);
        before = store.snapshot();
        result = await readResult(handler, requestFor({
          action: "insert",
          payload: { values: { deploymentId: "dpl_replay", gitCommitSha: "b".repeat(40) } },
        }));
      } else if (entry.special === "stale_update") {
        const first = await readResult(handler, requestFor({
          action: "update",
          payload: { draftId: DRAFT_ID, expectedRevision: 1, values: { userFacingTitle: "Changed" } },
        }));
        assert.equal(first.response.status, 200);
        before = store.snapshot();
        result = await readResult(handler, requestFor({
          action: "update",
          payload: { draftId: DRAFT_ID, expectedRevision: 1, values: { userFacingTitle: "Stale" } },
        }));
      } else if (entry.special === "downstream") {
        store.failNext = {
          code: "XX999",
          message: "postgres://sensitive.example.invalid leaked diagnostic",
        };
        result = await readResult(handler, requestFor({ action: "list_latest", payload: {} }));
      } else {
        result = await readResult(handler, entry.build());
      }

      assert.equal(result.response.status, entry.expected);
      assert.equal(result.body.ok, false);
      assert.equal(store.snapshot(), before, `${entry.id} row state`);
      assert.equal(result.response.headers.has("access-control-allow-origin"), false);
      assert.doesNotMatch(JSON.stringify(result.body), /postgres|XX999|DU00|sensitive|sb_secret|jwt\.value/i);
      if (!entry.special) assert.equal(store.calls.length, 0, `${entry.id} privileged RPC calls`);
    });
  }
});

test("transport guards reject duplicate auth, media violations, and oversized bodies before RPC", async (t) => {
  const { MAX_BODY_BYTES } = await modulePromise;
  const cases = [
    {
      id: "duplicate_apikey_header",
      expected: 401,
      build: () => {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("apikey", NAMED_KEY);
        headers.append("apikey", OTHER_KEY);
        return new Request("https://example.invalid/functions/v1/discordos-update-drafts", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "list_latest", payload: {} }),
        });
      },
    },
    {
      id: "authorization_and_apikey_mixed",
      expected: 401,
      build: () => requestFor(
        { action: "list_latest", payload: {} },
        { headers: { authorization: "Bearer redacted", apikey: NAMED_KEY } },
      ),
    },
    {
      id: "wrong_media_type",
      expected: 415,
      build: () => requestFor(
        { action: "list_latest", payload: {} },
        { headers: { "content-type": "text/plain" } },
      ),
    },
    {
      id: "declared_oversized_body",
      expected: 413,
      build: () => requestFor(
        { action: "list_latest", payload: {} },
        { headers: { "content-length": String(MAX_BODY_BYTES + 1) } },
      ),
    },
    {
      id: "streamed_oversized_body",
      expected: 413,
      build: () => requestFor(null, { rawBody: `{"padding":"${"x".repeat(MAX_BODY_BYTES)}"}` }),
    },
  ];

  for (const entry of cases) {
    await t.test(entry.id, async () => {
      const { handler, store } = await createHarness();
      const before = store.snapshot();
      const result = await readResult(handler, entry.build());
      assert.equal(result.response.status, entry.expected);
      assert.equal(store.calls.length, 0);
      assert.equal(store.snapshot(), before);
      assert.doesNotMatch(JSON.stringify(result.body), /sb_secret|Bearer redacted/);
    });
  }
});

test("every request UUID field rejects noncanonical and oversized values before privileged work", async (t) => {
  const { validateOperation } = await modulePromise;
  assert.deepEqual(
    validateOperation({ action: "find_by_id", payload: { draftId: DRAFT_ID } }).rpcPayload,
    { id: DRAFT_ID },
  );
  assert.deepEqual(
    validateOperation({
      action: "update",
      payload: { draftId: DRAFT_ID, expectedRevision: 1, values: { userFacingTitle: "Canonical" } },
    }).rpcPayload.id,
    DRAFT_ID,
  );
  assert.deepEqual(
    validateOperation({
      action: "find_by_prefix",
      payload: { lowerBound: DRAFT_ID, upperBound: SECOND_DRAFT_ID },
    }).rpcPayload,
    { lower_bound: DRAFT_ID, upper_bound: SECOND_DRAFT_ID },
  );

  const invalidValues = [
    ["overlong", `${DRAFT_ID}0`],
    ["leading_whitespace", ` ${DRAFT_ID}`],
    ["trailing_whitespace", `${DRAFT_ID} `],
    ["compact", DRAFT_ID.replaceAll("-", "")],
    ["braced", `{${DRAFT_ID}}`],
    ["ambiguous_hyphens", "-".repeat(36)],
    ["uppercase", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"],
    ["unsupported_version", "11111111-1111-7111-8111-111111111111"],
    ["invalid_variant", "11111111-1111-4111-7111-111111111111"],
  ];
  const fields = [
    {
      id: "find_by_id.draftId",
      build: (value) => ({ action: "find_by_id", payload: { draftId: value } }),
    },
    {
      id: "update.draftId",
      build: (value) => ({
        action: "update",
        payload: { draftId: value, expectedRevision: 1, values: { userFacingTitle: "Blocked" } },
      }),
    },
    {
      id: "find_by_prefix.lowerBound",
      build: (value) => ({
        action: "find_by_prefix",
        payload: { lowerBound: value, upperBound: SECOND_DRAFT_ID },
      }),
    },
    {
      id: "find_by_prefix.upperBound",
      build: (value) => ({
        action: "find_by_prefix",
        payload: { lowerBound: DRAFT_ID, upperBound: value },
      }),
    },
  ];

  for (const field of fields) {
    for (const [shape, value] of invalidValues) {
      await t.test(`${field.id}.${shape}`, async () => {
        const { handler, store, callerBindings } = await createHarness();
        const before = store.snapshot();
        const result = await readResult(handler, requestFor(field.build(value)));
        assert.equal(result.response.status, 400);
        assert.deepEqual(result.body, { ok: false, error: "INVALID_SELECTOR" });
        assert.equal(store.calls.length, 0);
        assert.equal(callerBindings.length, 0);
        assert.equal(store.snapshot(), before);
      });
    }
  }
});

test("emitted error codes exactly equal the versioned stable inventory", async (t) => {
  const { ERROR_STATUS_BY_CODE, MAX_BODY_BYTES } = await modulePromise;
  const contract = JSON.parse(
    fs.readFileSync(
      path.join(
        REPO_ROOT,
        "supabase",
        "functions",
        "discordos-update-drafts",
        "authorization-contract.v1.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(ERROR_STATUS_BY_CODE, contract.errorStatusByCode);

  const basicCase = (body, options) => async () => ({
    ...(await createHarness()),
    request: requestFor(body, options),
  });
  const cases = [
    ["UNAUTHORIZED", basicCase({ action: "list_latest", payload: {} }, { omitKey: true })],
    ["FORBIDDEN", basicCase(
      { action: "list_latest", payload: {} },
      { headers: { apikey: OTHER_KEY } },
    )],
    ["METHOD_NOT_ALLOWED", basicCase(null, { method: "GET", omitKey: true, omitContentType: true })],
    ["UNSUPPORTED_MEDIA_TYPE", basicCase(
      { action: "list_latest", payload: {} },
      { headers: { "content-type": "text/plain" } },
    )],
    ["PAYLOAD_TOO_LARGE", basicCase(
      { action: "list_latest", payload: {} },
      { headers: { "content-length": String(MAX_BODY_BYTES + 1) } },
    )],
    ["INVALID_PAYLOAD", basicCase(null, { rawBody: "{" })],
    ["UNSUPPORTED_ACTION", basicCase({ action: "delete", payload: {} })],
    ["INVALID_OPERATION_PAYLOAD", basicCase({ action: "list_latest", payload: { extra: true } })],
    ["INVALID_SELECTOR", basicCase({ action: "find_by_id", payload: { draftId: "not-a-uuid" } })],
    ["IMMUTABLE_FIELD", basicCase({
      action: "insert",
      payload: { values: { deploymentId: "dpl_inventory", status: "published" } },
    })],
    ["INVALID_REVISION", basicCase({
      action: "update",
      payload: { draftId: DRAFT_ID, expectedRevision: 0, values: { userFacingTitle: "Blocked" } },
    })],
    ["INVALID_TRANSITION", basicCase({
      action: "update",
      payload: { draftId: DRAFT_ID, expectedRevision: 1, transition: { to: "draft" } },
    })],
    ["EMPTY_UPDATE", basicCase({
      action: "update",
      payload: { draftId: DRAFT_ID, expectedRevision: 1 },
    })],
    ["CONFLICT", async () => {
      const harness = await createHarness();
      harness.store.failNext = { code: "DU003", message: "raw conflict detail" };
      return { ...harness, request: requestFor({ action: "list_latest", payload: {} }) };
    }],
    ["NOT_FOUND", basicCase({
      action: "update",
      payload: {
        draftId: "44444444-4444-4444-8444-444444444444",
        expectedRevision: 1,
        values: { userFacingTitle: "Missing" },
      },
    })],
    ["SERVICE_UNAVAILABLE", async () => {
      const harness = await createHarness({
        authenticate: async () => {
          throw new Error("raw authentication stack detail");
        },
      });
      return { ...harness, request: requestFor({ action: "list_latest", payload: {} }) };
    }],
    ["PRIVILEGED_OPERATION_FAILED", async () => {
      const harness = await createHarness();
      harness.store.failNext = {
        code: "XX999",
        message: "raw provider message",
        details: "raw provider details",
        hint: "raw provider hint",
        stack: "raw provider stack",
      };
      return { ...harness, request: requestFor({ action: "list_latest", payload: {} }) };
    }],
  ];

  const observed = new Set();
  for (const [expectedCode, createCase] of cases) {
    await t.test(expectedCode, async () => {
      const { handler, request } = await createCase();
      const result = await readResult(handler, request);
      assert.equal(result.response.status, ERROR_STATUS_BY_CODE[expectedCode]);
      assert.deepEqual(result.body, { ok: false, error: expectedCode });
      assert.doesNotMatch(
        JSON.stringify(result.body),
        /raw|provider|postgres|SQLSTATE|details|hint|stack|sb_secret|Bearer/i,
      );
      observed.add(result.body.error);
    });
  }

  const unknownAuthentication = await createHarness({
    authenticate: async () => ({
      ok: false,
      status: 418,
      error: "RAW_AUTHENTICATION_DETAIL",
      details: "raw secret-bearing detail",
    }),
  });
  const unknownResult = await readResult(
    unknownAuthentication.handler,
    requestFor({ action: "list_latest", payload: {} }),
  );
  assert.equal(unknownResult.response.status, 500);
  assert.deepEqual(unknownResult.body, { ok: false, error: "PRIVILEGED_OPERATION_FAILED" });
  assert.equal(unknownAuthentication.store.calls.length, 0);
  assert.equal(unknownAuthentication.callerBindings.length, 0);

  assert.deepEqual([...observed].sort(), Object.keys(contract.errorStatusByCode).sort());
  const contractDoc = fs.readFileSync(
    path.join(REPO_ROOT, "docs", "contracts", "discordos-update-drafts-authorization-v1.md"),
    "utf8",
  );
  for (const code of observed) assert.equal(contractDoc.includes(`\`${code}\``), true, code);
});

test("six authorized actions remain caller-bound and behaviorally distinct", async (t) => {
  const cases = [
    {
      id: "A01_list_latest",
      request: { action: "list_latest", payload: { limit: 1, status: "draft" } },
      rpc: "discordos_list_update_drafts",
      assertResult: ({ body }) => assert.equal(body.rows.length, 1),
    },
    {
      id: "A02_find_by_deployment_id",
      request: { action: "find_by_deployment_id", payload: { deploymentId: "dpl_seed" } },
      rpc: "discordos_get_update_draft_by_deployment_id",
      assertResult: ({ body }) => assert.equal(body.rows[0].id, DRAFT_ID),
    },
    {
      id: "A03_find_by_id",
      request: { action: "find_by_id", payload: { draftId: DRAFT_ID } },
      rpc: "discordos_get_update_draft_by_id",
      assertResult: ({ body }) => assert.equal(body.rows[0].deployment_id, "dpl_seed"),
    },
    {
      id: "A04_find_by_prefix",
      request: {
        action: "find_by_prefix",
        payload: { lowerBound: DRAFT_ID, upperBound: SECOND_DRAFT_ID, limit: 2 },
      },
      rpc: "discordos_get_update_draft_by_prefix",
      assertResult: ({ body }) => assert.equal(body.rows.length, 2),
    },
    {
      id: "A05_insert_idempotent",
      request: {
        action: "insert",
        payload: { values: { deploymentId: "dpl_authorized", gitCommitSha: "c".repeat(40) } },
      },
      rpc: "discordos_insert_update_draft",
      replay: true,
      assertResult: ({ body }) => assert.equal(body.rows[0].status, "draft"),
    },
    {
      id: "A06_update_compare_and_swap",
      request: {
        action: "update",
        payload: {
          draftId: DRAFT_ID,
          expectedRevision: 1,
          transition: { to: "published", actorDiscordUserId: "123456789012345678" },
        },
      },
      rpc: "discordos_update_update_draft",
      assertResult: ({ body }) => {
        assert.equal(body.rows[0].status, "published");
        assert.equal(body.rows[0].revision, 2);
      },
    },
  ];

  assert.equal(cases.length, 6);
  for (const entry of cases) {
    await t.test(entry.id, async () => {
      const { handler, store, callerBindings } = await createHarness();
      const result = await readResult(handler, requestFor(entry.request));
      assert.equal(result.response.status, 200);
      assert.equal(result.body.ok, true);
      assert.equal(store.calls[0].name, entry.rpc);
      assert.deepEqual(callerBindings[0], { serviceIdentity: "discordos-update-drafts-caller" });
      entry.assertResult(result);
      if (entry.replay) {
        const writes = store.writes;
        const replay = await readResult(handler, requestFor(entry.request));
        assert.equal(replay.response.status, 200);
        assert.equal(store.writes, writes, "identical insert replay must not write");
      }
    });
  }
});

test("five source provenance units bind the candidate without claiming deployment", () => {
  const contractPath = path.join(
    REPO_ROOT,
    "supabase",
    "functions",
    "discordos-update-drafts",
    "authorization-contract.v1.json",
  );
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  assert.equal(contract.denominator.total, 38);
  assert.equal(contract.denominator.sourceProvable, 34);
  assert.equal(contract.negativeUnits.length, 23);
  assert.equal(contract.authorizedUnits.length, 6);
  assert.equal(contract.provenanceUnits.length, 5);
  assert.equal(contract.deploymentUnits.length, 4);
  assert(contract.deploymentUnits.every(({ status }) => status === "blocked_not_executed"));
  assert.equal(contract.cutover.liveParityProven, false);
  assert.equal(contract.cutover.targetDeploymentAuthorized, false);

  for (const artifact of Object.values(contract.artifacts)) {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, artifact.path));
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.equal(stableSha256(bytes), artifact.sha256, artifact.path);
  }

  const config = fs.readFileSync(path.join(REPO_ROOT, "supabase", "config.toml"), "utf8");
  assert.match(config, /^\[functions\.discordos-update-drafts\]\nverify_jwt = false\n$/);

  const migrationPath = contract.artifacts.migration.path;
  assert(path.basename(migrationPath).startsWith("20260717232230_"));
  const migration = fs.readFileSync(path.join(REPO_ROOT, migrationPath), "utf8");
  assert.match(migration, /add column if not exists revision bigint not null default 1/);
  assert.match(migration, /and draft\.revision = expected_revision/);
  assert.match(migration, /on conflict \(deployment_id\) do nothing/);
  assert.equal((migration.match(/security invoker/g) ?? []).length, 6);
  assert.equal((migration.match(/grant execute on function/g) ?? []).length, 6);
  assert.doesNotMatch(migration, /security definer/i);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "supabase", "source-provenance.manifest.json"), "utf8"),
  );
  const candidate = manifest.sourceCandidates.find(
    ({ packet }) => packet === "FP-DOS-UPDATE-DRAFTS-AUTH-001",
  );
  assert(candidate);
  assert.equal(candidate.contractPath, path.relative(REPO_ROOT, contractPath).replaceAll("\\", "/"));
  assert.equal(candidate.deployed, false);
  assert.equal(candidate.providerMutationsPerformed, false);

  const changedArtifacts = [
    ...Object.values(contract.artifacts).map(({ path: artifactPath }) => artifactPath),
    path.relative(REPO_ROOT, contractPath).replaceAll("\\", "/"),
    "docs/contracts/discordos-update-drafts-authorization-v1.md",
    "docs/ops/discordos-update-drafts-auth-deployment-checklist-2026-07-17.md",
    "tests/discordos-update-drafts-authorization.test.js",
  ];
  const contents = changedArtifacts
    .map((relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"))
    .join("\n");
  assert.doesNotMatch(contents, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(contents, /sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(contents, /[A-Za-z]:\\(?:Users|ATLAS)\\/i);
});

test("runtime adapter pins named secret auth before admin-client construction", () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "supabase", "functions", "discordos-update-drafts", "index.ts"),
    "utf8",
  );
  assert.match(source, /npm:@supabase\/server@1\.4\.0\/core/);
  assert.match(source, /createNamedServiceAuthenticator\(verifyAuth\)/);
  assert.match(source, /createAdminClient\(\{ auth: \{ keyName: SERVICE_IDENTITY \} \}\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|DISCORDOS_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /fetch\(/);
});
