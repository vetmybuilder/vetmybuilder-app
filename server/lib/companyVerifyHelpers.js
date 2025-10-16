// server/v2/lib/companyVerifyHelpers.js
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

/** Factory that returns a queue function bound to the ctx (db + matchByName). */
function makeQueueCompanyVerification({ db, matchByName }) {
  return function queueCompanyVerification({ recId, name, locationHint }) {
    if (!recId || !name) return;

    db.prepare(
      `INSERT INTO company_verifications (recommendationId, status, checkedAt)
       VALUES (?, 'queued', ?)
       ON CONFLICT(recommendationId) DO NOTHING`
    ).run(recId, new Date().toISOString());

    setImmediate(async () => {
      try {
        db.prepare(
          `UPDATE company_verifications SET status='running' WHERE recommendationId=?`
        ).run(recId);

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
      } catch (e) {
        db.prepare(
          `UPDATE company_verifications
              SET status='error',
                  errorMessage=?,
                  checkedAt=?
            WHERE recommendationId=?`
        ).run(String(e?.message || e), new Date().toISOString(), recId);
      }
    });
  };
}

module.exports = { _normName, _roughNameScore, makeQueueCompanyVerification };
