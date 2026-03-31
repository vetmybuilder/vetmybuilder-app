// server/lib/companyVerifyHelpers.js

function _normName(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(/\b(limited|ltd|llp|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function _roughNameScore(aTitle, qName) {
  const a = _normName(aTitle);
  const b = _normName(qName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.startsWith(b) || b.startsWith(a)) return 85;
  if (a.includes(b) || b.includes(a)) return 70;
  return 0;
}

/**
 * Factory that returns a queue function bound to the ctx (mysqlQuery + matchByName).
 *
 * Usage:
 *   const queueCompanyVerification = makeQueueCompanyVerification({ mysqlQuery, matchByName });
 */
function makeQueueCompanyVerification({ mysqlQuery, matchByName }) {
  if (typeof mysqlQuery !== "function") {
    throw new Error("makeQueueCompanyVerification: mysqlQuery is required");
  }

  return function queueCompanyVerification({ recId, name, locationHint }) {
    if (!recId || !name) return;

    const nowIso = new Date().toISOString();

    // --- Initial "queued" insert ---
    mysqlQuery(
      `
      INSERT INTO company_verifications (recommendationId, status, checkedAt)
      VALUES (?, 'queued', ?)
      ON DUPLICATE KEY UPDATE recommendationId = recommendationId
      `,
      [recId, nowIso]
    ).catch((e) => {
      console.warn(
        "[companyVerifyHelpers] initial queue insert failed (mysql):",
        e?.message || e
      );
    });

    // --- Async worker: run CH match + update row ---
    setImmediate(async () => {
      try {
        // mark as running
        const nowRun = new Date().toISOString();

        await mysqlQuery(
          `
          UPDATE company_verifications
             SET status = 'running',
                 checkedAt = ?
           WHERE recommendationId = ?
          `,
          [nowRun, recId]
        );

        // call Companies House matcher
        const result = await matchByName({ name, locationHint });

        const payload = {
          status: result.verdict, // verified | ambiguous | no_match
          companyNumber: result.best?.number ?? null,
          companyName: result.best?.name ?? null,
          score: result.best?.score ?? null,
          sicCodes: JSON.stringify(result.best?.sicCodes || []),
          raw: JSON.stringify(result),
          errorMessage: null,
          checkedAt: new Date().toISOString(),
          recommendationId: recId,
        };

        await mysqlQuery(
          `
          UPDATE company_verifications
             SET status        = ?,
                 companyNumber = ?,
                 companyName   = ?,
                 score         = ?,
                 sicCodes      = ?,
                 raw           = ?,
                 errorMessage  = ?,
                 checkedAt     = ?
           WHERE recommendationId = ?
          `,
          [
            payload.status,
            payload.companyNumber,
            payload.companyName,
            payload.score,
            payload.sicCodes,
            payload.raw,
            payload.errorMessage,
            payload.checkedAt,
            payload.recommendationId,
          ]
        );
      } catch (e) {
        const errMsg = String(e?.message || e);
        const errTime = new Date().toISOString();

        try {
          await mysqlQuery(
            `
            UPDATE company_verifications
               SET status      = 'error',
                   errorMessage = ?,
                   checkedAt    = ?
             WHERE recommendationId = ?
            `,
            [errMsg, errTime, recId]
          );
        } catch (inner) {
          console.error(
            "[companyVerifyHelpers] failed to mark error state:",
            inner?.message || inner
          );
        }
      }
    });
  };
}

module.exports = { _normName, _roughNameScore, makeQueueCompanyVerification };
