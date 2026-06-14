const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_ATLAS_ROOT = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_MARKER_FILE_PATH = path.resolve(
  DEFAULT_ATLAS_ROOT,
  "docs",
  "atlas-book",
  "02-lanes-and-markers.md"
);

const SECTION_HEADERS = {
  "## Active Front-Page Marker Table": {
    id: "active_front_page",
    label: "active front-page",
    status: "open",
  },
  "## Supporting Open Markers": {
    id: "supporting_open",
    label: "supporting open",
    status: "open",
  },
  "## Closed / Locked Ratchets": {
    id: "closed_locked",
    label: "closed / locked",
    status: "closed",
  },
};

const MARKER_LINE_PATTERN = /^- ([^:]+): `(\d+)%`$/;

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeMarkerName(value) {
  return String(value || "").replace(/`/g, "").trim();
}

function normalizeMarkerNames(markers) {
  const seen = new Set();
  const normalized = [];

  for (const marker of Array.isArray(markers) ? markers : []) {
    const name = normalizeMarkerName(marker);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    normalized.push(name);
  }

  return normalized;
}

function buildSourceRef(markerFilePath) {
  const normalized = path.normalize(markerFilePath);
  const canonicalSuffix = path.normalize(
    path.join("docs", "atlas-book", "02-lanes-and-markers.md")
  );

  return normalized.endsWith(canonicalSuffix)
    ? "docs/atlas-book/02-lanes-and-markers.md"
    : normalized;
}

function parseMarkerBoard(markdown) {
  const markerIndex = new Map();
  let activeSection = null;

  for (const rawLine of String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (SECTION_HEADERS[line]) {
      activeSection = SECTION_HEADERS[line];
      continue;
    }
    if (line.startsWith("## ")) {
      activeSection = null;
      continue;
    }
    if (!activeSection) {
      continue;
    }

    const match = MARKER_LINE_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const name = normalizeMarkerName(match[1]);
    const completionPercent = Number.parseInt(match[2], 10);
    const entry = {
      name,
      completionPercent,
      sectionId: activeSection.id,
      sectionLabel: activeSection.label,
      status: activeSection.status,
    };

    const existing = markerIndex.get(name) || [];
    existing.push(entry);
    markerIndex.set(name, existing);
  }

  return { markerIndex };
}

function buildWorkflowMarkerSnapshot({ name, entries }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`marker_not_found:${name}`);
  }

  const completionPercents = [...new Set(entries.map((entry) => entry.completionPercent))];
  if (completionPercents.length !== 1) {
    throw new Error(`marker_percentage_conflict:${name}`);
  }

  const statuses = [...new Set(entries.map((entry) => entry.status))];
  if (statuses.length !== 1) {
    throw new Error(`marker_status_conflict:${name}`);
  }

  const sectionLabels = [...new Set(entries.map((entry) => entry.sectionLabel))];
  const sectionIds = [...new Set(entries.map((entry) => entry.sectionId))];

  return {
    name,
    completionPercent: completionPercents[0],
    status: statuses[0],
    sectionLabels,
    sectionIds,
  };
}

function summarizeWorkflowMarkers(markers) {
  const completionPercents = markers.map((marker) => marker.completionPercent);

  return {
    markerCount: markers.length,
    openMarkerCount: markers.filter((marker) => marker.status === "open").length,
    closedMarkerCount: markers.filter((marker) => marker.status === "closed").length,
    lowestCompletionPercent: completionPercents.length ? Math.min(...completionPercents) : null,
    highestCompletionPercent: completionPercents.length ? Math.max(...completionPercents) : null,
  };
}

async function resolveWorkflowMarkerProgress({
  markers = [],
  markerFilePath = DEFAULT_MARKER_FILE_PATH,
  fsImpl = fs,
} = {}) {
  const normalizedMarkers = normalizeMarkerNames(markers);
  if (normalizedMarkers.length === 0) {
    return null;
  }

  const raw = await fsImpl.readFile(markerFilePath, "utf8");
  const parsed = parseMarkerBoard(raw);
  const resolvedMarkers = normalizedMarkers.map((name) =>
    buildWorkflowMarkerSnapshot({
      name,
      entries: parsed.markerIndex.get(name),
    })
  );

  return {
    sourceRef: buildSourceRef(markerFilePath),
    markers: resolvedMarkers,
    summary: summarizeWorkflowMarkers(resolvedMarkers),
  };
}

function renderWorkflowMarkerMarkdown(progress) {
  if (!progress || !Array.isArray(progress.markers) || progress.markers.length === 0) {
    return "";
  }

  const lines = [
    "Workflow markers:",
    "",
    `- marker source: \`${progress.sourceRef}\``,
    `- marker count: \`${progress.summary.markerCount}\``,
    `- open markers: \`${progress.summary.openMarkerCount}\``,
    `- closed markers: \`${progress.summary.closedMarkerCount}\``,
  ];

  if (progress.summary.lowestCompletionPercent !== null && progress.summary.highestCompletionPercent !== null) {
    lines.push(
      `- completion range: \`${progress.summary.lowestCompletionPercent}-${progress.summary.highestCompletionPercent}%\``
    );
  }

  for (const marker of progress.markers) {
    lines.push(
      `- \`${marker.name}\`: \`${marker.completionPercent}%\` (\`${marker.sectionLabels.join(", ")}\`)`
    );
  }

  return `${lines.join("\n")}\n`;
}

function appendWorkflowMarkerMarkdown(body, progress) {
  const normalizedBody = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const markerMarkdown = renderWorkflowMarkerMarkdown(progress).trim();

  if (!markerMarkdown) {
    return normalizedBody;
  }
  if (!normalizedBody) {
    return markerMarkdown;
  }

  return `${normalizedBody}\n\n${markerMarkdown}`;
}

module.exports = {
  _internals: {
    DEFAULT_ATLAS_ROOT,
    DEFAULT_MARKER_FILE_PATH,
    SECTION_HEADERS,
    MARKER_LINE_PATTERN,
    hasValue,
    normalizeMarkerName,
    normalizeMarkerNames,
    buildSourceRef,
    parseMarkerBoard,
    buildWorkflowMarkerSnapshot,
    summarizeWorkflowMarkers,
    resolveWorkflowMarkerProgress,
    renderWorkflowMarkerMarkdown,
    appendWorkflowMarkerMarkdown,
  },
};
