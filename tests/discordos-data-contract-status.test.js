const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-data-contract-status");

async function writeFile(dir, fileName, text) {
  const filePath = path.join(dir, fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
}

test("data contract status args default to contract paths", () => {
  assert.deepEqual(_internals.parseArgs([]), {
    json: false,
    docsFile: _internals.DEFAULT_DOCS_FILE,
    sourceFile: _internals.DEFAULT_SOURCE_FILE,
  });
});

test("data contract status passes for docs and runtime-free source contract", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-data-contract-"));
  const docsFile = await writeFile(
    dir,
    "docs/contracts/discordos-data-runtime.md",
    _internals.REQUIRED_DOC_ANCHORS.join("\n")
  );
  const sourceFile = await writeFile(
    dir,
    "src/contracts/data.ts",
    [
      ..._internals.REQUIRED_SOURCE_EXPORTS.map((name) => `export interface ${name} { value: string; }`),
      ..._internals.REQUIRED_DOMAINS.map((domain) => `"${domain}"`),
    ].join("\n")
  );

  const result = await _internals.buildDiscordOSDataContractStatus({ docsFile, sourceFile });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.event.type, "discordos.data_contract.ready");
});

test("data contract status blocks missing anchors, exports, domains, and runtime tokens", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-data-contract-blocked-"));
  const docsFile = await writeFile(dir, "docs/contracts/discordos-data-runtime.md", "## Scope\n");
  const sourceFile = await writeFile(dir, "src/contracts/data.ts", "export interface One {}\nfetch('/x')\n");

  const result = await _internals.buildDiscordOSDataContractStatus({ docsFile, sourceFile });

  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes("data_contract_docs_anchor_missing"));
  assert(result.reasonCodes.includes("data_contract_source_export_missing"));
  assert(result.reasonCodes.includes("data_contract_domain_missing"));
  assert(result.reasonCodes.includes("data_contract_runtime_token_present"));
});

test("data contract status renders bounded output", () => {
  const rendered = _internals.renderMarkdown({
    ok: true,
    destructive: false,
    sendsMessages: false,
    writesArtifacts: false,
    status: "ready",
    event: { type: "discordos.data_contract.ready" },
    docs: { ok: true, missing: [] },
    sourceExports: { ok: true, missing: [] },
    domains: { ok: true, missing: [] },
    runtimeFree: { ok: true },
    reasonCodes: [],
  });

  assert(rendered.includes("# DiscordOS Data Contract Status"));
  assert(rendered.includes("runtime-free source: `ready`"));
  assert(!rendered.includes("process.env"));
});
