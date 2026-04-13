// server/lib/activityLog.js
const { logger } = require("./logger");

/**
 * Factory that returns a logActivity function bound to a mysqlQuery connection.
 *
 * @param {Function} mysqlQuery
 * @param {Object}   [log]       optional Pino logger (defaults to root logger)
 * @returns {Function} logActivity(event, level, actorUid, detail)
 */
function makeLogActivity(mysqlQuery, log) {
  const _log = log || logger;

  return async function logActivity(event, level, actorUid, detail) {
    const lvl = level || "info";

    // Structured Pino log
    const pinoMethod = lvl === "error" ? "error" : lvl === "warn" ? "warn" : "info";
    _log[pinoMethod]?.({ event, level: lvl, actorUid }, detail || event);

    // Fire-and-forget DB insert
    try {
      await mysqlQuery(
        `INSERT INTO activity_log (event, level, actor_uid, detail) VALUES (?, ?, ?, ?)`,
        [event, lvl, actorUid || null, detail || null],
      );
    } catch {
      // Silently swallow — logging should never break the request
    }
  };
}

module.exports = { makeLogActivity };
