const fs = require("node:fs/promises");

const MAX_RECOVERY_PASSES = 2;
const FATAL_PATTERNS = new Set(["replacement_character", "unpaired_surrogate"]);
const KNOWN_ORPHANED_LEADS = new Set([0x00c2, 0x00c3, 0x00d0, 0x00d1, 0x00e2, 0x00f0]);
const WINDOWS_1252_SPECIAL_CODE_POINTS = Object.freeze({
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
});

const WINDOWS_1252_BYTE_TO_CODE_POINT = Array.from({ length: 256 }, (_, byte) => byte);
for (const [byte, codePoint] of Object.entries(WINDOWS_1252_SPECIAL_CODE_POINTS)) {
  WINDOWS_1252_BYTE_TO_CODE_POINT[Number(byte)] = codePoint;
}
const WINDOWS_1252_CODE_POINT_TO_BYTE = new Map(
  WINDOWS_1252_BYTE_TO_CODE_POINT.map((codePoint, byte) => [codePoint, byte])
);

class TextIntegrityError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "TextIntegrityError";
    this.code = code;
    this.details = details;
  }
}

function codePointLabel(codePoint) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function codePointEvidence(value) {
  return [...String(value || "")].map((character) => codePointLabel(character.codePointAt(0)));
}

function sliceUtf16Safe(value, maxLength) {
  const input = String(value || "");
  let end = Math.max(0, Math.min(input.length, maxLength));
  if (end > 0 && end < input.length) {
    const previous = input.charCodeAt(end - 1);
    const next = input.charCodeAt(end);
    if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end -= 1;
  }
  return input.slice(0, end);
}

function span(pattern, value, start, end, extra = {}) {
  const matchedText = value.slice(start, end);
  return {
    pattern,
    start,
    end,
    text: matchedText,
    codePoints: codePointEvidence(matchedText),
    ...extra,
  };
}

function unpairedSurrogateSpans(value) {
  const findings = [];
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      findings.push(span("unpaired_surrogate", value, index, index + 1, {
        codeUnits: [`0x${codeUnit.toString(16).toUpperCase().padStart(4, "0")}`],
      }));
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      findings.push(span("unpaired_surrogate", value, index, index + 1, {
        codeUnits: [`0x${codeUnit.toString(16).toUpperCase().padStart(4, "0")}`],
      }));
    }
  }
  return findings;
}

function encodeWindows1252(value) {
  const bytes = [];
  for (const character of String(value || "")) {
    const codePoint = character.codePointAt(0);
    const byte = WINDOWS_1252_CODE_POINT_TO_BYTE.get(codePoint);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

function decodeWindows1252(bytes) {
  return [...bytes]
    .map((byte) => String.fromCodePoint(WINDOWS_1252_BYTE_TO_CODE_POINT[byte]))
    .join("");
}

function decodeUtf8(bytes, source = "input") {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TextIntegrityError("invalid_utf8", { source, cause: error.message });
  }
}

function expectedUtf8SequenceLength(firstByte) {
  if (firstByte >= 0xc2 && firstByte <= 0xdf) return 2;
  if (firstByte >= 0xe0 && firstByte <= 0xef) return 3;
  if (firstByte >= 0xf0 && firstByte <= 0xf4) return 4;
  return 0;
}

function windows1252Utf8CandidateAt(value, start) {
  const firstCodePoint = value.codePointAt(start);
  if (!KNOWN_ORPHANED_LEADS.has(firstCodePoint)) return null;
  const firstByte = WINDOWS_1252_CODE_POINT_TO_BYTE.get(firstCodePoint);
  const length = expectedUtf8SequenceLength(firstByte);
  if (length === 0) return null;
  const sourceText = value.slice(start, start + length);
  if ([...sourceText].length !== length) return null;
  const bytes = encodeWindows1252(sourceText);
  if (!bytes || bytes.length !== length) return null;
  let decoded;
  try {
    decoded = decodeUtf8(bytes, "windows_1252_recovery_candidate");
  } catch {
    return null;
  }
  if ([...decoded].length !== 1 || decodeWindows1252(Buffer.from(decoded, "utf8")) !== sourceText) {
    return null;
  }
  return span("windows_1252_utf8", value, start, start + length, {
    decodedText: decoded,
    decodedCodePoints: codePointEvidence(decoded),
    bytes: [...bytes].map((byte) => `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`),
    roundTrips: true,
  });
}

function orphanedWindows1252SpanAt(value, start) {
  const firstCodePoint = value.codePointAt(start);
  if (!KNOWN_ORPHANED_LEADS.has(firstCodePoint)) return null;
  const firstByte = WINDOWS_1252_CODE_POINT_TO_BYTE.get(firstCodePoint);
  const length = expectedUtf8SequenceLength(firstByte);
  if (length === 0) return null;
  let observedLength = 1;
  for (let offset = 1; offset < length && start + offset < value.length; offset += 1) {
    const byte = WINDOWS_1252_CODE_POINT_TO_BYTE.get(value.codePointAt(start + offset));
    if (byte === undefined || byte < 0x80 || byte > 0xbf) break;
    observedLength += 1;
  }
  if (observedLength === 1) return null;
  return span("windows_1252_utf8_non_round_trippable", value, start, start + observedLength, {
    expectedByteLength: length,
    observedByteLength: observedLength,
  });
}

function rangeContains(ranges, index) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function patternWeight(pattern) {
  if (pattern === "replacement_character" || pattern === "unpaired_surrogate") return 1000;
  if (pattern === "windows_1252_utf8_non_round_trippable") return 50;
  if (pattern === "c1_control") return 20;
  if (pattern === "windows_1252_utf8") return 10;
  return 1;
}

function classifyText(value) {
  const input = typeof value === "string" ? value : String(value ?? "");
  const findings = [...unpairedSurrogateSpans(input)];
  const candidates = [];

  for (let index = 0; index < input.length;) {
    const candidate = windows1252Utf8CandidateAt(input, index);
    if (candidate) {
      candidates.push(candidate);
      findings.push(candidate);
      index = candidate.end;
      continue;
    }
    const orphaned = orphanedWindows1252SpanAt(input, index);
    if (orphaned) findings.push(orphaned);
    index += input.codePointAt(index) > 0xffff ? 2 : 1;
  }

  for (let index = 0; index < input.length; index += 1) {
    const codePoint = input.codePointAt(index);
    if (codePoint === 0xfffd) findings.push(span("replacement_character", input, index, index + 1));
    if (codePoint >= 0x80 && codePoint <= 0x9f && !rangeContains(candidates, index)) {
      findings.push(span("c1_control", input, index, index + 1));
    }
    if (codePoint > 0xffff) index += 1;
  }

  findings.sort((left, right) => left.start - right.start || left.end - right.end || left.pattern.localeCompare(right.pattern));
  const patternCounts = {};
  for (const finding of findings) {
    patternCounts[finding.pattern] = (patternCounts[finding.pattern] || 0) + 1;
  }
  const fatal = findings.some((finding) => FATAL_PATTERNS.has(finding.pattern));
  const score = findings.reduce((total, finding) => total + patternWeight(finding.pattern), 0);
  const normalizedText = findings.some((finding) => finding.pattern === "unpaired_surrogate")
    ? input
    : input.normalize("NFC");
  return {
    ok: !fatal && score === 0,
    status: fatal ? "invalid" : score > 0 ? "corrupt" : "clean",
    input,
    normalizedText,
    nfc: normalizedText === input,
    fatal,
    score,
    patternCounts,
    findings,
  };
}

function recoveryFailure(code, originalText, classification, passes = []) {
  return {
    ok: false,
    status: "blocked",
    reasonCodes: [code],
    originalText,
    text: originalText,
    changed: false,
    passCount: passes.length,
    scoreBefore: passes[0]?.scoreBefore ?? classification.score,
    scoreAfter: classification.score,
    classification,
    passes,
  };
}

function recoverText(value, { maxPasses = MAX_RECOVERY_PASSES } = {}) {
  if (!Number.isInteger(maxPasses) || maxPasses < 0 || maxPasses > MAX_RECOVERY_PASSES) {
    throw new TextIntegrityError("text_recovery_pass_limit_invalid", { maxPasses });
  }
  const originalText = typeof value === "string" ? value : String(value ?? "");
  let current = originalText;
  let classification = classifyText(current);
  const passes = [];
  if (classification.fatal) {
    const pattern = classification.findings.find((finding) => FATAL_PATTERNS.has(finding.pattern))?.pattern;
    return recoveryFailure(pattern === "replacement_character" ? "replacement_character_present" : "unpaired_surrogate_present", originalText, classification);
  }

  for (let pass = 1; pass <= maxPasses && classification.score > 0; pass += 1) {
    const candidates = classification.findings.filter((finding) => finding.pattern === "windows_1252_utf8");
    const covered = candidates;
    const unresolved = classification.findings.filter((finding) =>
      finding.pattern !== "windows_1252_utf8"
      && !(finding.pattern === "c1_control" && rangeContains(covered, finding.start))
    );
    if (candidates.length === 0) {
      return recoveryFailure("text_recovery_non_round_trippable", originalText, classification, passes);
    }
    if (unresolved.length > 0) {
      return recoveryFailure("text_recovery_ambiguous", originalText, classification, passes);
    }

    let recovered = "";
    let cursor = 0;
    for (const candidate of candidates) {
      if (candidate.start < cursor || candidate.roundTrips !== true) {
        return recoveryFailure("text_recovery_ambiguous", originalText, classification, passes);
      }
      recovered += current.slice(cursor, candidate.start) + candidate.decodedText;
      cursor = candidate.end;
    }
    recovered = `${recovered}${current.slice(cursor)}`.normalize("NFC");
    const nextClassification = classifyText(recovered);
    if (nextClassification.fatal || nextClassification.score >= classification.score) {
      return recoveryFailure("text_recovery_score_not_reduced", originalText, classification, passes);
    }
    passes.push({
      pass,
      before: current,
      after: recovered,
      scoreBefore: classification.score,
      scoreAfter: nextClassification.score,
      findings: candidates,
    });
    current = recovered;
    classification = nextClassification;
  }

  if (classification.score > 0) {
    return recoveryFailure("text_recovery_pass_limit_exceeded", originalText, classification, passes);
  }
  return {
    ok: true,
    status: passes.length > 0 ? "recovered" : "clean",
    reasonCodes: [],
    originalText,
    text: classification.normalizedText,
    changed: classification.normalizedText !== originalText,
    passCount: passes.length,
    scoreBefore: passes[0]?.scoreBefore ?? 0,
    scoreAfter: 0,
    classification,
    passes,
  };
}

function normalizeNfc(value) {
  const classification = classifyText(value);
  if (classification.fatal) {
    const code = classification.findings.some((finding) => finding.pattern === "replacement_character")
      ? "replacement_character_present"
      : "unpaired_surrogate_present";
    throw new TextIntegrityError(code, { findings: classification.findings });
  }
  return classification.normalizedText;
}

function assertCleanText(value, { field = "text" } = {}) {
  const classification = classifyText(value);
  if (!classification.ok) {
    throw new TextIntegrityError("text_integrity_check_failed", { field, classification });
  }
  return classification.normalizedText;
}

function inspectObjectText(value, path = "$") {
  const findings = [];
  if (typeof value === "string") {
    const classification = classifyText(value);
    if (!classification.ok) findings.push({ path, classification });
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...inspectObjectText(item, `${path}[${index}]`)));
    return findings;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findings.push(...inspectObjectText(item, `${path}.${key}`));
    }
  }
  return findings;
}

function normalizeObjectNfc(value) {
  if (typeof value === "string") return normalizeNfc(value);
  if (Array.isArray(value)) return value.map(normalizeObjectNfc);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeObjectNfc(item)]));
  }
  return value;
}

async function readUtf8File(filePath, { fsImpl = fs } = {}) {
  const bytes = await fsImpl.readFile(filePath);
  const text = decodeUtf8(bytes, filePath);
  const classification = classifyText(text);
  if (classification.fatal) {
    const code = classification.findings.some((finding) => finding.pattern === "replacement_character")
      ? "replacement_character_present"
      : "unpaired_surrogate_present";
    throw new TextIntegrityError(code, { source: filePath, findings: classification.findings });
  }
  return classification.normalizedText;
}

async function readUtf8Json(filePath, options = {}) {
  const text = await readUtf8File(filePath, options);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new TextIntegrityError("invalid_json", { source: filePath, cause: error.message });
  }
  return normalizeObjectNfc(value);
}

module.exports = {
  _internals: {
    MAX_RECOVERY_PASSES,
    FATAL_PATTERNS,
    TextIntegrityError,
    codePointLabel,
    codePointEvidence,
    sliceUtf16Safe,
    encodeWindows1252,
    decodeWindows1252,
    decodeUtf8,
    classifyText,
    recoverText,
    normalizeNfc,
    assertCleanText,
    inspectObjectText,
    normalizeObjectNfc,
    readUtf8File,
    readUtf8Json,
  },
};
