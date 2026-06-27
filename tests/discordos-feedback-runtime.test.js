const assert = require("node:assert/strict");
const test = require("node:test");

const {
  _internals,
} = require("../src/extractions/fitness-feedback-runtime");

test("feedback runtime admits launcher button interactions", () => {
  assert.equal(_internals.isFeedbackInteraction({
    type: 3,
    data: { custom_id: "discordos_feedback_submit_open" },
  }), true);
  assert.equal(_internals.isFeedbackInteraction({
    type: 3,
    data: { custom_id: "discordos_feedback_update_open" },
  }), true);
  assert.equal(_internals.isFeedbackInteraction({
    type: 3,
    data: { custom_id: "music_sesh:queue" },
  }), false);
});

test("feedback runtime renders the submit picker with DiscordOS-owned custom ids", () => {
  const payload = _internals.buildSubmitPickerResponse("feature");
  assert.equal(payload.type, 4);
  assert.equal(payload.data.components[0].components[0].custom_id, "discordos_feedback_submit_pick_type");
  assert.equal(payload.data.components[1].components[0].custom_id, "discordos_feedback_submit_create:feature");
});

test("feedback runtime creates a report modal with DiscordOS-owned custom ids", () => {
  const payload = _internals.buildFeedbackReportModalResponse("bug");
  assert.equal(payload.type, 9);
  assert.equal(payload.data.custom_id, "discordos_feedback_report_modal:bug");
  assert.equal(payload.data.components[0].components[0].custom_id, "bug_summary");
});
