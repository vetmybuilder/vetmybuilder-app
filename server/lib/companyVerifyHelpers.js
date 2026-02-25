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
 * Factory that returns a queue function bound to the ctx (db/mysqlQuery + matchByName).
 *
 * Usage (MySQL):
 *   const queueCompanyVerification = makeQueueCompanyVerification({ mysqlQuery, matchByName });
 *
 * Usage (legacy SQLite):
 *   const queueCompanyVerification = makeQueueCompanyVerification({ db, matchByName });
 */
function makeQueueCompanyVerification({ db, mysqlQuery, matchByName }) {
  const hasMysql = typeof mysqlQuery === "function";

  return function queueCompanyVerification({ recId, name, locationHint }) {
    if (!recId || !name) return;

    const nowIso = new Date().toISOString();

    // --- Initial "queued" insert ---
    if (hasMysql) {
      // MySQL: assume UNIQUE(recommendationId); ON DUPLICATE KEY => no-op
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
    } else if (db && db.prepare) {
      // SQLite / better-sqlite3
      try {
        db.prepare(
          `INSERT INTO company_verifications (recommendationId, status, checkedAt)
           VALUES (?, 'queued', ?)
           ON CONFLICT(recommendationId) DO NOTHING`
        ).run(recId, nowIso);
      } catch (e) {
        console.warn(
          "[companyVerifyHelpers] initial queue insert failed (sqlite):",
          e?.message || e
        );
      }
    } else {
      console.warn(
        "[companyVerifyHelpers] no db/mysqlQuery provided; cannot queue verification"
      );
      return;
    }

    // --- Async worker: run CH match + update row ---
    setImmediate(async () => {
      try {
        // mark as running
        const nowRun = new Date().toISOString();

        if (hasMysql) {
          await mysqlQuery(
            `
            UPDATE company_verifications
               SET status = 'running',
                   checkedAt = ?
             WHERE recommendationId = ?
            `,
            [nowRun, recId]
          );
        } else {
          db.prepare(
            `UPDATE company_verifications
                SET status='running', checkedAt=?
              WHERE recommendationId=?`
          ).run(nowRun, recId);
        }

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

        if (hasMysql) {
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
        } else {
          db.prepare(
            `UPDATE company_verifications
                SET status=@status,
                    companyNumber=@companyNumber,
                    companyName=@companyName,
                    score=@score,
                    sicCodes=@sicCodes,
                    raw=@raw,
                    errorMessage=@errorMessage,
                    checkedAt=@checkedAt
              WHERE recommendationId=@recommendationId`
          ).run(payload);
        }
      } catch (e) {
        const errMsg = String(e?.message || e);
        const errTime = new Date().toISOString();

        try {
          if (hasMysql) {
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
          } else {
            db.prepare(
              `UPDATE company_verifications
                  SET status='error',
                      errorMessage=?,
                      checkedAt=?
                WHERE recommendationId=?`
            ).run(errMsg, errTime, recId);
          }
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

