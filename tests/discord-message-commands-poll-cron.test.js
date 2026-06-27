const assert = require("node:assert/strict");
const test = require("node:test");

const cronDiscordMessageCommandsPoll = require("../api/cron/discord-message-commands-poll");

function createRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("discord message command poll cron rejects non-GET requests", async () => {
  const req = { method: "POST", headers: {} };
  const res = createRes();

  await cronDiscordMessageCommandsPoll(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
  assert.equal(res.body.error, "METHOD_NOT_ALLOWED");
});
