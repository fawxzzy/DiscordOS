const { randomUUID } = require("node:crypto");

const {
  _internals: computaInternals,
} = require("../../../scripts/discordos-computa-runtime");

const DISCORD_INTERACTION_RESPONSE_TYPE = {
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  MODAL: 9,
};

const DISCORD_MESSAGE_FLAG_EPHEMERAL = 64;
const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_PERMISSION_ADMINISTRATOR = BigInt(1) << BigInt(3);
const DISCORD_PERMISSION_MANAGE_CHANNELS = BigInt(1) << BigInt(4);
const DISCORD_PERMISSION_MANAGE_GUILD = BigInt(1) << BigInt(5);
const DISCORD_PERMISSION_MANAGE_THREADS = BigInt(1) << BigInt(34);

const REPORT_TYPE_LABELS = {
  bug: "Bug",
  feature: "Feature",
};

const REPORT_STATUS_LABELS = {
  new: "New",
  needs_info: "Needs Info",
  confirmed: "Confirmed",
  fawxzzy_review: "Ready for Fawxzzy Review",
  in_progress: "In Progress",
  fixed: "Fixed",
  closed: "Closed",
  duplicate: "Duplicate",
  spam: "Spam",
  withdrawn: "Withdrawn",
};
const COMPLETION_REVIEW_LABELS = {
  approved: "Approved",
  needs_followup: "Needs Follow-Up",
  not_required: "Not Required",
};
const FEEDBACK_STATUS_CHOICES = [
  { name: "new", value: "new" },
  { name: "needs_info", value: "needs_info" },
  { name: "confirmed", value: "confirmed" },
  { name: "in_progress", value: "in_progress" },
  { name: "fixed", value: "fixed" },
  { name: "closed", value: "closed" },
  { name: "duplicate", value: "duplicate" },
  { name: "spam", value: "spam" },
];
const FEEDBACK_COMPLETION_REVIEW_CHOICES = [
  { name: "approved", value: "approved" },
  { name: "needs_followup", value: "needs_followup" },
];
const SETUP_FEEDBACK_COMMAND_NAME = "setup-feedback";
const FEEDBACK_COMMAND_NAME = "feedback";
const FEEDBACK_STATUS_COMMAND_NAME = "feedback-status";
const FEEDBACK_COMPLETION_REVIEW_COMMAND_NAME = "feedback-completion-review";
const FEEDBACK_WITHDRAW_COMMAND_NAME = "feedback-withdraw";
const FEEDBACK_REPORT_ID_OPTION_NAME = "report_id";
const FEEDBACK_STATUS_OPTION_NAME = "status";
const FEEDBACK_NOTE_OPTION_NAME = "note";
const FEEDBACK_COMPLETION_REVIEW_DECISION_OPTION_NAME = "decision";
const FEEDBACK_APPLICATION_COMMAND_NAMES = new Set([
  SETUP_FEEDBACK_COMMAND_NAME,
  FEEDBACK_COMMAND_NAME,
  FEEDBACK_STATUS_COMMAND_NAME,
  FEEDBACK_COMPLETION_REVIEW_COMMAND_NAME,
  FEEDBACK_WITHDRAW_COMMAND_NAME,
]);

const ACTIVE_DUPLICATE_STATUSES = ["new", "needs_info", "confirmed", "in_progress"];
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "before", "but", "by",
  "can", "could", "did", "do", "does", "for", "from", "had", "has", "have",
  "here", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my",
  "not", "of", "on", "or", "so", "that", "the", "their", "then", "there",
  "this", "to", "was", "were", "when", "with",
]);
const DUPLICATE_SYNONYMS = {
  broken: "fail",
  broke: "fail",
  cannot: "fail",
  cant: "fail",
  couldnt: "fail",
  didnt: "fail",
  doesnt: "fail",
  failing: "fail",
  failed: "fail",
  fails: "fail",
  failure: "fail",
  wont: "fail",
  unable: "fail",
};

const PANEL_SUBMIT_CUSTOM_IDS = new Set([
  "discordos_feedback_submit_open",
  "fitness_feedback_submit_open",
]);
const PANEL_UPDATE_CUSTOM_IDS = new Set([
  "discordos_feedback_update_open",
  "fitness_feedback_update_open",
]);
const SUBMIT_PICKER_SELECT_CUSTOM_ID = "discordos_feedback_submit_pick_type";
const SUBMIT_CREATE_BUTTON_CUSTOM_ID_PREFIX = "discordos_feedback_submit_create";
const REPORT_MODAL_CUSTOM_ID_PREFIX = "discordos_feedback_report_modal";
const UPDATE_PICKER_SELECT_CUSTOM_ID = "discordos_feedback_update_pick_report";
const UPDATE_PICKER_BUTTON_CUSTOM_ID_PREFIX = "discordos_feedback_manage_recent";
const UPDATE_PICKER_LOOKUP_BUTTON_CUSTOM_ID = "discordos_feedback_manage_lookup_open";
const UPDATE_PICKER_LOOKUP_MODAL_CUSTOM_ID = "discordos_feedback_manage_lookup_modal";
const UPDATE_PICKER_LOOKUP_INPUT_CUSTOM_ID = "feedback_manage_lookup";
const MANAGE_EDIT_BUTTON_CUSTOM_ID_PREFIX = "discordos_feedback_manage_action_edit";
const MANAGE_WITHDRAW_BUTTON_CUSTOM_ID_PREFIX = "discordos_feedback_manage_action_withdraw";
const MANAGE_CANCEL_BUTTON_CUSTOM_ID = "discordos_feedback_manage_action_cancel";
const UPDATE_EDIT_MODAL_CUSTOM_ID_PREFIX = "discordos_feedback_update_edit_modal";
const WITHDRAW_SELECTED_MODAL_CUSTOM_ID_PREFIX = "discordos_feedback_withdraw_selected_modal";

const FEEDBACK_SUMMARY_INPUT_CUSTOM_ID = "bug_summary";
const FEEDBACK_AREA_INPUT_CUSTOM_ID = "bug_area";
const FEEDBACK_DETAILS_INPUT_CUSTOM_ID = "bug_details";
const FEEDBACK_SECTION_OVERRIDES_INPUT_CUSTOM_ID = "feedback_section_overrides";
const FEEDBACK_WITHDRAW_NOTE_INPUT_CUSTOM_ID = "feedback_withdraw_note";

const SELECT_COLUMNS = [
  "report_id",
  "report_type",
  "short_display_id",
  "created_at",
  "updated_at",
  "source",
  "severity",
  "effort_points",
  "card_id",
  "card_phase",
  "card_priority",
  "depends_on",
  "dependency_notes",
  "area",
  "summary",
  "details",
  "steps_to_reproduce",
  "screenshot_url",
  "attachment_count",
  "attachment_metadata",
  "attachment_pruned",
  "reporter_discord_user_id",
  "reporter_discord_username",
  "reporter_fitness_user_id",
  "reporter_member_number",
  "reporter_user_kind",
  "discord_interaction_id",
  "duplicate_fingerprint",
  "duplicate_count",
  "first_seen_at",
  "last_seen_at",
  "forum_channel_id",
  "forum_thread_id",
  "forum_message_id",
  "forum_applied_tag_ids",
  "forum_title",
  "staff_channel_message_id",
  "closed_at",
  "pruned_at",
  "details_pruned",
  "triage_notes",
  "status",
  "status_updated_at",
  "status_updated_by_discord_user_id",
  "status_note",
  "completion_review_status",
  "completion_reviewed_at",
  "completion_reviewed_by_discord_user_id",
  "completion_review_note",
  "reporter_mentioned_at",
  "last_forum_sync_at",
].join(",");

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function truncate(value, maxLength) {
  const normalized = String(value || "").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeTextInput(value, maxLength) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, maxLength);
}

function buildEphemeralMessageResponse(content, components) {
  return {
    type: DISCORD_INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: DISCORD_MESSAGE_FLAG_EPHEMERAL,
      ...(Array.isArray(components) ? { components } : {}),
    },
  };
}

function buildModalResponse(data) {
  return {
    type: DISCORD_INTERACTION_RESPONSE_TYPE.MODAL,
    data,
  };
}

function resolveGuildId(env = process.env) {
  return computaInternals.resolveGuildId(env);
}

function resolveFeedbackForumChannelId(env = process.env) {
  return (
    (hasValue(env.DISCORDOS_FEEDBACK_FORUM_CHANNEL_ID) ? env.DISCORDOS_FEEDBACK_FORUM_CHANNEL_ID.trim() : null)
    || (hasValue(env.DISCORDOS_BUG_REPORT_FORUM_CHANNEL_ID) ? env.DISCORDOS_BUG_REPORT_FORUM_CHANNEL_ID.trim() : null)
    || computaInternals.resolveFeedbackForumChannelId(env)
  );
}

function resolveBotToken(env = process.env) {
  return computaInternals.resolveBotToken(env);
}

function interactionMatchesGuild(interaction, env = process.env) {
  const expectedGuildId = resolveGuildId(env);
  if (!hasValue(expectedGuildId)) {
    return true;
  }
  return interaction?.guild_id === expectedGuildId;
}

function resolveInteractionUser(interaction = {}) {
  const user = interaction.member?.user || interaction.user || {};
  return {
    id: typeof user.id === "string" ? user.id : null,
    username: typeof user.username === "string" ? user.username : null,
  };
}

function parsePermissionBigInt(permissions) {
  if (typeof permissions !== "string" || !/^\d+$/.test(permissions)) {
    return BigInt(0);
  }
  try {
    return BigInt(permissions);
  } catch {
    return BigInt(0);
  }
}

function canAccessAnyFeedbackReport(permissions) {
  const value = parsePermissionBigInt(permissions);
  return Boolean(
    value & DISCORD_PERMISSION_ADMINISTRATOR
    || value & DISCORD_PERMISSION_MANAGE_CHANNELS
    || value & DISCORD_PERMISSION_MANAGE_GUILD
    || value & DISCORD_PERMISSION_MANAGE_THREADS
  );
}

function hasSetupPermission(permissions) {
  const value = parsePermissionBigInt(permissions);
  return Boolean(
    value & DISCORD_PERMISSION_ADMINISTRATOR
    || value & DISCORD_PERMISSION_MANAGE_GUILD
  );
}

function extractCommandStringOption(options, optionName) {
  if (!Array.isArray(options)) {
    return null;
  }
  for (const option of options) {
    if (option?.name === optionName && typeof option.value === "string") {
      return option.value.trim() || null;
    }
  }
  return null;
}

function normalizeFeedbackStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(REPORT_STATUS_LABELS, normalized)
    ? normalized
    : null;
}

function normalizeCompletionReviewDecision(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "approved" || normalized === "needs_followup"
    ? normalized
    : null;
}

function buildGuildCommandDefinitions() {
  const setupDefaultPermissions = String(DISCORD_PERMISSION_MANAGE_GUILD);
  const feedbackStatusDefaultPermissions = String(
    DISCORD_PERMISSION_MANAGE_GUILD
    | DISCORD_PERMISSION_MANAGE_THREADS,
  );

  return [
    {
      name: SETUP_FEEDBACK_COMMAND_NAME,
      description: "Post or refresh the DiscordOS feedback launcher.",
      default_member_permissions: setupDefaultPermissions,
    },
    {
      name: FEEDBACK_COMMAND_NAME,
      description: "Send DiscordOS feedback.",
      default_member_permissions: setupDefaultPermissions,
    },
    {
      name: FEEDBACK_STATUS_COMMAND_NAME,
      description: "Update a DiscordOS feedback report status.",
      default_member_permissions: feedbackStatusDefaultPermissions,
      options: [
        {
          type: 3,
          name: FEEDBACK_REPORT_ID_OPTION_NAME,
          description: "Report ID, short ID, thread ID, or forum URL.",
          required: true,
        },
        {
          type: 3,
          name: FEEDBACK_STATUS_OPTION_NAME,
          description: "New feedback report status.",
          required: true,
          choices: [...FEEDBACK_STATUS_CHOICES],
        },
        {
          type: 3,
          name: FEEDBACK_NOTE_OPTION_NAME,
          description: "Optional status note to add in the forum thread.",
          required: false,
        },
      ],
    },
    {
      name: FEEDBACK_COMPLETION_REVIEW_COMMAND_NAME,
      description: "Approve or flag follow-up for a completed DiscordOS feedback card.",
      default_member_permissions: feedbackStatusDefaultPermissions,
      options: [
        {
          type: 3,
          name: FEEDBACK_REPORT_ID_OPTION_NAME,
          description: "Report ID, short ID, thread ID, or forum URL.",
          required: true,
        },
        {
          type: 3,
          name: FEEDBACK_COMPLETION_REVIEW_DECISION_OPTION_NAME,
          description: "Completion review decision.",
          required: true,
          choices: [...FEEDBACK_COMPLETION_REVIEW_CHOICES],
        },
        {
          type: 3,
          name: FEEDBACK_NOTE_OPTION_NAME,
          description: "Optional completion review note.",
          required: false,
        },
      ],
    },
    {
      name: FEEDBACK_WITHDRAW_COMMAND_NAME,
      description: "Withdraw feedback you submitted.",
      default_member_permissions: setupDefaultPermissions,
      options: [
        {
          type: 3,
          name: FEEDBACK_REPORT_ID_OPTION_NAME,
          description: "Report ID, short ID, thread ID, or forum URL.",
          required: true,
        },
      ],
    },
  ];
}

function buildModalLabelTextInput({
  label,
  customId,
  style,
  placeholder,
  value,
  required = true,
  maxLength,
}) {
  return {
    type: 1,
    components: [
      {
        type: 4,
        custom_id: customId,
        style,
        label,
        ...(hasValue(placeholder) ? { placeholder: truncate(placeholder, 100) } : {}),
        ...(typeof value === "string" ? { value } : {}),
        required,
        ...(typeof maxLength === "number" ? { max_length: maxLength } : {}),
      },
    ],
  };
}

function buildFeedbackSectionOverridePlaceholder(reportType) {
  if (reportType === "feature") {
    return [
      "Acceptance Criteria:",
      "- Members can submit without cluttering main chat.",
      "- The public card clearly shows the expected outcome.",
      "",
      "User Story:",
      "As a member, I want feedback submission to stay easy to find and low-noise, so sharing ideas feels simple.",
    ].join("\n");
  }

  return [
    "Acceptance Criteria:",
    "- The fix is obvious from the card.",
    "- Members can submit without cluttering main chat.",
    "",
    "Expected behavior:",
    "Feedback opens from the dedicated submission flow.",
    "",
    "Actual behavior:",
    "I still have to rely on a noisier or less clear path.",
    "",
    "Steps to reproduce:",
    "1. Open the current feedback flow.",
    "2. Try to submit the report.",
    "3. Notice what feels broken, unclear, or noisy.",
  ].join("\n");
}

function buildFeedbackSubmitModalData({
  reportType,
  customId,
  title,
  summary,
  area,
  details,
  sectionOverrides,
}) {
  const detailsLabel = reportType === "feature" ? "Description" : "Problem";
  const detailsPlaceholder = reportType === "feature"
    ? "What should change, who is it for, and why does it matter?"
    : "What broke, where did you see it, and what happened instead?";
  const sectionOverrideLabel = reportType === "feature"
    ? "User Story / Acceptance Criteria"
    : "Expected / Actual / Steps / Criteria";
  return {
    custom_id: customId,
    title,
    components: [
      buildModalLabelTextInput({
        label: "Title",
        customId: FEEDBACK_SUMMARY_INPUT_CUSTOM_ID,
        style: 1,
        placeholder: reportType === "feature"
          ? "Example: Add a dedicated feedback-submission flow"
          : "Example: Recovery screen closes after save",
        value: summary,
        required: true,
        maxLength: 120,
      }),
      buildModalLabelTextInput({
        label: "Area / screen (optional)",
        customId: FEEDBACK_AREA_INPUT_CUSTOM_ID,
        style: 1,
        placeholder: "Discord Feedback, Settings, Recovery...",
        value: area,
        required: false,
        maxLength: 80,
      }),
      buildModalLabelTextInput({
        label: detailsLabel,
        customId: FEEDBACK_DETAILS_INPUT_CUSTOM_ID,
        style: 2,
        placeholder: detailsPlaceholder,
        value: details,
        required: true,
        maxLength: 1200,
      }),
      buildModalLabelTextInput({
        label: sectionOverrideLabel,
        customId: FEEDBACK_SECTION_OVERRIDES_INPUT_CUSTOM_ID,
        style: 2,
        placeholder: buildFeedbackSectionOverridePlaceholder(reportType),
        value: sectionOverrides,
        required: false,
        maxLength: 1200,
      }),
    ],
  };
}

function buildFeedbackReportModalResponse(reportType) {
  return buildModalResponse(buildFeedbackSubmitModalData({
    reportType,
    customId: `${REPORT_MODAL_CUSTOM_ID_PREFIX}:${reportType}`,
    title: reportType === "feature" ? "Suggest a feature" : "Report a bug",
  }));
}

function buildSubmitPickerResponse(selectedReportType = "bug") {
  const selectedLabel = selectedReportType === "feature" ? "Feature" : "Bug";
  return buildEphemeralMessageResponse("Choose Bug or Feature, then create your feedback card.", [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: SUBMIT_PICKER_SELECT_CUSTOM_ID,
          placeholder: "Choose Bug or Feature",
          min_values: 1,
          max_values: 1,
          options: [
            {
              label: "Bug",
              value: "bug",
              description: "Report something broken, confusing, or unexpected.",
              ...(selectedReportType === "bug" ? { default: true } : {}),
            },
            {
              label: "Feature",
              value: "feature",
              description: "Request a new capability, workflow, or quality-of-life improvement.",
              ...(selectedReportType === "feature" ? { default: true } : {}),
            },
          ],
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          custom_id: `${SUBMIT_CREATE_BUTTON_CUSTOM_ID_PREFIX}:${selectedReportType}`,
          label: `Create ${selectedLabel}`,
        },
        {
          type: 2,
          style: 2,
          custom_id: MANAGE_CANCEL_BUTTON_CUSTOM_ID,
          label: "Cancel",
        },
      ],
    },
  ]);
}

function buildUpdatePickerResponse(recentReports) {
  const recentButtons = recentReports.slice(0, 3).map((report) => ({
    type: 2,
    style: 2,
    custom_id: `${UPDATE_PICKER_BUTTON_CUSTOM_ID_PREFIX}:${report.value}`,
    label: truncate(report.label, 80),
  }));

  return buildEphemeralMessageResponse("Choose a feedback card to manage.", [
    ...(recentButtons.length > 0 ? [{ type: 1, components: recentButtons }] : []),
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: UPDATE_PICKER_SELECT_CUSTOM_ID,
          placeholder: "More of your recent cards",
          min_values: 1,
          max_values: 1,
          options: recentReports.slice(0, 25),
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: UPDATE_PICKER_LOOKUP_BUTTON_CUSTOM_ID,
          label: "Enter ID / Link",
        },
      ],
    },
  ]);
}

function buildManageLookupModalResponse() {
  return buildModalResponse({
    custom_id: UPDATE_PICKER_LOOKUP_MODAL_CUSTOM_ID,
    title: "Find Feedback Card",
    components: [
      buildModalLabelTextInput({
        label: "Report ID or forum link",
        customId: UPDATE_PICKER_LOOKUP_INPUT_CUSTOM_ID,
        style: 1,
        placeholder: "b88b31ba or https://discord.com/channels/...",
        required: true,
        maxLength: 200,
      }),
    ],
  });
}

function buildManageCardResponse(report) {
  const areaLabel = hasValue(report.area) ? `\nArea: ${report.area.trim()}` : "";
  return buildEphemeralMessageResponse(
    `Manage \`${formatShortId(report.report_id)}\`.\n${REPORT_TYPE_LABELS[report.report_type]} | ${REPORT_STATUS_LABELS[report.status]}${areaLabel}\n${report.summary}`,
    [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            custom_id: `${MANAGE_EDIT_BUTTON_CUSTOM_ID_PREFIX}:${report.report_id}`,
            label: "Edit Card",
          },
          {
            type: 2,
            style: 4,
            custom_id: `${MANAGE_WITHDRAW_BUTTON_CUSTOM_ID_PREFIX}:${report.report_id}`,
            label: "Withdraw",
          },
          {
            type: 2,
            style: 2,
            custom_id: MANAGE_CANCEL_BUTTON_CUSTOM_ID,
            label: "Cancel",
          },
        ],
      },
    ],
  );
}

function buildUpdateModalResponse(report) {
  return buildModalResponse(buildFeedbackSubmitModalData({
    reportType: report.report_type,
    customId: `${UPDATE_EDIT_MODAL_CUSTOM_ID_PREFIX}:${report.report_id}`,
    title: "Edit Feedback Card",
    summary: report.summary,
    area: report.area || "",
    details: report.details || "",
    sectionOverrides: buildSectionOverrideDraft(report),
  }));
}

function buildWithdrawSelectedModalResponse(report) {
  return buildModalResponse({
    custom_id: `${WITHDRAW_SELECTED_MODAL_CUSTOM_ID_PREFIX}:${report.report_id}`,
    title: "Withdraw Feedback",
    components: [
      buildModalLabelTextInput({
        label: "Optional note",
        customId: FEEDBACK_WITHDRAW_NOTE_INPUT_CUSTOM_ID,
        style: 2,
        placeholder: `We will withdraw "${truncate(report.summary, 60)}" and keep a small audit record.`,
        required: false,
        maxLength: 500,
      }),
    ],
  });
}

function extractReportIdFromPrefixedCustomId(prefix, customId) {
  if (typeof customId !== "string" || !customId.startsWith(`${prefix}:`)) {
    return null;
  }
  const reportId = customId.slice(prefix.length + 1).trim();
  return reportId || null;
}

function extractModalTextInputValue(components, inputCustomId) {
  if (!Array.isArray(components)) {
    return null;
  }
  for (const row of components) {
    const rowComponents = Array.isArray(row?.components) ? row.components : [];
    for (const component of rowComponents) {
      if (component?.custom_id === inputCustomId && typeof component?.value === "string") {
        return component.value;
      }
    }
  }
  return null;
}

function resolveFirstComponentValue(values) {
  return Array.isArray(values) && typeof values[0] === "string" ? values[0] : null;
}

function resolveSubmitPickerReportTypeFromValues(values) {
  const value = resolveFirstComponentValue(values);
  return value === "feature" ? "feature" : "bug";
}

function resolveReportTypeFromCreateButton(customId) {
  const value = extractReportIdFromPrefixedCustomId(SUBMIT_CREATE_BUTTON_CUSTOM_ID_PREFIX, customId);
  return value === "feature" ? "feature" : value === "bug" ? "bug" : null;
}

function resolveReportTypeFromModalCustomId(customId) {
  const value = extractReportIdFromPrefixedCustomId(REPORT_MODAL_CUSTOM_ID_PREFIX, customId);
  return value === "feature" ? "feature" : value === "bug" ? "bug" : null;
}

function buildUuidBoundsFromPrefix(prefix) {
  const normalized = String(prefix || "").trim().toLowerCase();
  if (!/^[0-9a-f]{6,32}$/.test(normalized)) {
    return null;
  }
  const lowerHex = normalized.padEnd(32, "0").slice(0, 32);
  const upperHex = normalized.padEnd(32, "f").slice(0, 32);
  return {
    lower: `${lowerHex.slice(0, 8)}-${lowerHex.slice(8, 12)}-${lowerHex.slice(12, 16)}-${lowerHex.slice(16, 20)}-${lowerHex.slice(20, 32)}`,
    upper: `${upperHex.slice(0, 8)}-${upperHex.slice(8, 12)}-${upperHex.slice(12, 16)}-${upperHex.slice(16, 20)}-${upperHex.slice(20, 32)}`,
  };
}

function extractForumThreadLookupCandidates(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return [];
  }
  if (/^\d{5,32}$/.test(normalized)) {
    return [normalized];
  }
  try {
    const parsed = new URL(normalized);
    const matches = Array.from(parsed.pathname.matchAll(/\d{5,32}/g), (match) => match[0]).filter(Boolean);
    return [...new Set(matches.reverse())];
  } catch {
    return [];
  }
}

function formatShortId(reportId) {
  return String(reportId || "").trim().slice(0, 8) || "unknown";
}

function neutralizeDiscordMentions(value) {
  return String(value || "")
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere")
    .replace(/<@&/g, "<@\u200b&")
    .replace(/<@/g, "<@\u200b");
}

function normalizeCriteriaLine(value) {
  const normalized = String(value || "")
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .trim();
  return normalized || null;
}

function parseCriteriaLines(value) {
  const normalized = normalizeTextInput(value, 1200);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\r?\n/)
    .map(normalizeCriteriaLine)
    .filter(Boolean)
    .slice(0, 10);
}

function parseFeedbackSectionBlocks(value) {
  const normalized = normalizeTextInput(value, 1200);
  const sections = new Map();
  if (!normalized) {
    return sections;
  }

  let currentKey = null;
  const buffers = new Map();
  for (const rawLine of normalized.split(/\r?\n/)) {
    const headerMatch = rawLine.match(/^\s*(User Story|Expected behavior|Actual behavior|Steps to reproduce|Acceptance Criteria)\s*:\s*(.*)$/i);
    if (headerMatch) {
      currentKey = headerMatch[1].trim().toLowerCase();
      buffers.set(currentKey, headerMatch[2].trim() ? [headerMatch[2].trim()] : []);
      continue;
    }
    if (!currentKey) {
      continue;
    }
    const buffer = buffers.get(currentKey) || [];
    buffer.push(rawLine);
    buffers.set(currentKey, buffer);
  }

  for (const [key, lines] of buffers.entries()) {
    const joined = normalizeTextInput(lines.join("\n"), 1200);
    if (joined) {
      sections.set(key, joined);
    }
  }

  return sections;
}

function parseFeatureSectionOverrides(value) {
  const sections = parseFeedbackSectionBlocks(value);
  return {
    userStory: normalizeTextInput(sections.get("user story") || null, 1200),
    acceptanceCriteria: sections.has("acceptance criteria")
      ? parseCriteriaLines(sections.get("acceptance criteria"))
      : parseCriteriaLines(value),
  };
}

function parseBugSectionOverrides(value) {
  const sections = parseFeedbackSectionBlocks(value);
  return {
    expectedBehavior: normalizeTextInput(sections.get("expected behavior") || null, 1200),
    actualBehavior: normalizeTextInput(sections.get("actual behavior") || null, 1200),
    stepsToReproduce: normalizeTextInput(sections.get("steps to reproduce") || value || null, 1200),
    acceptanceCriteria: sections.has("acceptance criteria")
      ? parseCriteriaLines(sections.get("acceptance criteria"))
      : [],
  };
}

function buildFeatureSectionOverrideStorage(value) {
  const overrides = parseFeatureSectionOverrides(value);
  if (!overrides.userStory && overrides.acceptanceCriteria.length === 0) {
    return null;
  }
  return `FFB_SECTIONS_V1::${JSON.stringify(overrides)}`;
}

function buildBugSectionOverrideStorage(value) {
  const overrides = parseBugSectionOverrides(value);
  if (!overrides.expectedBehavior && !overrides.actualBehavior && !overrides.stepsToReproduce && overrides.acceptanceCriteria.length === 0) {
    return null;
  }
  return `FFB_SECTIONS_V1::${JSON.stringify(overrides)}`;
}

function parseSerializedSectionOverrides(value) {
  const normalized = normalizeTextInput(value, 1200);
  if (!normalized || !normalized.startsWith("FFB_SECTIONS_V1::")) {
    return null;
  }
  try {
    const parsed = JSON.parse(normalized.slice("FFB_SECTIONS_V1::".length));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseStoredFeatureOverrides(value) {
  const parsed = parseSerializedSectionOverrides(value);
  if (parsed) {
    return {
      userStory: normalizeTextInput(parsed.userStory, 1200),
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
        ? parsed.acceptanceCriteria.map(normalizeCriteriaLine).filter(Boolean).slice(0, 10)
        : [],
    };
  }
  return parseFeatureSectionOverrides(value);
}

function parseStoredBugOverrides(value) {
  const parsed = parseSerializedSectionOverrides(value);
  if (parsed) {
    return {
      expectedBehavior: normalizeTextInput(parsed.expectedBehavior, 1200),
      actualBehavior: normalizeTextInput(parsed.actualBehavior, 1200),
      stepsToReproduce: normalizeTextInput(parsed.stepsToReproduce, 1200),
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
        ? parsed.acceptanceCriteria.map(normalizeCriteriaLine).filter(Boolean).slice(0, 10)
        : [],
    };
  }
  return parseBugSectionOverrides(value);
}

function buildSectionOverrideDraft(report) {
  if (report.report_type === "feature") {
    const overrides = parseStoredFeatureOverrides(report.steps_to_reproduce);
    const lines = [
      overrides.userStory ? `User Story:\n${overrides.userStory}` : null,
      overrides.acceptanceCriteria.length > 0 ? `Acceptance Criteria:\n${overrides.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}` : null,
    ].filter(Boolean);
    return lines.length > 0 ? lines.join("\n\n") : null;
  }

  const overrides = parseStoredBugOverrides(report.steps_to_reproduce);
  const lines = [
    overrides.expectedBehavior ? `Expected behavior:\n${overrides.expectedBehavior}` : null,
    overrides.actualBehavior ? `Actual behavior:\n${overrides.actualBehavior}` : null,
    overrides.stepsToReproduce ? `Steps to reproduce:\n${overrides.stepsToReproduce}` : null,
    overrides.acceptanceCriteria.length > 0 ? `Acceptance Criteria:\n${overrides.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}` : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n\n") : null;
}

function tokenizeDuplicateText(value, maxTokens = 12) {
  const normalized = normalizeTextInput(value, 1200);
  if (!normalized) {
    return [];
  }
  const tokens = [];
  const seen = new Set();
  for (const rawToken of normalized.split(/[^a-zA-Z0-9']+/)) {
    const compact = rawToken.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "");
    if (!compact) {
      continue;
    }
    let normalizedToken = DUPLICATE_SYNONYMS[compact] || compact;
    if (normalizedToken.length > 5 && normalizedToken.endsWith("ies")) {
      normalizedToken = `${normalizedToken.slice(0, -3)}y`;
    } else if (normalizedToken.length > 5 && normalizedToken.endsWith("ing")) {
      normalizedToken = normalizedToken.slice(0, -3);
    } else if (normalizedToken.length > 4 && normalizedToken.endsWith("ed")) {
      normalizedToken = normalizedToken.slice(0, -2);
    } else if (normalizedToken.length > 3 && normalizedToken.endsWith("s")) {
      normalizedToken = normalizedToken.slice(0, -1);
    }
    normalizedToken = DUPLICATE_SYNONYMS[normalizedToken] || normalizedToken;
    if (normalizedToken.length < 2 || STOPWORDS.has(normalizedToken) || seen.has(normalizedToken)) {
      continue;
    }
    seen.add(normalizedToken);
    tokens.push(normalizedToken);
    if (tokens.length >= maxTokens) {
      break;
    }
  }
  return tokens;
}

function buildDuplicateSignal({ reportType, area, summary, details }) {
  const areaTokens = tokenizeDuplicateText(area, 6);
  const summaryTokens = tokenizeDuplicateText(summary, 12);
  const detailTokens = tokenizeDuplicateText(details, 12);
  const fingerprint = `${reportType}::${areaTokens.join(" ")}::${summaryTokens.join(" ")}`;
  return {
    fingerprint,
    areaKey: areaTokens.join(" "),
    summaryKey: summaryTokens.join(" "),
    summaryTokens,
    detailTokens,
    combinedTokens: [...new Set([...summaryTokens, ...detailTokens])].slice(0, 16),
  };
}

function countSharedTokens(left, right) {
  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
}

function computeCoverage(left, right) {
  const denominator = Math.min(left.length, right.length);
  return denominator > 0 ? countSharedTokens(left, right) / denominator : 0;
}

function scoreDuplicateCandidate(candidate, normalizedInput) {
  if (candidate.report_type !== normalizedInput.reportType) {
    return 0;
  }

  const candidateSignal = buildDuplicateSignal({
    reportType: candidate.report_type,
    area: candidate.area,
    summary: candidate.summary,
    details: candidate.details,
  });

  if (candidate.duplicate_fingerprint === normalizedInput.duplicateFingerprint || candidateSignal.fingerprint === normalizedInput.duplicateFingerprint) {
    return 100;
  }

  const areaComparable = !normalizedInput.duplicateAreaKey || !candidateSignal.areaKey || normalizedInput.duplicateAreaKey === candidateSignal.areaKey;
  const sharedSummaryTokens = countSharedTokens(normalizedInput.duplicateSummaryTokens, candidateSignal.summaryTokens);
  const summaryCoverage = computeCoverage(normalizedInput.duplicateSummaryTokens, candidateSignal.summaryTokens);
  const detailCoverage = computeCoverage(normalizedInput.duplicateDetailTokens, candidateSignal.detailTokens);
  const combinedCoverage = computeCoverage(normalizedInput.duplicateCombinedTokens, candidateSignal.combinedTokens);

  if (normalizedInput.duplicateSummaryKey && normalizedInput.duplicateSummaryKey === candidateSignal.summaryKey && areaComparable) {
    return 95;
  }
  if (areaComparable && sharedSummaryTokens >= 2 && summaryCoverage >= 0.75) {
    return 85;
  }
  if (areaComparable && sharedSummaryTokens >= 2 && summaryCoverage >= 0.5 && detailCoverage >= 0.5) {
    return 75;
  }
  if (areaComparable && sharedSummaryTokens >= 3 && combinedCoverage >= 0.7) {
    return 70;
  }
  return 0;
}

function normalizeFeedbackInput(modalFields, reportType) {
  const summary = normalizeTextInput(modalFields.summary, 120);
  const details = normalizeTextInput(modalFields.details, 1200);
  if (!summary || !details) {
    return null;
  }
  const area = normalizeTextInput(modalFields.area, 80);
  const duplicateSignal = buildDuplicateSignal({
    reportType,
    area,
    summary,
    details,
  });
  return {
    reportType,
    summary,
    area,
    details,
    severity: "medium",
    stepsToReproduce: reportType === "feature"
      ? buildFeatureSectionOverrideStorage(modalFields.sectionOverrides)
      : buildBugSectionOverrideStorage(modalFields.sectionOverrides),
    duplicateFingerprint: duplicateSignal.fingerprint,
    duplicateAreaKey: duplicateSignal.areaKey,
    duplicateSummaryKey: duplicateSignal.summaryKey,
    duplicateSummaryTokens: duplicateSignal.summaryTokens,
    duplicateDetailTokens: duplicateSignal.detailTokens,
    duplicateCombinedTokens: duplicateSignal.combinedTokens,
  };
}

function coerceReportRow(row) {
  if (!row || typeof row.report_id !== "string" || typeof row.report_type !== "string") {
    return null;
  }
  return {
    ...row,
    report_id: row.report_id,
    report_type: row.report_type === "feature" ? "feature" : "bug",
    summary: typeof row.summary === "string" ? row.summary : null,
    area: typeof row.area === "string" ? row.area : null,
    details: typeof row.details === "string" ? row.details : null,
    steps_to_reproduce: typeof row.steps_to_reproduce === "string" ? row.steps_to_reproduce : null,
    reporter_discord_user_id: typeof row.reporter_discord_user_id === "string" ? row.reporter_discord_user_id : null,
    reporter_discord_username: typeof row.reporter_discord_username === "string" ? row.reporter_discord_username : null,
    reporter_member_number: typeof row.reporter_member_number === "number" ? row.reporter_member_number : null,
    forum_thread_id: typeof row.forum_thread_id === "string" ? row.forum_thread_id : null,
    forum_message_id: typeof row.forum_message_id === "string" ? row.forum_message_id : null,
    forum_channel_id: typeof row.forum_channel_id === "string" ? row.forum_channel_id : null,
    forum_title: typeof row.forum_title === "string" ? row.forum_title : null,
    duplicate_fingerprint: typeof row.duplicate_fingerprint === "string" ? row.duplicate_fingerprint : null,
    duplicate_count: typeof row.duplicate_count === "number" ? row.duplicate_count : 1,
    status: typeof row.status === "string" ? row.status : "new",
  };
}

function getSupabaseConfig(env = process.env) {
  const supabaseUrl = hasValue(env.DISCORDOS_SUPABASE_URL) ? cleanUrl(env.DISCORDOS_SUPABASE_URL) : null;
  const serviceRoleKey = hasValue(env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY) ? env.DISCORDOS_SUPABASE_SERVICE_ROLE_KEY.trim() : null;
  return {
    ok: Boolean(supabaseUrl && serviceRoleKey),
    supabaseUrl,
    serviceRoleKey,
  };
}

async function supabaseRestRequest({
  env = process.env,
  fetchImpl = fetch,
  path,
  method = "GET",
  body,
  preferRepresentation = false,
}) {
  const config = getSupabaseConfig(env);
  if (!config.ok) {
    return { ok: false, code: "supabase_not_configured", rows: null };
  }

  const response = await fetchImpl(`${config.supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Profile": "discordos",
      "Content-Profile": "discordos",
      ...(preferRepresentation ? { Prefer: "return=representation" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    payload,
    rows: Array.isArray(payload) ? payload : payload ? [payload] : [],
  };
}

async function insertFeedbackReport(values, options) {
  const result = await supabaseRestRequest({
    ...options,
    method: "POST",
    path: `/rest/v1/discord_feedback_reports?select=${encodeURIComponent(SELECT_COLUMNS)}`,
    body: values,
    preferRepresentation: true,
  });
  return result.ok ? coerceReportRow(result.rows[0]) : null;
}

async function updateFeedbackReport(reportId, values, options) {
  const result = await supabaseRestRequest({
    ...options,
    method: "PATCH",
    path: `/rest/v1/discord_feedback_reports?report_id=eq.${encodeURIComponent(reportId)}&select=${encodeURIComponent(SELECT_COLUMNS)}`,
    body: values,
    preferRepresentation: true,
  });
  return result.ok ? coerceReportRow(result.rows[0]) : null;
}

async function selectFeedbackReports(queryParts, options) {
  const joined = queryParts.filter(Boolean).join("&");
  const result = await supabaseRestRequest({
    ...options,
    path: `/rest/v1/discord_feedback_reports?select=${encodeURIComponent(SELECT_COLUMNS)}${joined ? `&${joined}` : ""}`,
  });
  return result.ok ? result.rows.map(coerceReportRow).filter(Boolean) : null;
}

async function insertAuditEvent(values, options) {
  await supabaseRestRequest({
    ...options,
    method: "POST",
    path: "/rest/v1/discord_feedback_audit_events",
    body: values,
  });
}

async function findReportByIdOrPrefix(reportIdOrPrefix, options) {
  const normalized = String(reportIdOrPrefix || "").trim();
  if (!normalized) {
    return { ok: false, code: "not_found" };
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{28}$/i.test(normalized)) {
    const rows = await selectFeedbackReports([`report_id=eq.${encodeURIComponent(normalized)}`, "limit=1"], options);
    return rows && rows[0] ? { ok: true, report: rows[0] } : { ok: false, code: "not_found" };
  }

  for (const threadId of extractForumThreadLookupCandidates(normalized)) {
    const rows = await selectFeedbackReports([`forum_thread_id=eq.${encodeURIComponent(threadId)}`, "limit=1"], options);
    if (rows && rows[0]) {
      return { ok: true, report: rows[0] };
    }
  }

  const bounds = buildUuidBoundsFromPrefix(normalized);
  if (!bounds) {
    return { ok: false, code: "not_found" };
  }

  const rows = await selectFeedbackReports([
    `report_id=gte.${encodeURIComponent(bounds.lower)}`,
    `report_id=lte.${encodeURIComponent(bounds.upper)}`,
    "limit=2",
  ], options);
  if (!rows || rows.length === 0) {
    return { ok: false, code: "not_found" };
  }
  if (rows.length > 1) {
    return { ok: false, code: "ambiguous" };
  }
  return { ok: true, report: rows[0] };
}

async function listRecentReports({ reporterDiscordUserId = null, excludedStatuses = [], limit = 25 }, options) {
  const rows = await selectFeedbackReports([
    reporterDiscordUserId ? `reporter_discord_user_id=eq.${encodeURIComponent(reporterDiscordUserId)}` : null,
    excludedStatuses.length > 0 ? `status=not.in.(${excludedStatuses.join(",")})` : null,
    "order=updated_at.desc",
    `limit=${Math.max(1, Math.min(limit * 3, 75))}`,
  ], options);
  if (!rows) {
    return null;
  }
  return rows.slice(0, limit).map((report) => ({
    label: truncate(`${formatShortId(report.report_id)} | ${report.summary}`, 100),
    value: report.report_id,
    description: truncate(`${REPORT_TYPE_LABELS[report.report_type]} | ${REPORT_STATUS_LABELS[report.status] || report.status} | ${report.area || "No area"}`, 100),
  }));
}

async function countRecentReports(reporterDiscordUserId, options) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await selectFeedbackReports([
    `reporter_discord_user_id=eq.${encodeURIComponent(reporterDiscordUserId)}`,
    `last_seen_at=gte.${encodeURIComponent(cutoff)}`,
    "limit=4",
  ], options);
  return Array.isArray(rows) ? rows.length : null;
}

async function findDuplicateReport(normalizedInput, options) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await selectFeedbackReports([
    `report_type=eq.${encodeURIComponent(normalizedInput.reportType)}`,
    `status=in.(${ACTIVE_DUPLICATE_STATUSES.join(",")})`,
    `last_seen_at=gte.${encodeURIComponent(cutoff)}`,
    "order=last_seen_at.desc",
    "limit=25",
  ], options);
  if (!rows) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;
  for (const candidate of rows) {
    const score = scoreDuplicateCandidate(candidate, normalizedInput);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  return bestScore >= 70 ? bestMatch : null;
}

function estimateEffortPoints(report) {
  let complexityScore = report.report_type === "feature" ? 2 : 1;
  const detailsLength = String(report.details || "").trim().length;
  const stepsLength = String(report.steps_to_reproduce || "").trim().length;
  const duplicateCount = Math.max(1, Number(report.duplicate_count || 1));
  const combinedText = [report.area || "", report.summary || "", report.details || "", report.steps_to_reproduce || ""].join(" ");

  if (report.report_type !== "feature") {
    if (report.severity === "high") {
      complexityScore += 2;
    } else if (report.severity === "blocker") {
      complexityScore += 4;
    } else if (report.severity === "medium") {
      complexityScore += 1;
    }
  } else if (/\b(add|support|allow|create|new|share|export|import|sync)\b/i.test(combinedText)) {
    complexityScore += 1;
  }

  if (detailsLength > 180) {
    complexityScore += 1;
  }
  if (detailsLength > 480) {
    complexityScore += 1;
  }
  if (stepsLength > 140) {
    complexityScore += 1;
  }
  if (duplicateCount >= 2) {
    complexityScore += 1;
  }
  if (duplicateCount >= 5) {
    complexityScore += 1;
  }
  if (/\b(auth|account|verification|verify|discord|forum|thread|role|permission|release|deploy|preview|sync|worker|automation|queue|supabase|migration|database|import|export|mobile|ios|android)\b/i.test(combinedText)) {
    complexityScore += 2;
  }
  if (/\b(all|every|across|multiple|entire|global|systemwide|whole app|whole flow|end to end)\b/i.test(combinedText)) {
    complexityScore += 2;
  }

  const allowed = [1, 2, 3, 5, 8, 13, 21, 34, 55];
  for (const value of allowed) {
    if (complexityScore <= value) {
      return value;
    }
  }
  return 55;
}

function formatTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function formatAreaLabel(area) {
  const normalized = normalizeTextInput(area, 80);
  return normalized ? formatTitleCase(normalized) : "General";
}

function buildForumThreadTitle(report) {
  return truncate(`${REPORT_TYPE_LABELS[report.report_type]}: ${formatAreaLabel(report.area)} - ${report.summary}`, 100);
}

function buildBugAcceptanceCriteria(report) {
  const overrides = parseStoredBugOverrides(report.steps_to_reproduce);
  if (overrides.acceptanceCriteria.length > 0) {
    return overrides.acceptanceCriteria;
  }
  const areaLabel = formatAreaLabel(report.area);
  return [
    "The reported issue is reproduced or clearly explained.",
    `The ${areaLabel} flow behaves as expected after the fix.`,
    "The user sees a clear result instead of a misleading failure message.",
    "The feedback card is updated when the issue is resolved.",
  ];
}

function buildFeatureAcceptanceCriteria(report) {
  const overrides = parseStoredFeatureOverrides(report.steps_to_reproduce);
  if (overrides.acceptanceCriteria.length > 0) {
    return overrides.acceptanceCriteria;
  }
  const areaLabel = formatAreaLabel(report.area);
  return [
    "The requested capability is available to the intended user.",
    `The ${areaLabel} flow makes the requested outcome clear to users.`,
    "Operator or user-facing behavior changes are documented when needed.",
    "The feedback card is updated when the feature is completed.",
  ];
}

function buildForumThreadBody(report, reporterLabel) {
  const sharedLines = [
    `**${report.report_type === "feature" ? "Feature Request" : "Bug Report"}**`,
    `Type: ${REPORT_TYPE_LABELS[report.report_type]}`,
    `Status: ${REPORT_STATUS_LABELS[report.status] || report.status}`,
    `Points: ${report.effort_points || 1}`,
    ...(report.report_type === "feature" ? [] : [`Severity: ${formatTitleCase(report.severity || "medium")}`]),
    `Area: ${formatAreaLabel(report.area)}`,
    `Reporter: <@${report.reporter_discord_user_id}> / ${reporterLabel}`,
    `Report ID: \`${formatShortId(report.report_id)}\``,
    `Duplicate signals: ${Math.max(1, Number(report.duplicate_count || 1))}`,
    "",
    "**Title**",
    neutralizeDiscordMentions(report.summary || "Untitled report"),
    "",
  ];

  if (report.report_type === "feature") {
    const overrides = parseStoredFeatureOverrides(report.steps_to_reproduce);
    const acceptanceCriteria = buildFeatureAcceptanceCriteria(report);
    return [
      ...sharedLines,
      "**User Story**",
      neutralizeDiscordMentions(overrides.userStory || `As a user, I want ${report.summary}, so the ${formatAreaLabel(report.area)} flow better matches the requested outcome.`),
      "",
      "**Description**",
      neutralizeDiscordMentions(report.details || "Not provided"),
      "",
      "**Acceptance Criteria**",
      ...acceptanceCriteria.map((item) => `- ${neutralizeDiscordMentions(item)}`),
      "",
      "**Evidence**",
      "Not provided",
    ].join("\n");
  }

  const overrides = parseStoredBugOverrides(report.steps_to_reproduce);
  const acceptanceCriteria = buildBugAcceptanceCriteria(report);
  return [
    ...sharedLines,
    "**Problem**",
    neutralizeDiscordMentions(report.details || "Not provided"),
    "",
    "**Expected behavior**",
    neutralizeDiscordMentions(overrides.expectedBehavior || `The ${formatAreaLabel(report.area)} flow should complete without the reported issue and give the user a clear result.`),
    "",
    "**Actual behavior**",
    neutralizeDiscordMentions(overrides.actualBehavior || report.details || "Not provided"),
    "",
    "**Steps to reproduce**",
    neutralizeDiscordMentions(overrides.stepsToReproduce || "Not provided"),
    "",
    "**Acceptance Criteria**",
    ...acceptanceCriteria.map((item) => `- ${neutralizeDiscordMentions(item)}`),
    "",
    "**Evidence**",
    "Not provided",
  ].join("\n");
}

async function discordRequest({ path, token, method = "GET", body = null, fetchImpl = fetch }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function fetchDiscordChannel({ channelId, token, fetchImpl = fetch }) {
  return discordRequest({ path: `/channels/${channelId}`, token, fetchImpl });
}

function resolveForumTagIdsByNames(channel, tagNames) {
  const tags = Array.isArray(channel?.available_tags) ? channel.available_tags : [];
  const wanted = new Set(tagNames.map((item) => item.toLowerCase()));
  return tags
    .filter((tag) => typeof tag?.id === "string" && typeof tag?.name === "string" && wanted.has(tag.name.toLowerCase()))
    .map((tag) => tag.id);
}

async function createForumThread({ forumChannelId, token, payload, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${forumChannelId}/threads`,
    token,
    method: "POST",
    body: payload,
    fetchImpl,
  });
}

async function sendDiscordMessage({ channelId, token, payload, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}/messages`,
    token,
    method: "POST",
    body: payload,
    fetchImpl,
  });
}

async function patchDiscordChannelMessage({ channelId, messageId, token, body, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}/messages/${messageId}`,
    token,
    method: "PATCH",
    body,
    fetchImpl,
  });
}

async function updateDiscordChannel({ channelId, token, body, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}`,
    token,
    method: "PATCH",
    body,
    fetchImpl,
  });
}

async function deleteDiscordChannel({ channelId, token, fetchImpl = fetch }) {
  return discordRequest({
    path: `/channels/${channelId}`,
    token,
    method: "DELETE",
    fetchImpl,
  });
}

async function createOrSyncForumThread(report, { env = process.env, fetchImpl = fetch }) {
  const token = resolveBotToken(env);
  const forumChannelId = resolveFeedbackForumChannelId(env);
  if (!hasValue(token) || !hasValue(forumChannelId)) {
    return { ok: false, code: "forum_not_configured" };
  }

  const forumResult = await fetchDiscordChannel({ channelId: forumChannelId, token, fetchImpl });
  const availableTagIds = forumResult.ok
    ? resolveForumTagIdsByNames(
      forumResult.payload,
      report.report_type === "feature" ? ["Feature", "New"] : ["Bug", "New", "Medium"],
    )
    : [];
  const forumTitle = buildForumThreadTitle(report);
  const reporterLabel = hasValue(report.reporter_discord_username)
    ? report.reporter_discord_username
    : typeof report.reporter_member_number === "number"
      ? `Member #${report.reporter_member_number}`
      : "Unknown Discord user";
  const body = buildForumThreadBody(report, reporterLabel);

  if (!report.forum_thread_id) {
    const created = await createForumThread({
      forumChannelId,
      token,
      payload: {
        name: forumTitle,
        applied_tags: availableTagIds,
        message: {
          content: body,
          allowed_mentions: { parse: [] },
        },
      },
      fetchImpl,
    });
    if (!created.ok) {
      return { ok: false, code: "forum_create_failed" };
    }

    const threadId = created.payload?.id || null;
    const messageId = created.payload?.message?.id || threadId;
    if (threadId) {
      const updated = await updateFeedbackReport(report.report_id, {
        forum_channel_id: forumChannelId,
        forum_thread_id: threadId,
        forum_message_id: messageId,
        forum_title: forumTitle,
        forum_applied_tag_ids: availableTagIds,
        last_forum_sync_at: new Date().toISOString(),
      }, { env, fetchImpl });
      return {
        ok: Boolean(updated),
        code: updated ? null : "forum_record_update_failed",
        report: updated || report,
      };
    }
    return { ok: false, code: "forum_create_failed" };
  }

  let ok = true;
  if (report.forum_message_id) {
    const patched = await patchDiscordChannelMessage({
      channelId: report.forum_thread_id,
      messageId: report.forum_message_id,
      token,
      body: {
        content: body,
        allowed_mentions: { parse: [] },
      },
      fetchImpl,
    });
    ok = ok && patched.ok;
  }

  const threadPatched = await updateDiscordChannel({
    channelId: report.forum_thread_id,
    token,
    body: {
      name: forumTitle,
      applied_tags: availableTagIds,
    },
    fetchImpl,
  });
  ok = ok && threadPatched.ok;

  const updated = await updateFeedbackReport(report.report_id, {
    forum_title: forumTitle,
    forum_applied_tag_ids: availableTagIds,
    last_forum_sync_at: new Date().toISOString(),
  }, { env, fetchImpl });

  return {
    ok: ok && Boolean(updated),
    code: ok && updated ? null : "forum_sync_failed",
    report: updated || report,
  };
}

async function postAuditComment(report, content, { env = process.env, fetchImpl = fetch }) {
  const token = resolveBotToken(env);
  if (!hasValue(token) || !hasValue(report.forum_thread_id) || !hasValue(content)) {
    return { ok: false };
  }
  const result = await sendDiscordMessage({
    channelId: report.forum_thread_id,
    token,
    payload: {
      content,
      allowed_mentions: { parse: [] },
    },
    fetchImpl,
  });
  return { ok: result.ok, messageId: result.payload?.id || null };
}

function buildLookupFailureMessage(code) {
  if (code === "ambiguous") {
    return "That report id matched multiple feedback reports. Copy the full Report ID from the forum post.";
  }
  return "Could not find that feedback report. Copy the Report ID from the forum post and try again.";
}

function summarizeFeedbackContentChanges(before, after) {
  const changes = [];
  if ((before.summary || "") !== (after.summary || "")) {
    changes.push("title updated");
  }
  if ((before.area || "") !== (after.area || "")) {
    changes.push("area updated");
  }
  if ((before.details || "") !== (after.details || "")) {
    changes.push("problem details updated");
  }
  if ((before.steps_to_reproduce || "") !== (after.steps_to_reproduce || "")) {
    changes.push("section overrides updated");
  }
  return changes.length > 0 ? changes.join("; ") : "content refreshed";
}

function isFeedbackApplicationCommand(interaction = {}) {
  return interaction?.type === 2 && FEEDBACK_APPLICATION_COMMAND_NAMES.has(interaction?.data?.name);
}

async function createFeedbackReport({ interaction, reportType, env = process.env, fetchImpl = fetch }) {
  const requester = resolveInteractionUser(interaction);
  if (!requester.id) {
    return "Could not save that feedback report.";
  }

  const recentCount = await countRecentReports(requester.id, { env, fetchImpl });
  if (recentCount !== null && recentCount >= 3) {
    return "You have submitted several feedback reports recently. Wait a few minutes, then try again.";
  }

  const modalFields = {
    summary: extractModalTextInputValue(interaction.data?.components, FEEDBACK_SUMMARY_INPUT_CUSTOM_ID),
    area: extractModalTextInputValue(interaction.data?.components, FEEDBACK_AREA_INPUT_CUSTOM_ID),
    details: extractModalTextInputValue(interaction.data?.components, FEEDBACK_DETAILS_INPUT_CUSTOM_ID),
    sectionOverrides: extractModalTextInputValue(interaction.data?.components, FEEDBACK_SECTION_OVERRIDES_INPUT_CUSTOM_ID),
  };
  const normalizedInput = normalizeFeedbackInput(modalFields, reportType);
  if (!normalizedInput) {
    return "Could not save that feedback report.";
  }

  const existingDuplicate = await findDuplicateReport(normalizedInput, { env, fetchImpl });
  if (existingDuplicate) {
    const duplicateCount = Math.max(1, Number(existingDuplicate.duplicate_count || 1)) + 1;
    const updatedDuplicate = await updateFeedbackReport(existingDuplicate.report_id, {
      duplicate_count: duplicateCount,
      last_seen_at: new Date().toISOString(),
      effort_points: estimateEffortPoints({ ...existingDuplicate, duplicate_count: duplicateCount }),
      reporter_discord_username: existingDuplicate.reporter_discord_username || requester.username,
    }, { env, fetchImpl });
    if (!updatedDuplicate) {
      return "Could not save that feedback report right now.";
    }

    await insertAuditEvent({
      report_id: updatedDuplicate.report_id,
      action: "duplicate_signal",
      actor_label: requester.username || "reporter",
      include_reporter_mention: false,
      duplicate_count: duplicateCount,
      note: "DiscordOS recorded a duplicate signal.",
    }, { env, fetchImpl });

    await postAuditComment(
      updatedDuplicate,
      `Duplicate signal added by <@${requester.id}>. Count: ${duplicateCount}.`,
      { env, fetchImpl },
    );
    return "Feedback received. It looks similar to an existing report, so we added your signal to that issue.";
  }

  const reportId = randomUUID();
  const nowIso = new Date().toISOString();
  const inserted = await insertFeedbackReport({
    report_id: reportId,
    short_display_id: formatShortId(reportId),
    source: "discord",
    report_type: normalizedInput.reportType,
    status: "new",
    severity: normalizedInput.severity,
    effort_points: estimateEffortPoints({
      report_type: normalizedInput.reportType,
      severity: normalizedInput.severity,
      area: normalizedInput.area,
      summary: normalizedInput.summary,
      details: normalizedInput.details,
      steps_to_reproduce: normalizedInput.stepsToReproduce,
      duplicate_count: 1,
    }),
    area: normalizedInput.area,
    summary: normalizedInput.summary,
    details: normalizedInput.details,
    steps_to_reproduce: normalizedInput.stepsToReproduce,
    attachment_count: 0,
    attachment_pruned: false,
    reporter_discord_user_id: requester.id,
    reporter_discord_username: requester.username,
    reporter_user_kind: "human",
    discord_interaction_id: typeof interaction.id === "string" ? interaction.id : null,
    duplicate_fingerprint: normalizedInput.duplicateFingerprint,
    duplicate_count: 1,
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    details_pruned: false,
  }, { env, fetchImpl });
  if (!inserted) {
    return "Could not save that feedback report right now.";
  }

  const synced = await createOrSyncForumThread(inserted, { env, fetchImpl });
  const finalReport = synced.report || inserted;
  await insertAuditEvent({
    report_id: finalReport.report_id,
    action: "sync_format",
    actor_label: "DiscordOS",
    include_reporter_mention: false,
    note: synced.ok ? "DiscordOS created the feedback thread." : "DiscordOS stored the report before forum sync completed.",
  }, { env, fetchImpl });

  if (!synced.ok) {
    return `Feedback received, but Discord could not create the forum post yet. The team can still review it. (${formatShortId(finalReport.report_id)})`;
  }

  return "Feedback received. Thanks for helping improve DiscordOS.";
}

async function buildFeedbackManageCardSelectionResponse({ interaction, reportIdOrPrefix, env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return buildEphemeralMessageResponse("This feedback flow is only available in the configured server.");
  }

  const requester = resolveInteractionUser(interaction);
  const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
  const isStaff = canAccessAnyFeedbackReport(permissions);
  if (!requester.id || !reportIdOrPrefix) {
    return buildEphemeralMessageResponse("Choose a feedback card to manage.");
  }

  const lookup = await findReportByIdOrPrefix(reportIdOrPrefix, { env, fetchImpl });
  if (!lookup.ok) {
    return buildEphemeralMessageResponse(buildLookupFailureMessage(lookup.code));
  }

  const isReporter = lookup.report.reporter_discord_user_id === requester.id;
  if (!isReporter && !isStaff) {
    return buildEphemeralMessageResponse("You can only manage feedback you submitted.");
  }
  if (["duplicate", "spam", "withdrawn"].includes(lookup.report.status)) {
    return buildEphemeralMessageResponse("That feedback can no longer accept user updates.");
  }
  return buildManageCardResponse(lookup.report);
}

async function processFeedbackUpdateModalSubmit(interaction, { env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return "This feedback flow is only available in the configured server.";
  }

  const requester = resolveInteractionUser(interaction);
  const reportId = extractReportIdFromPrefixedCustomId(
    UPDATE_EDIT_MODAL_CUSTOM_ID_PREFIX,
    interaction.data?.custom_id,
  );
  if (!requester.id || !reportId) {
    return "Could not update that feedback.";
  }

  const lookup = await findReportByIdOrPrefix(reportId, { env, fetchImpl });
  if (!lookup.ok) {
    return buildLookupFailureMessage(lookup.code);
  }

  const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
  const isStaff = canAccessAnyFeedbackReport(permissions);
  const isReporter = lookup.report.reporter_discord_user_id === requester.id;
  if (!isReporter && !isStaff) {
    return "You can only update feedback you submitted.";
  }
  if (["duplicate", "spam", "withdrawn"].includes(lookup.report.status)) {
    return "That feedback can no longer accept user updates.";
  }

  const modalFields = {
    summary: extractModalTextInputValue(interaction.data?.components, FEEDBACK_SUMMARY_INPUT_CUSTOM_ID),
    area: extractModalTextInputValue(interaction.data?.components, FEEDBACK_AREA_INPUT_CUSTOM_ID),
    details: extractModalTextInputValue(interaction.data?.components, FEEDBACK_DETAILS_INPUT_CUSTOM_ID),
    sectionOverrides: extractModalTextInputValue(interaction.data?.components, FEEDBACK_SECTION_OVERRIDES_INPUT_CUSTOM_ID),
  };
  const normalizedInput = normalizeFeedbackInput(modalFields, lookup.report.report_type);
  if (!normalizedInput) {
    return "Could not update that feedback.";
  }

  const updated = await updateFeedbackReport(lookup.report.report_id, {
    summary: normalizedInput.summary,
    area: normalizedInput.area,
    details: normalizedInput.details,
    steps_to_reproduce: normalizedInput.stepsToReproduce,
    duplicate_fingerprint: normalizedInput.duplicateFingerprint,
    effort_points: estimateEffortPoints({
      ...lookup.report,
      area: normalizedInput.area,
      summary: normalizedInput.summary,
      details: normalizedInput.details,
      steps_to_reproduce: normalizedInput.stepsToReproduce,
    }),
    last_seen_at: new Date().toISOString(),
  }, { env, fetchImpl });
  if (!updated) {
    return "Could not update that feedback right now.";
  }

  const syncResult = await createOrSyncForumThread(updated, { env, fetchImpl });
  const finalReport = syncResult.report || updated;
  const updateDetails = summarizeFeedbackContentChanges(lookup.report, finalReport);
  await insertAuditEvent({
    report_id: finalReport.report_id,
    action: isReporter ? "reporter_update" : "staff_update",
    actor_label: requester.username || (isReporter ? "reporter" : "staff"),
    include_reporter_mention: false,
    note: updateDetails,
  }, { env, fetchImpl });
  await postAuditComment(
    finalReport,
    `${isReporter ? "Reporter" : "Staff"} updated this card: ${updateDetails}.`,
    { env, fetchImpl },
  );

  return syncResult.ok
    ? "Feedback updated."
    : `Feedback updated, but the forum thread could not be fully synced. (${formatShortId(finalReport.report_id)})`;
}

async function processFeedbackWithdraw(interaction, reportIdOrPrefix, statusNote, { env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return "This feedback flow is only available in the configured server.";
  }

  const requester = resolveInteractionUser(interaction);
  if (!requester.id || !reportIdOrPrefix) {
    return "Could not withdraw that feedback.";
  }

  const lookup = await findReportByIdOrPrefix(reportIdOrPrefix, { env, fetchImpl });
  if (!lookup.ok) {
    return buildLookupFailureMessage(lookup.code);
  }

  const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
  const isStaff = canAccessAnyFeedbackReport(permissions);
  const isReporter = lookup.report.reporter_discord_user_id === requester.id;
  if (!isReporter && !isStaff) {
    return "You can only withdraw feedback you submitted.";
  }
  if (["duplicate", "spam", "withdrawn"].includes(lookup.report.status)) {
    return "That feedback can no longer be withdrawn.";
  }

  const note = normalizeTextInput(statusNote, 500) || (isReporter ? "Withdrawn by reporter" : "Withdrawn by staff");
  const updated = await updateFeedbackReport(lookup.report.report_id, {
    status: "withdrawn",
    details: null,
    steps_to_reproduce: null,
    screenshot_url: null,
    attachment_metadata: null,
    attachment_pruned: true,
    details_pruned: true,
    status_updated_at: new Date().toISOString(),
    status_updated_by_discord_user_id: requester.id,
    status_note: note,
  }, { env, fetchImpl });
  if (!updated) {
    return "Could not withdraw that feedback right now.";
  }

  await insertAuditEvent({
    report_id: updated.report_id,
    action: "withdraw",
    actor_label: requester.username || (isReporter ? "reporter" : "staff"),
    include_reporter_mention: false,
    status_before: lookup.report.status,
    status_after: "withdrawn",
    note,
  }, { env, fetchImpl });

  let forumSyncFailed = false;
  if (updated.forum_thread_id) {
    await postAuditComment(updated, `${isReporter ? "Reporter" : "Staff"} withdrew this card.`, { env, fetchImpl });
    const token = resolveBotToken(env);
    if (hasValue(token)) {
      const deleted = await deleteDiscordChannel({
        channelId: updated.forum_thread_id,
        token,
        fetchImpl,
      });
      forumSyncFailed = !deleted.ok;
    } else {
      forumSyncFailed = true;
    }
  }

  return forumSyncFailed
    ? `Feedback withdrawn, but the forum thread could not be fully deleted. (${formatShortId(updated.report_id)})`
    : "Feedback withdrawn. The forum post was removed and we kept a small audit record.";
}

async function processFeedbackStatusCommand(interaction, { env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return "This feedback flow is only available in the configured server.";
  }

  const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
  if (!canAccessAnyFeedbackReport(permissions)) {
    return "You do not have permission to update feedback.";
  }

  const requester = resolveInteractionUser(interaction);
  const reportIdOrPrefix = extractCommandStringOption(interaction.data?.options, FEEDBACK_REPORT_ID_OPTION_NAME);
  const nextStatus = normalizeFeedbackStatus(
    extractCommandStringOption(interaction.data?.options, FEEDBACK_STATUS_OPTION_NAME),
  );
  const note = normalizeTextInput(
    extractCommandStringOption(interaction.data?.options, FEEDBACK_NOTE_OPTION_NAME),
    500,
  );

  if (!requester.id || !reportIdOrPrefix || !nextStatus) {
    return "Could not update that feedback.";
  }

  const lookup = await findReportByIdOrPrefix(reportIdOrPrefix, { env, fetchImpl });
  if (!lookup.ok) {
    return buildLookupFailureMessage(lookup.code);
  }

  const updated = await updateFeedbackReport(lookup.report.report_id, {
    status: nextStatus,
    status_updated_at: new Date().toISOString(),
    status_updated_by_discord_user_id: requester.id,
    status_note: note,
    last_seen_at: new Date().toISOString(),
  }, { env, fetchImpl });
  if (!updated) {
    return "Could not update that feedback right now.";
  }

  const syncResult = await createOrSyncForumThread(updated, { env, fetchImpl });
  const finalReport = syncResult.report || updated;
  const beforeLabel = REPORT_STATUS_LABELS[lookup.report.status] || lookup.report.status;
  const afterLabel = REPORT_STATUS_LABELS[nextStatus] || nextStatus;
  const auditNote = note || `Status changed from ${beforeLabel} to ${afterLabel}.`;

  await insertAuditEvent({
    report_id: finalReport.report_id,
    action: "status_update",
    actor_label: requester.username || "staff",
    include_reporter_mention: false,
    status_before: lookup.report.status,
    status_after: nextStatus,
    note: auditNote,
  }, { env, fetchImpl });
  await postAuditComment(
    finalReport,
    `Status updated by staff: ${beforeLabel} -> ${afterLabel}.${note ? ` Note: ${note}` : ""}`,
    { env, fetchImpl },
  );

  return syncResult.ok
    ? "Feedback updated."
    : `Feedback updated, but the forum thread could not be fully synced. (${formatShortId(finalReport.report_id)})`;
}

async function processFeedbackCompletionReviewCommand(interaction, { env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return "This feedback flow is only available in the configured server.";
  }

  const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
  if (!canAccessAnyFeedbackReport(permissions)) {
    return "You do not have permission to review completed feedback.";
  }

  const requester = resolveInteractionUser(interaction);
  const reportIdOrPrefix = extractCommandStringOption(interaction.data?.options, FEEDBACK_REPORT_ID_OPTION_NAME);
  const decision = normalizeCompletionReviewDecision(
    extractCommandStringOption(interaction.data?.options, FEEDBACK_COMPLETION_REVIEW_DECISION_OPTION_NAME),
  );
  const note = normalizeTextInput(
    extractCommandStringOption(interaction.data?.options, FEEDBACK_NOTE_OPTION_NAME),
    500,
  );

  if (!requester.id || !reportIdOrPrefix || !decision) {
    return "Could not update that completion review.";
  }

  const lookup = await findReportByIdOrPrefix(reportIdOrPrefix, { env, fetchImpl });
  if (!lookup.ok) {
    return buildLookupFailureMessage(lookup.code);
  }

  const updated = await updateFeedbackReport(lookup.report.report_id, {
    completion_review_status: decision,
    completion_reviewed_at: new Date().toISOString(),
    completion_reviewed_by_discord_user_id: requester.id,
    completion_review_note: note,
    last_seen_at: new Date().toISOString(),
  }, { env, fetchImpl });
  if (!updated) {
    return "Could not update that completion review right now.";
  }

  const decisionLabel = COMPLETION_REVIEW_LABELS[decision] || decision;
  const auditNote = note || `Completion review set to ${decisionLabel}.`;
  await insertAuditEvent({
    report_id: updated.report_id,
    action: "completion_review",
    actor_label: requester.username || "staff",
    include_reporter_mention: false,
    note: auditNote,
  }, { env, fetchImpl });
  await postAuditComment(
    updated,
    `Completion review updated: ${decisionLabel}.${note ? ` Note: ${note}` : ""}`,
    { env, fetchImpl },
  );

  return `Completion review updated. Status: ${decisionLabel}.`;
}

function isFeedbackInteraction(interaction = {}) {
  const customId = interaction?.data?.custom_id;
  if (interaction?.type === 3 && typeof customId === "string") {
    return (
      PANEL_SUBMIT_CUSTOM_IDS.has(customId)
      || PANEL_UPDATE_CUSTOM_IDS.has(customId)
      || customId === SUBMIT_PICKER_SELECT_CUSTOM_ID
      || customId === UPDATE_PICKER_LOOKUP_BUTTON_CUSTOM_ID
      || customId === MANAGE_CANCEL_BUTTON_CUSTOM_ID
      || customId.startsWith(`${SUBMIT_CREATE_BUTTON_CUSTOM_ID_PREFIX}:`)
      || customId.startsWith(`${UPDATE_PICKER_BUTTON_CUSTOM_ID_PREFIX}:`)
      || customId.startsWith(`${MANAGE_EDIT_BUTTON_CUSTOM_ID_PREFIX}:`)
      || customId.startsWith(`${MANAGE_WITHDRAW_BUTTON_CUSTOM_ID_PREFIX}:`)
    );
  }

  if (interaction?.type === 5 && typeof customId === "string") {
    return (
      customId === UPDATE_PICKER_LOOKUP_MODAL_CUSTOM_ID
      || customId.startsWith(`${REPORT_MODAL_CUSTOM_ID_PREFIX}:`)
      || customId.startsWith(`${UPDATE_EDIT_MODAL_CUSTOM_ID_PREFIX}:`)
      || customId.startsWith(`${WITHDRAW_SELECTED_MODAL_CUSTOM_ID_PREFIX}:`)
    );
  }

  return false;
}

async function handleFeedbackInteraction({ interaction, env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return buildEphemeralMessageResponse("This feedback flow is only available in the configured server.");
  }

  const customId = interaction?.data?.custom_id;
  if (interaction?.type === 3 && PANEL_SUBMIT_CUSTOM_IDS.has(customId)) {
    return buildSubmitPickerResponse("bug");
  }

  if (interaction?.type === 3 && PANEL_UPDATE_CUSTOM_IDS.has(customId)) {
    const requester = resolveInteractionUser(interaction);
    const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
    const recentReports = await listRecentReports({
      reporterDiscordUserId: canAccessAnyFeedbackReport(permissions) ? null : requester.id,
      excludedStatuses: ["duplicate", "spam", "withdrawn"],
      limit: 25,
    }, { env, fetchImpl });
    if (!recentReports || recentReports.length === 0) {
      return buildEphemeralMessageResponse("No editable feedback cards are available right now.");
    }
    return buildUpdatePickerResponse(recentReports);
  }

  if (interaction?.type === 3 && customId === SUBMIT_PICKER_SELECT_CUSTOM_ID) {
    return buildSubmitPickerResponse(resolveSubmitPickerReportTypeFromValues(interaction.data?.values));
  }

  if (interaction?.type === 3 && typeof customId === "string" && customId.startsWith(`${SUBMIT_CREATE_BUTTON_CUSTOM_ID_PREFIX}:`)) {
    const reportType = resolveReportTypeFromCreateButton(customId);
    return reportType
      ? buildFeedbackReportModalResponse(reportType)
      : buildEphemeralMessageResponse("Choose Bug or Feature first.");
  }

  if (interaction?.type === 3 && typeof customId === "string" && customId.startsWith(`${UPDATE_PICKER_BUTTON_CUSTOM_ID_PREFIX}:`)) {
    return buildFeedbackManageCardSelectionResponse({
      interaction,
      reportIdOrPrefix: extractReportIdFromPrefixedCustomId(UPDATE_PICKER_BUTTON_CUSTOM_ID_PREFIX, customId),
      env,
      fetchImpl,
    });
  }

  if (interaction?.type === 3 && customId === UPDATE_PICKER_LOOKUP_BUTTON_CUSTOM_ID) {
    return buildManageLookupModalResponse();
  }

  if (interaction?.type === 3 && customId === UPDATE_PICKER_SELECT_CUSTOM_ID) {
    return buildFeedbackManageCardSelectionResponse({
      interaction,
      reportIdOrPrefix: resolveFirstComponentValue(interaction.data?.values),
      env,
      fetchImpl,
    });
  }

  if (interaction?.type === 3 && typeof customId === "string" && customId.startsWith(`${MANAGE_EDIT_BUTTON_CUSTOM_ID_PREFIX}:`)) {
    const lookup = await findReportByIdOrPrefix(
      extractReportIdFromPrefixedCustomId(MANAGE_EDIT_BUTTON_CUSTOM_ID_PREFIX, customId),
      { env, fetchImpl },
    );
    if (!lookup.ok) {
      return buildEphemeralMessageResponse(buildLookupFailureMessage(lookup.code));
    }
    const requester = resolveInteractionUser(interaction);
    const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
    const isStaff = canAccessAnyFeedbackReport(permissions);
    if (lookup.report.reporter_discord_user_id !== requester.id && !isStaff) {
      return buildEphemeralMessageResponse("You can only update feedback you submitted.");
    }
    return buildUpdateModalResponse(lookup.report);
  }

  if (interaction?.type === 3 && typeof customId === "string" && customId.startsWith(`${MANAGE_WITHDRAW_BUTTON_CUSTOM_ID_PREFIX}:`)) {
    const lookup = await findReportByIdOrPrefix(
      extractReportIdFromPrefixedCustomId(MANAGE_WITHDRAW_BUTTON_CUSTOM_ID_PREFIX, customId),
      { env, fetchImpl },
    );
    if (!lookup.ok) {
      return buildEphemeralMessageResponse(buildLookupFailureMessage(lookup.code));
    }
    const requester = resolveInteractionUser(interaction);
    const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;
    const isStaff = canAccessAnyFeedbackReport(permissions);
    if (lookup.report.reporter_discord_user_id !== requester.id && !isStaff) {
      return buildEphemeralMessageResponse("You can only withdraw feedback you submitted.");
    }
    return buildWithdrawSelectedModalResponse(lookup.report);
  }

  if (interaction?.type === 3 && customId === MANAGE_CANCEL_BUTTON_CUSTOM_ID) {
    return buildEphemeralMessageResponse("Feedback action cancelled.");
  }

  if (interaction?.type === 5 && customId === UPDATE_PICKER_LOOKUP_MODAL_CUSTOM_ID) {
    return buildFeedbackManageCardSelectionResponse({
      interaction,
      reportIdOrPrefix: extractModalTextInputValue(interaction.data?.components, UPDATE_PICKER_LOOKUP_INPUT_CUSTOM_ID),
      env,
      fetchImpl,
    });
  }

  if (interaction?.type === 5 && typeof customId === "string" && customId.startsWith(`${REPORT_MODAL_CUSTOM_ID_PREFIX}:`)) {
    const reportType = resolveReportTypeFromModalCustomId(customId);
    return buildEphemeralMessageResponse(
      reportType
        ? await createFeedbackReport({ interaction, reportType, env, fetchImpl })
        : "Could not save that feedback report.",
    );
  }

  if (interaction?.type === 5 && typeof customId === "string" && customId.startsWith(`${UPDATE_EDIT_MODAL_CUSTOM_ID_PREFIX}:`)) {
    return buildEphemeralMessageResponse(await processFeedbackUpdateModalSubmit(interaction, { env, fetchImpl }));
  }

  if (interaction?.type === 5 && typeof customId === "string" && customId.startsWith(`${WITHDRAW_SELECTED_MODAL_CUSTOM_ID_PREFIX}:`)) {
    const reportId = extractReportIdFromPrefixedCustomId(WITHDRAW_SELECTED_MODAL_CUSTOM_ID_PREFIX, customId);
    return buildEphemeralMessageResponse(await processFeedbackWithdraw(
      interaction,
      reportId,
      extractModalTextInputValue(interaction.data?.components, FEEDBACK_WITHDRAW_NOTE_INPUT_CUSTOM_ID),
      { env, fetchImpl },
    ));
  }

  return buildEphemeralMessageResponse("Unsupported DiscordOS feedback interaction.");
}

async function handleFeedbackApplicationCommand({ interaction, env = process.env, fetchImpl = fetch }) {
  if (!interactionMatchesGuild(interaction, env)) {
    return buildEphemeralMessageResponse("This feedback flow is only available in the configured server.");
  }

  const commandName = interaction?.data?.name;
  const permissions = typeof interaction.member?.permissions === "string" ? interaction.member.permissions : null;

  if (commandName === SETUP_FEEDBACK_COMMAND_NAME) {
    if (!hasSetupPermission(permissions)) {
      return buildEphemeralMessageResponse("You do not have permission to refresh the feedback launcher.");
    }

    const upsertResult = await computaInternals.upsertFeedbackPanel({
      targetChannelId: interaction?.channel_id || null,
      cleanupLegacyPanels: true,
      env,
      fetchImpl,
    });
    if (!upsertResult.ok) {
      return buildEphemeralMessageResponse("DiscordOS could not refresh the Feedback launcher right now.");
    }

    return buildEphemeralMessageResponse(
      upsertResult.action === "updated" || upsertResult.action === "reposted"
        ? `Feedback launcher updated in ${upsertResult.channelLabel}.`
        : `Feedback launcher created in ${upsertResult.channelLabel}.`,
    );
  }

  if (commandName === FEEDBACK_COMMAND_NAME) {
    return buildSubmitPickerResponse("bug");
  }

  if (commandName === FEEDBACK_WITHDRAW_COMMAND_NAME) {
    return buildEphemeralMessageResponse(await processFeedbackWithdraw(
      interaction,
      extractCommandStringOption(interaction.data?.options, FEEDBACK_REPORT_ID_OPTION_NAME),
      null,
      { env, fetchImpl },
    ));
  }

  if (commandName === FEEDBACK_STATUS_COMMAND_NAME) {
    return buildEphemeralMessageResponse(await processFeedbackStatusCommand(interaction, { env, fetchImpl }));
  }

  if (commandName === FEEDBACK_COMPLETION_REVIEW_COMMAND_NAME) {
    return buildEphemeralMessageResponse(await processFeedbackCompletionReviewCommand(interaction, { env, fetchImpl }));
  }

  return buildEphemeralMessageResponse("Unsupported DiscordOS feedback command.");
}

module.exports = {
  _internals: {
    FEEDBACK_APPLICATION_COMMAND_NAMES,
    buildGuildCommandDefinitions,
    isFeedbackInteraction,
    isFeedbackApplicationCommand,
    handleFeedbackInteraction,
    handleFeedbackApplicationCommand,
    buildSubmitPickerResponse,
    buildFeedbackReportModalResponse,
    getSupabaseConfig,
    formatShortId,
  },
};
