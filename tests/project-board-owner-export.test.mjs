import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildProjectBoardOwnerExport,
  renderProjectBoardOwnerExport,
  runProjectBoardOwnerExport
} from "../scripts/export-project-board-owner.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(repoRoot, "config", "discordos-owner-work-registry.json");
const registryBytes = fs.readFileSync(registryPath);
const registry = JSON.parse(registryBytes.toString("utf8"));

test("canonical owner registry exports three sorted non-complete cards", () => {
  const output = buildProjectBoardOwnerExport(registry, registryBytes);
  assert.equal(output.contract_version, "atlas.project-board.owner-export.v1");
  assert.equal(output.project_id, "discordos");
  assert.equal(output.cards.length, 3);
  assert.deepEqual(output.cards.map((card) => card.record.card_id), ["DOS-203", "DOS-204", "DOS-205"]);
  assert.equal(output.extensions.source_work_item_count, 8);
  assert.equal(output.extensions.discord_mutation_authorized, false);
});

test("completed capabilities stay exactly once in owner truth but not the live-card export", () => {
  const output = buildProjectBoardOwnerExport(registry, registryBytes);
  const completedIds = ["DOS-102", "DOS-GOV-001", "DOS-201", "DOS-202"];
  for (const id of completedIds) {
    const matches = registry.workItems.filter((item) => item.id === id);
    assert.equal(matches.length, 1, `${id} must remain unique in owner truth`);
    assert.equal(matches[0].status, "complete");
    assert.equal(output.cards.some((card) => card.record.card_id === id), false);
  }
  for (const id of ["DOS-201", "DOS-202"]) {
    const item = registry.workItems.find((candidate) => candidate.id === id);
    assert.ok(item.evidence.includes("docs/ops/discordos-canonical-13-board-migration-implementation-2026-07-15.md"));
  }
});

test("status mapping preserves planning and intake semantics", () => {
  const cards = buildProjectBoardOwnerExport(registry, registryBytes).cards;
  const lifecycleById = Object.fromEntries(cards.map((card) => [card.record.card_id, card.record.lifecycle]));
  assert.deepEqual(lifecycleById, {
    "DOS-203": "intake",
    "DOS-204": "intake",
    "DOS-205": "intake"
  });
});

test("cards keep explicit unknown priority, stable evidence, and idempotency", () => {
  const cards = buildProjectBoardOwnerExport(registry, registryBytes).cards;
  assert.equal(new Set(cards.map((card) => card.record.card_id)).size, cards.length);
  assert.equal(new Set(cards.map((card) => card.idempotency_key)).size, cards.length);
  for (const card of cards) {
    assert.equal(card.record.priority, null);
    assert.match(card.idempotency_key, /^pbk_discordos_dos-[a-z0-9-]+_v1$/);
    assert.match(card.record.source_ref, /^repos\/DiscordOS\/config\/discordos-owner-work-registry\.json#DOS-/);
    assert.ok(card.content.acceptance_criteria.length >= 3);
    assert.ok(card.content.evidence.every((value) => value.startsWith("repos/DiscordOS/")));
  }
});

test("canonical export is deterministic and current", () => {
  const first = renderProjectBoardOwnerExport(repoRoot);
  const second = renderProjectBoardOwnerExport(repoRoot);
  assert.equal(first, second);
  assert.equal(
    first.replace(/\r\n?/g, "\n"),
    fs.readFileSync(path.join(repoRoot, "exports", "discordos.project-board.owner-export.v1.json"), "utf8").replace(/\r\n?/g, "\n")
  );
});

test("check mode rejects stale output and accepts exact output", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "discordos-owner-export-"));
  fs.mkdirSync(path.join(temporaryRoot, "config"), { recursive: true });
  fs.mkdirSync(path.join(temporaryRoot, "exports"), { recursive: true });
  fs.copyFileSync(registryPath, path.join(temporaryRoot, "config", "discordos-owner-work-registry.json"));
  assert.throws(() => runProjectBoardOwnerExport(["--check"], temporaryRoot), /is stale/);
  runProjectBoardOwnerExport([], temporaryRoot);
  assert.doesNotThrow(() => runProjectBoardOwnerExport(["--check"], temporaryRoot));
});

test("invalid owner data fails closed", () => {
  const duplicate = structuredClone(registry);
  duplicate.workItems.push(structuredClone(duplicate.workItems[0]));
  assert.throws(() => buildProjectBoardOwnerExport(duplicate, Buffer.from(JSON.stringify(duplicate))), /ids must be unique/);

  const badStatus = structuredClone(registry);
  badStatus.workItems.find((item) => item.id === "DOS-201").status = "ready-ish";
  assert.throws(() => buildProjectBoardOwnerExport(badStatus, Buffer.from(JSON.stringify(badStatus))), /unsupported non-complete/);

  const inventedPriority = structuredClone(registry);
  inventedPriority.workItems.find((item) => item.id === "DOS-203").priority = "high";
  assert.throws(() => buildProjectBoardOwnerExport(inventedPriority, Buffer.from(JSON.stringify(inventedPriority))), /priority must remain null/);
});
