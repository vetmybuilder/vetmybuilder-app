// server/lib/companyVerification.js
const TAG = "[companyVerification]";

/**
 * queueVerification
 *
 * High-level helper that defers to a provided low-level implementation.
 * You inject a function (typically ctx.queueCompanyVerification) that
 * knows how to talk to your DB and Companies House.
 *
 * Usage:
 *   const { queueVerification } = require("../lib/companyVerification");
 *
 *   // In a route:
 *   queueVerification(ctx.queueCompanyVerification, {
 *     recId,
 *     name,
 *     locationHint,    // optional
 *     companyNumber,   // optional
 *     sourceTag: "magic" | "platform" | "owner" | ...
 *   });
 *
 * The injected function should have the signature:
 *   async function queueCompanyVerification({ recId, name, locationHint, companyNumber, sourceTag }) { ... }
 *
 * and is free to use mysqlQuery / matchByName / whatever it needs.
 */
function queueVerification(queueCompanyVerificationFn, payload) {
  if (typeof queueCompanyVerificationFn !== "function") {
    return;
  }

  const { recId, name } = payload || {};
  if (!recId || !name) return;

  const {
    locationHint = null,
    companyNumber = null,
    sourceTag = null,
  } = payload;

  // Fire-and-forget so we never block the HTTP response
  setImmediate(async () => {
    try {
      await queueCompanyVerificationFn({
        recId,
        name,
        locationHint,
        companyNumber,
        sourceTag,
      });
    } catch (e) {
      console.warn(
        `${TAG} queueVerification error for recId=${recId}:`,
        e?.message || e
      );
    }
  });
}

module.exports = { queueVerification };
