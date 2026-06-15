const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-music-sesh-response-delivery-rate-limit-alert-delivery-history");

test("rate-limit alert delivery history tracks bounded no-send dashboard records", async () => {
  const result = await _internals.buildMusicSeshResponseDeliveryRateLimitAlertDeliveryHistory();

  assert.equal(result.ok, true);
  assert.equal(result.sendsMessages, false);
  assert.equal(result.callsDiscordApi, false);
  assert.equal(result.executesStorageWrite, false);
  assert.equal(result.slashCommandsAdmitted, false);
  assert.equal(result.history.historyStatus, "bounded_ready");
  assert.equal(result.history.recordCount, 1);
  assert.equal(result.history.records[0].userContentHidden, true);
  assert.equal(result.history.records[0].mentionSafetyPreserved, true);
});

test("rate-limit alert delivery history rejects invalid records", () => {
  const reasonCodes = _internals.validateRateLimitAlertDeliveryHistory({
    dashboardResult: {
      reasonCodes: [],
      sendsMessages: false,
      callsDiscordApi: false,
      slashCommandsAdmitted: false,
    },
    history: {
      historyStatus: "bounded_ready",
      recordCount: 1,
      maxRecords: 10,
      repeatsTracked: true,
      records: [
        {
          deliveryDecisionVisible: true,
          noSendBoundaryConfirmed: true,
          noDiscordApiBoundaryConfirmed: true,
          userContentHidden: false,
          mentionSafetyPreserved: true,
        },
      ],
      executesStorageWrite: false,
      slashCommandsAdmitted: false,
    },
  });

  assert(reasonCodes.includes("music_sesh_rate_limit_alert_delivery_history_record_invalid"));
});
