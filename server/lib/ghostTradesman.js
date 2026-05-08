// server/lib/ghostTradesman.js
//
// Helpers for the staging-only "ghost tradesperson" sim. A ghost is a row
// in `tradesmen` with `master_uid IS NOT NULL` - notifications sent to the
// ghost's user_id should land on the master operator instead so a single
// person can run many trade personas without missing alerts. Production
// never seeds ghost rows so these helpers are a no-op there.
//
// The sender_uid stored on chat_messages is always the ghost's user_id
// (never the master's), so the homeowner only ever sees one persona per
// thread.

/**
 * Resolve a notification recipient: if `uid` is a ghost tradesman, return
 * the master_uid; otherwise return the original uid unchanged.
 *
 * @param {Function} mysqlQuery
 * @param {string} uid
 * @returns {Promise<string>}
 */
async function resolveGhostNotificationTarget(mysqlQuery, uid) {
  if (!uid) return uid;
  try {
    const rows = await mysqlQuery(
      "SELECT master_uid FROM tradesmen WHERE user_id = ? AND master_uid IS NOT NULL LIMIT 1",
      [uid],
    );
    const master = rows?.[0]?.master_uid;
    return master || uid;
  } catch {
    return uid;
  }
}

/**
 * True iff `senderUid` is the master operator for the ghost tradesman
 * with user_id `ghostUid`. Used by the chat send path to allow a master
 * to reply as a ghost.
 *
 * @param {Function} mysqlQuery
 * @param {string} ghostUid    the builder_uid stored on the swipe_interest row
 * @param {string} senderUid   the authenticated user trying to send
 * @returns {Promise<boolean>}
 */
async function isMasterOfGhost(mysqlQuery, ghostUid, senderUid) {
  if (!ghostUid || !senderUid) return false;
  try {
    const rows = await mysqlQuery(
      "SELECT 1 FROM tradesmen WHERE user_id = ? AND master_uid = ? LIMIT 1",
      [ghostUid, senderUid],
    );
    return !!(rows && rows[0]);
  } catch {
    return false;
  }
}

module.exports = {
  resolveGhostNotificationTarget,
  isMasterOfGhost,
};
