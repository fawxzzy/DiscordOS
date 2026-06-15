const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-moderation-audit-review-search");

test("moderation audit review search parses filters", () => {
  const parsed = _internals.parseArgs([
    "--json",
    "--case-id",
    "MOD 1",
    "--action",
    "warn",
    "--subject-fingerprint",
    "a2a814902547",
    "--limit",
    "5",
    "--live",
  ]);

  assert.equal(parsed.json, true);
  assert.equal(parsed.live, true);
  assert.equal(parsed.caseId, "mod-1");
  assert.equal(parsed.action, "warn");
  assert.equal(parsed.subjectFingerprint, "a2a814902547");
  assert.equal(parsed.limit, 5);
});

test("moderation audit review search builds a dry query plan", async () => {
  const result = await _internals.buildModerationAuditReviewSearch({
    caseId: "mod-1",
    action: "warn",
    subjectFingerprint: "a2a814902547",
    limit: 5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.liveAttempted, false);
  assert.equal(result.status, "review_search_ready");
  assert.equal(result.query.case_id, "mod-1");
});

test("moderation audit review search fetches sanitized rows when live", async () => {
  const calls = [];
  const result = await _internals.buildModerationAuditReviewSearch({
    live: true,
    caseId: "mod-1",
    limit: 5,
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
          rows: [
            {
              caseId: "mod-1",
              actionType: "warn",
              severity: "medium",
              actorFingerprint: "c83c674e7ac4",
              subjectFingerprint: "a2a814902547",
              reasonPresent: true,
              notePresent: false,
              occurredAt: "2026-06-15T01:30:00Z",
            },
          ],
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.liveAttempted, true);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.rows[0].actorFingerprintPresent, true);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/discordos_search_moderation_audit");
});

test("moderation audit review search renders without raw ids", async () => {
  const result = await _internals.buildModerationAuditReviewSearch({
    caseId: "mod-1",
    subjectFingerprint: "a2a814902547",
  });
  const rendered = _internals.renderMarkdown(result);

  assert(rendered.includes("# DiscordOS Moderation Audit Review Search"));
  assert(rendered.includes("sends messages: `false`"));
  assert(!rendered.includes("1504671871512346695"));
});
