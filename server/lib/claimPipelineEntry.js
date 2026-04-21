// server/lib/claimPipelineEntry.js
const { normaliseCompanyName } = require("./matchRecommendationToTradesman");
const { logger } = require("./logger");

async function claimPipelineEntry({ mysqlQuery, uid, companyName, companyNumber, broadcastNotification }) {
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

    // Move pipeline recommendations to community_match (top recommendations)
    // and link them to the tradesman's profile. Also notify homeowners.
    const normMatchName = normaliseCompanyName(match.company_name);
    const pipelineRecs = await mysqlQuery(
      "SELECT id, company, projectId FROM recommendations WHERE source = 'pipeline' AND linked_tradesman_uid IS NULL",
    );

    const notifiedProjects = new Set();

    for (const rec of pipelineRecs) {
      if (normaliseCompanyName(rec.company) !== normMatchName) continue;

      // Update source from 'pipeline' to 'community_match' and link tradesman
      await mysqlQuery(
        "UPDATE recommendations SET source = 'community_match', linked_tradesman_uid = ? WHERE id = ?",
        [uid, rec.id],
      );

      // Notify the homeowner (once per project)
      if (rec.projectId && !notifiedProjects.has(rec.projectId)) {
        notifiedProjects.add(rec.projectId);
        try {
          const projectRows = await mysqlQuery(
            "SELECT ownerUserId FROM projects WHERE id = ?",
            [rec.projectId],
          );
          const ownerUid = projectRows[0]?.ownerUserId;
          if (ownerUid) {
            const message = `"${companyName}" has claimed their profile on VetMyBuilder and is now in your recommendations`;
            const linkPath = `/projects/${rec.projectId}`;
            await mysqlQuery(
              `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
               VALUES (?, 'recommendation_new', ?, ?, ?, NOW())`,
              [ownerUid, message, rec.projectId, linkPath],
            );
            broadcastNotification?.(ownerUid, {
              type: "recommendation_new",
              message,
              projectId: rec.projectId,
              linkPath,
            });
          }
        } catch (notifErr) {
          log.warn({ err: notifErr?.message, projectId: rec.projectId }, "claim notification failed (non-fatal)");
        }
      }
    }

    log.info({ pipelineId: match.id, company: match.company_name, recsUpdated: notifiedProjects.size }, "pipeline entry claimed, recs moved to community_match");
  } catch (err) {
    log.warn({ err: err?.message }, "claimPipelineEntry failed");
  }
}

module.exports = { claimPipelineEntry };
