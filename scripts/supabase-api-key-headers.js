const MODERN_SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9_-]{20,}$/;
const MODERN_PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;

function normalizeApiKey(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("SUPABASE_API_KEY_REQUIRED");
  }
  return value.trim();
}

function isModernSupabaseSecretKey(value) {
  return typeof value === "string" && MODERN_SECRET_KEY_PATTERN.test(value.trim());
}

function isModernSupabasePublishableKey(value) {
  return typeof value === "string" && MODERN_PUBLISHABLE_KEY_PATTERN.test(value.trim());
}

function isModernSupabaseKeyLike(value) {
  return typeof value === "string" && /^sb_[A-Za-z0-9]+_/.test(value.trim());
}

function buildSupabaseElevatedHeaders(value) {
  const apiKey = normalizeApiKey(value);
  if (isModernSupabaseSecretKey(apiKey)) return { apikey: apiKey };
  if (isModernSupabaseKeyLike(apiKey)) throw new Error("SUPABASE_ELEVATED_KEY_CLASS_MISMATCH");
  return { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
}

function buildSupabasePublicHeaders(value) {
  const apiKey = normalizeApiKey(value);
  if (isModernSupabasePublishableKey(apiKey)) return { apikey: apiKey };
  if (isModernSupabaseKeyLike(apiKey)) throw new Error("SUPABASE_PUBLIC_KEY_CLASS_MISMATCH");
  return { apikey: apiKey, Authorization: `Bearer ${apiKey}` };
}

module.exports = {
  buildSupabaseElevatedHeaders,
  buildSupabasePublicHeaders,
  isModernSupabaseKeyLike,
  isModernSupabasePublishableKey,
  isModernSupabaseSecretKey,
};
