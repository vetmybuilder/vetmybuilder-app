// server/v2/lib/config.js
function resolveFirebaseApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  try {
    const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON || "{}";
    const cfg = JSON.parse(raw);
    return cfg.apiKey;
  } catch {
    return undefined;
  }
}
const PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  `http://localhost:${process.env.PORT || 8787}`;
module.exports = { resolveFirebaseApiKey, PUBLIC_API_BASE };
