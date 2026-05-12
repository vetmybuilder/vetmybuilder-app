// server/lib/adminAuditLog.js
//
// Tiny helper that mutation endpoints call to record what admin staff
// did to a tradesperson. Powers the drawer's Activity tab and the
// audit trail for compliance reviews.
//
// Append-only: there's no update/delete API. If a row is wrong, write
// a correction event - we never rewrite history.
//
// Failure is non-fatal. We log and swallow so a failed audit insert
// never blocks the actual mutation (which is what the user actually
// asked us to do).

/**
 * Insert a row into admin_audit_log. Always returns even on failure so
 * callers don't have to wrap it in try/catch.
 *
 * @param {object}   args
 * @param {function} args.mysqlQuery
 * @param {string}   args.actorUid    - the admin uid performing the action
 * @param {string}   args.targetUid   - the tradesperson uid the action is on
 * @param {string}   args.action      - short verb, e.g. "status_change"
 * @param {object}   [args.details]   - free-form JSON payload
 * @param {object}   [args.log]       - optional logger
 */
async function logAdminAction({
  mysqlQuery,
  actorUid,
  targetUid,
  action,
  details,
  log,
}) {
  if (!mysqlQuery || !actorUid || !targetUid || !action) return;
  try {
    await mysqlQuery(
      `INSERT INTO admin_audit_log (actor_uid, target_uid, action, details_json)
       VALUES (?, ?, ?, ?)`,
      [
        String(actorUid),
        String(targetUid),
        String(action),
        details === undefined || details === null ? null : JSON.stringify(details),
      ],
    );
  } catch (err) {
    log?.warn?.(
      { err: err?.message, action, targetUid },
      "admin audit log insert failed (non-fatal)",
    );
  }
}

module.exports = { logAdminAction };
