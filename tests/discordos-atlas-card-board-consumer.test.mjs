import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_CONTRACTS_ROOT,
  LIFECYCLE_STATE_MAP,
  buildConsumerReceipt,
  parseArgs,
  stableStringify,
} from "../scripts/discordos-atlas-card-board-consumer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "scripts", "discordos-atlas-card-board-consumer.mjs");

function makeCard(overrides = {}) {
  return {
    contract_version: "atlas.card-record.v2",
    card_id: "DOS-201",
    project_id: "discordos",
    board_id: "discordos:project-feedback:discordos",
    title: "Consume canonical board intent",
    description: "Prove independent DiscordOS semantic consumption.",
    card_type: "automation",
    lifecycle: "planning",
    priority: "high",
    owner: "discordos",
    dependencies: [],
    board_version: 7,
    updated_at: "2026-07-15T15:00:00Z",
    source_ref: "repos/DiscordOS/config/discordos-owner-work-registry.json#DOS-201",
    extensions: { owner_status: "planned" },
    ...overrides,
  };
}

function makeEvent(overrides = {}) {
  const event = {
    contract_version: "atlas.board-event.v2",
    event_id: "abe_82b612dd00b4eef14e956dd36becd830",
    idempotency_key: "abk_5d86480dcd46ce2aae327c3e82ea5b22",
    job_id: "job-discordos-201",
    card_id: "DOS-201",
    board_id: "discordos:project-feedback:discordos",
    event_type: "transition",
    occurred_at: "2026-07-15T15:01:00Z",
    expected_version: 7,
    intent: {
      from: "planning",
      to: "ready",
      reason: "The owner lane is ready for bounded execution.",
    },
    result: {
      status: "pending",
      observed_version: null,
      readback_at: null,
      receipt_ref: null,
      error_code: null,
    },
    extensions: {
      writer_authority: "discordos",
      external_mutation: "not_performed",
      execution_receipt_id: "receipt-discordos-201",
    },
  };
  return {
    ...event,
    ...overrides,
    intent: { ...event.intent, ...(overrides.intent || {}) },
    result: { ...event.result, ...(overrides.result || {}) },
    extensions: { ...event.extensions, ...(overrides.extensions || {}) },
  };
}

async function writeInputs(card = makeCard(), event = makeEvent()) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "discordos-card-board-"));
  const cardPath = path.join(directory, "card.json");
  const eventPath = path.join(directory, "event.json");
  await Promise.all([
    fs.writeFile(cardPath, `${JSON.stringify(card, null, 2)}\n`, "utf8"),
    fs.writeFile(eventPath, `${JSON.stringify(event, null, 2)}\n`, "utf8"),
  ]);
  return { directory, cardPath, eventPath };
}

async function rejectSemantic(card, event, expectedError) {
  const inputs = await writeInputs(card, event);
  await assert.rejects(
    () => buildConsumerReceipt(inputs),
    (error) => (
      error.reasonCode === "discordos_semantic_rejection"
      && error.errors.includes(expectedError)
    ),
  );
}

test("consumer resolves the portable Atlas layout and explicit override", async () => {
  const defaults = parseArgs(["--card", "card.json", "--event", "event.json"]);
  const override = parseArgs([
    "--card",
    "card.json",
    "--event",
    "event.json",
    "--contracts-root",
    DEFAULT_CONTRACTS_ROOT,
  ]);
  assert.equal(defaults.contractsRoot, null);
  assert.equal(override.contractsRoot, DEFAULT_CONTRACTS_ROOT);
  assert.equal(defaults.dryRun, true);

  const inputs = await writeInputs();
  const receipt = await buildConsumerReceipt({
    ...inputs,
    contractsRoot: DEFAULT_CONTRACTS_ROOT,
  });
  assert.equal(receipt.schema_source.resolution, "explicit_override");
});

test("consumer validates both schemas, applies owner semantics, and maps a dry run", async () => {
  const inputs = await writeInputs();
  const receipt = await buildConsumerReceipt(inputs);

  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, "admitted_dry_run");
  assert.equal(receipt.card_record.card_id, "DOS-201");
  assert.equal(receipt.board_event.event_id, "abe_82b612dd00b4eef14e956dd36becd830");
  assert.equal(receipt.canonical_schema_validation.card_record.status, "valid");
  assert.equal(receipt.canonical_schema_validation.board_event.status, "valid");
  assert.equal(receipt.schema_source.package_name, "@atlas/contracts");
  assert.equal(receipt.schema_source.resolution, "atlas_layout_default");
  assert.equal(receipt.semantic_consumption.mapped_lifecycle, "opened");
  assert.equal(receipt.semantic_consumption.lifecycle_sync.status, "sync_ready");
  assert.equal(receipt.writer_boundary.writer_authority, "discordos");
  assert.equal(receipt.writer_boundary.external_mutation, false);
  assert.equal(receipt.writer_boundary.storage_applied, false);
  assert.equal(receipt.writer_boundary.authority_drift, false);
  assert.match(receipt.input_digests.card_record, /^sha256:[a-f0-9]{64}$/);
  assert.match(receipt.input_digests.board_event, /^sha256:[a-f0-9]{64}$/);
});

test("consumer receipt is byte-stable for an identical replay", async () => {
  const inputs = await writeInputs();
  const first = await buildConsumerReceipt(inputs);
  const second = await buildConsumerReceipt(inputs);
  assert.equal(stableStringify(first), stableStringify(second));
  assert.equal(first.receipt_id, second.receipt_id);
  assert.equal(first.board_event.identity_digest, second.board_event.identity_digest);
});

test("consumer maps every canonical lifecycle into the existing sync vocabulary", () => {
  assert.deepEqual(LIFECYCLE_STATE_MAP, {
    intake: "opened",
    planning: "opened",
    ready: "opened",
    "in-progress": "in_progress",
    review: "in_progress",
    completed: "completed",
    archived: "closed",
    blocked: "blocked",
  });
});

test("consumer rejects a schema-invalid card", async () => {
  const inputs = await writeInputs(makeCard({ lifecycle: "doing" }));
  await assert.rejects(
    () => buildConsumerReceipt(inputs),
    (error) => error.reasonCode === "card_schema_invalid",
  );
});

test("consumer rejects a schema-invalid event and invalid result status", async () => {
  const inputs = await writeInputs(makeCard(), makeEvent({
    result: { status: "live" },
  }));
  await assert.rejects(
    () => buildConsumerReceipt(inputs),
    (error) => error.reasonCode === "event_schema_invalid",
  );
});

test("consumer rejects mismatched card identity", async () => {
  await rejectSemantic(makeCard(), makeEvent({ card_id: "DOS-999" }), "card_id_mismatch");
});

test("consumer rejects mismatched board identity", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({ board_id: "discordos:project-feedback:other" }),
    "board_id_mismatch",
  );
});

test("consumer rejects mismatched expected version", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({ expected_version: 6 }),
    "expected_version_mismatch",
  );
});

test("consumer rejects mismatched from state", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({ intent: { from: "intake" } }),
    "from_state_mismatch",
  );
});

test("consumer rejects wrong writer authority", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({ extensions: { writer_authority: "atlas" } }),
    "writer_authority_mismatch",
  );
});

test("consumer rejects unstable idempotency and event identities", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({
      event_id: "abe_00000000000000000000000000000000",
      idempotency_key: "abk_00000000000000000000000000000000",
    }),
    "event_idempotency_key_unstable",
  );
});

test("consumer rejects second-writer and production authority drift", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({ extensions: { second_writer: "atlas", deploy_authority: "production" } }),
    "authority_drift_detected",
  );
});

test("consumer rejects schema-valid but semantically inconsistent pending results", async () => {
  await rejectSemantic(
    makeCard(),
    makeEvent({
      result: {
        observed_version: 8,
        readback_at: "2026-07-15T15:02:00Z",
        receipt_ref: "runtime/receipts/board-event.json",
      },
    }),
    "pending_result_claims_readback_or_error",
  );
});

test("consumer CLI rejects every mutating, apply, live, and deploy request", async () => {
  const inputs = await writeInputs();
  for (const flag of [
    "--apply",
    "--apply-storage",
    "--live",
    "--write",
    "--send",
    "--deploy",
    "--production",
  ]) {
    const outcome = spawnSync(
      process.execPath,
      [cliPath, "--json", "--card", inputs.cardPath, "--event", inputs.eventPath, flag],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(outcome.status, 1, flag);
    const rejection = JSON.parse(outcome.stdout);
    assert.equal(rejection.reason_code, "mutation_not_admitted", flag);
    assert.equal(rejection.external_mutation, false, flag);
    assert.equal(rejection.authority_drift, false, flag);
  }
});
