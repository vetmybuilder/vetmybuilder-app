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

// // server/lib/companyVerification.js
// function queueCompanyVerification(
//   db,
//   matchByName,
//   { recId, name, locationHint }
// ) {
//   if (!recId || !name) return;
//   db.prepare(
//     `INSERT INTO company_verifications (recommendationId, status, checkedAt)
//               VALUES (?, 'queued', ?) ON CONFLICT(recommendationId) DO NOTHING`
//   ).run(recId, new Date().toISOString());

//   setImmediate(async () => {
//     try {
//       db.prepare(
//         `UPDATE company_verifications SET status='running' WHERE recommendationId=?`
//       ).run(recId);
//       const result = await matchByName({ name, locationHint });
//       const payload = {
//         status: result.verdict,
//         companyNumber: result.best?.number ?? null,
//         companyName: result.best?.name ?? null,
//         score: result.best?.score ?? null,
//         sicCodes: JSON.stringify(result.best?.sicCodes || []),
//         raw: JSON.stringify(result),
//         errorMessage: null,
//         checkedAt: new Date().toISOString(),
//         recommendationId: recId,
//       };
//       db.prepare(
//         `UPDATE company_verifications
//                   SET status=@status, companyNumber=@companyNumber, companyName=@companyName, score=@score,
//                       sicCodes=@sicCodes, raw=@raw, errorMessage=@errorMessage, checkedAt=@checkedAt
//                   WHERE recommendationId=@recommendationId`
//       ).run(payload);
//     } catch (e) {
//       db.prepare(
//         `UPDATE company_verifications SET status='error', errorMessage=?, checkedAt=? WHERE recommendationId=?`
//       ).run(String(e?.message || e), new Date().toISOString(), recId);
//     }
//   });
// }
// module.exports = { queueCompanyVerification };
