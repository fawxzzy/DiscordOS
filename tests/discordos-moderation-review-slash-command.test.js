const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-review-slash-command");

test("moderation review slash command parses filters", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--subcommand",
    "case",
    "--case-id",
    "mod-1",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.subcommand, "case");
  assert.equal(parsed.caseId, "mod-1");
});

test("moderation review slash command wraps dry search", async () => {
  const result = await _internals.buildModerationReviewSlashCommand({
    subcommand: "search",
    action: "warn",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.executesModerationAction, false);
  assert.equal(result.search.status, "review_search_ready");
});

test("moderation review slash command supports live sanitized search", async () => {
  const calls = [];
  const result = await _internals.buildModerationReviewSlashCommand({
    live: true,
    subcommand: "case",
    caseId: "mod-1",
    env: {
      DISCORDOS_SUPABASE_URL: "https://example.supabase.co",
      DISCORDOS_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          returnedCount: 1,
          rows: [{ caseId: "mod-1", actionType: "warn", severity: "medium" }],
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.search.returnedCount, 1);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_search_moderation_audit");
});

test("moderation review slash command renders bounded markdown", async () => {
  const result = await _internals.buildModerationReviewSlashCommand({ action: "warn" });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Review Slash Command"));
  assert(rendered.includes("executes moderation action: `false`"));
});
