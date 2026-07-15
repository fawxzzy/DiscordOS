const assert = require("node:assert/strict");
const test = require("node:test");

const { _internals } = require("../scripts/discordos-board-text-integrity");

test("valid Unicode typography and non-English names remain exact while NFC is normalized", () => {
  const valid = "\u201cJos\u00e9 \u00c1lvarez\u201d \u2014 \u041c\u0430\u0440\u0438\u044f \u2013 \u674e\u96f7";
  const classification = _internals.classifyText(valid);
  assert.equal(classification.ok, true);
  assert.equal(classification.normalizedText, valid);

  const adjacent = "\u201cJos\u00e9\u201d\u2014\u041c\u0430\u0440\u0438\u044f\u2013\u674e\u96f7";
  const adjacentClassification = _internals.classifyText(adjacent);
  assert.equal(adjacentClassification.ok, true);
  assert.equal(adjacentClassification.normalizedText, adjacent);

  const decomposed = "Jose\u0301";
  const recovered = _internals.recoverText(decomposed);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.status, "clean");
  assert.equal(recovered.text, "Jos\u00e9");
  assert.equal(recovered.passCount, 0);
});

test("single and double Windows-1252 corruption recover only through reducing round trips", () => {
  const single = _internals.recoverText("History \u00e2\u20ac\u201d Progress");
  assert.equal(single.ok, true);
  assert.equal(single.text, "History \u2014 Progress");
  assert.equal(single.passCount, 1);
  assert(single.passes[0].scoreAfter < single.passes[0].scoreBefore);
  assert(single.passes[0].findings.every((finding) => finding.roundTrips));

  const double = _internals.recoverText("History \u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u009d Progress");
  assert.equal(double.ok, true);
  assert.equal(double.text, "History \u2014 Progress");
  assert.equal(double.passCount, 2);
  assert(double.passes.every((pass) => pass.scoreAfter < pass.scoreBefore));
});

test("classification emits exact spans, bytes, and code points", () => {
  const result = _internals.classifyText("X \u00e2\u20ac\u201d Y");
  assert.equal(result.status, "corrupt");
  assert.deepEqual(result.patternCounts, { windows_1252_utf8: 1 });
  assert.deepEqual(result.findings[0], {
    pattern: "windows_1252_utf8",
    start: 2,
    end: 5,
    text: "\u00e2\u20ac\u201d",
    codePoints: ["U+00E2", "U+20AC", "U+201D"],
    decodedText: "\u2014",
    decodedCodePoints: ["U+2014"],
    bytes: ["0xE2", "0x80", "0x94"],
    roundTrips: true,
  });
});

test("ambiguous, non-round-trippable, and over-two-pass recovery fail closed", () => {
  const ambiguous = _internals.recoverText("Jos\u00c3\u00a9 plus broken \u00e2\u20ac");
  assert.equal(ambiguous.ok, false);
  assert.deepEqual(ambiguous.reasonCodes, ["text_recovery_ambiguous"]);

  const nonRoundTrippable = _internals.recoverText("broken \u00e2\u20ac");
  assert.equal(nonRoundTrippable.ok, false);
  assert.deepEqual(nonRoundTrippable.reasonCodes, ["text_recovery_non_round_trippable"]);

  let triple = "\u2014";
  for (let pass = 0; pass < 3; pass += 1) {
    triple = _internals.decodeWindows1252(Buffer.from(triple, "utf8"));
  }
  const limited = _internals.recoverText(triple);
  assert.equal(limited.ok, false);
  assert.equal(limited.passCount, 2);
  assert.deepEqual(limited.reasonCodes, ["text_recovery_pass_limit_exceeded"]);
});

test("fatal UTF-8, replacement characters, and unpaired surrogates fail closed", async () => {
  await assert.rejects(
    _internals.readUtf8File("invalid.json", {
      fsImpl: { readFile: async () => Buffer.from([0xc3, 0x28]) },
    }),
    (error) => error.code === "invalid_utf8"
  );
  await assert.rejects(
    _internals.readUtf8File("replacement.json", {
      fsImpl: { readFile: async () => Buffer.from("value \ufffd", "utf8") },
    }),
    (error) => error.code === "replacement_character_present"
  );

  const replacement = _internals.recoverText("value \ufffd");
  assert.equal(replacement.ok, false);
  assert.deepEqual(replacement.reasonCodes, ["replacement_character_present"]);

  const surrogate = _internals.recoverText(`value ${String.fromCharCode(0xd800)}`);
  assert.equal(surrogate.ok, false);
  assert.deepEqual(surrogate.reasonCodes, ["unpaired_surrogate_present"]);
  assert.equal(surrogate.classification.findings[0].start, 6);
  assert.deepEqual(surrogate.classification.findings[0].codeUnits, ["0xD800"]);
});

test("length compaction never splits a surrogate pair", () => {
  const emoji = "\ud83d\ude00";
  assert.equal(_internals.sliceUtf16Safe(`${emoji}x`, 1), "");
  assert.equal(_internals.sliceUtf16Safe(`${emoji}x`, 2), emoji);
  assert.equal(_internals.classifyText(_internals.sliceUtf16Safe(`${emoji}x`, 2)).ok, true);
});
