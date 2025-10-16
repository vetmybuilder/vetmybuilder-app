// server/v2/lib/companyVerification.js
function queueCompanyVerification(
  db,
  matchByName,
  { recId, name, locationHint }
) {
  if (!recId || !name) return;
  db.prepare(
    `INSERT INTO company_verifications (recommendationId, status, checkedAt)
              VALUES (?, 'queued', ?) ON CONFLICT(recommendationId) DO NOTHING`
  ).run(recId, new Date().toISOString());

  setImmediate(async () => {
    try {
      db.prepare(
        `UPDATE company_verifications SET status='running' WHERE recommendationId=?`
      ).run(recId);
      const result = await matchByName({ name, locationHint });
      const payload = {
        status: result.verdict,
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
                  SET status=@status, companyNumber=@companyNumber, companyName=@companyName, score=@score,
                      sicCodes=@sicCodes, raw=@raw, errorMessage=@errorMessage, checkedAt=@checkedAt
                  WHERE recommendationId=@recommendationId`
      ).run(payload);
    } catch (e) {
      db.prepare(
        `UPDATE company_verifications SET status='error', errorMessage=?, checkedAt=? WHERE recommendationId=?`
      ).run(String(e?.message || e), new Date().toISOString(), recId);
    }
  });
}
module.exports = { queueCompanyVerification };
