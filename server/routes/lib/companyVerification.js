// server/routes/lib/companyVerification.js
//
// Shared helper for queuing company verification work safely from routes.
// Wraps ctx.queueCompanyVerification with guards + structured logging.

const { logger } = require("../../lib/logger");

function queueVerification(queueFn, opts) {
  const log = logger.child({ module: "companyVerification" });

  const {
    recId = null,
    name,
    locationHint,
    sourceTag = "generic",
  } = opts || {};

  if (!queueFn || typeof queueFn !== "function") {
    // Worker not wired — silent no-op
    log.debug(
      { sourceTag },
      "queueVerification skipped — no queue function attached"
    );
    return;
  }

  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    log.debug({ sourceTag, recId }, "queueVerification skipped — empty name");
    return;
  }

  const payload = {
    recId,
    name: trimmedName,
    locationHint: locationHint || undefined,
  };

  try {
    queueFn(payload);
    log.info({ sourceTag, payload }, "Queued company verification task");
  } catch (e) {
    log.error(
      {
        sourceTag,
        payload,
        errMsg: e?.message,
        stack: e?.stack,
      },
      "queueCompanyVerification failed"
    );
    // Non-fatal — caller routes must continue
  }
}

module.exports = {
  queueVerification,
};
