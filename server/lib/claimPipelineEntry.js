// server/lib/claimPipelineEntry.js
const { normaliseCompanyName } = require("./matchRecommendationToTradesman");
const { logger } = require("./logger");

async function claimPipelineEntry({ mysqlQuery, uid, companyName, companyNumber }) {
  const log = logger.child({ module: "claimPipelineEntry", uid });
  try {
    if (!companyName) return;
    const normName = normaliseCompanyName(companyName);
    if (!normName) return;

    let match = null;

    // Try by company_number first (most reliable)
    if (companyNumber) {
      const byNumber = await mysqlQuery(
        "SELECT id, company_name FROM tradesperson_pipeline WHERE company_number = ? AND claimed_by IS NULL LIMIT 1",
        [companyNumber],
      );
      if (byNumber.length > 0) match = byNumber[0];
    }

    // Fall back to normalised name match
    if (!match) {
      const allUnclaimed = await mysqlQuery(
        "SELECT id, company_name FROM tradesperson_pipeline WHERE claimed_by IS NULL AND status = 'approved'",
      );
      match = allUnclaimed.find((row) => normaliseCompanyName(row.company_name) === normName);
    }

    if (!match) return;

    // Claim the pipeline entry
    await mysqlQuery("UPDATE tradesperson_pipeline SET claimed_by = ? WHERE id = ?", [uid, match.id]);

    // Link existing pipeline recommendations to the tradesman's profile
    const normMatchName = normaliseCompanyName(match.company_name);
    const pipelineRecs = await mysqlQuery(
      "SELECT id, company FROM recommendations WHERE source = 'pipeline' AND linked_tradesman_uid IS NULL",
    );
    for (const rec of pipelineRecs) {
      if (normaliseCompanyName(rec.company) === normMatchName) {
        await mysqlQuery("UPDATE recommendations SET linked_tradesman_uid = ? WHERE id = ?", [uid, rec.id]);
      }
    }

    log.info({ pipelineId: match.id, company: match.company_name }, "pipeline entry claimed");
  } catch (err) {
    log.warn({ err: err?.message }, "claimPipelineEntry failed");
  }
}

module.exports = { claimPipelineEntry };
