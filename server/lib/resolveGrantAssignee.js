// server/lib/resolveGrantAssignee.js
//
// Resolves the Firebase uid that should own a freshly-captured grant
// lead. Used by both the public submit endpoint (to set
// grant_leads.assigned_tradesperson_uid) and the push helper (to
// pick a notification target).
//
// Resolution order:
//   1. process.env.ELEGANT_TRADESPERSON_UID (string Firebase uid)
//   2. SELECT user_id FROM tradesmen WHERE LOWER(company_name) LIKE 'elegant%'
//
// Returns null if neither route succeeds - callers should handle
// silently (lead still saves, admin can re-assign manually).

async function resolveGrantAssigneeUid(mysqlQuery) {
  const envUid = process.env.ELEGANT_TRADESPERSON_UID;
  if (envUid && envUid.trim()) return envUid.trim();
  try {
    const rows = await mysqlQuery(
      `SELECT user_id FROM tradesmen
         WHERE LOWER(company_name) LIKE 'elegant%'
         ORDER BY created_at ASC
         LIMIT 1`,
    );
    return rows?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

module.exports = { resolveGrantAssigneeUid };
