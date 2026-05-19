// server/lib/payments/handlers/_shared.js
//
// Helpers shared between handlers in this directory. Underscore prefix
// signals "internal to this module" -- not consumed outside handlers/.

async function userIdFromSubId(mysqlQuery, subId) {
  if (!subId) return null;
  try {
    const rows = await mysqlQuery(
      `SELECT user_id FROM builder_subscriptions
        WHERE stripe_subscription_id = ?
        LIMIT 1`,
      [subId],
    );
    return rows?.[0]?.user_id || null;
  } catch {
    return null;
  }
}

module.exports = { userIdFromSubId };
