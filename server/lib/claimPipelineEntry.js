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

    const notifiedProjects = new Set();

    if (match) {
      // Claim the pipeline entry
      await mysqlQuery("UPDATE tradesperson_pipeline SET claimed_by = ? WHERE id = ?", [uid, match.id]);

      // Move pipeline recommendations to community_match (top recommendations)
      // and link them to the tradesman's profile. Also notify homeowners.
      const normMatchName = normaliseCompanyName(match.company_name);
      const pipelineRecs = await mysqlQuery(
        "SELECT id, company, projectId FROM recommendations WHERE source = 'pipeline' AND linked_tradesman_uid IS NULL",
      );

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
    }

    // ALSO: link unclaimed recommendations whose company name matches this
    // tradesman, even when no pipeline row exists for them. This handles
    // off-platform recs (typed by a friend with company name + email) that
    // never went through admin pipeline curation. Any matched rec gets
    // linked + the homeowner gets the same "X has claimed their profile"
    // notification.
    try {
      const normNewName = normaliseCompanyName(companyName);
      if (normNewName) {
        const allUnlinked = await mysqlQuery(
          `SELECT id, company, projectId FROM recommendations
            WHERE linked_tradesman_uid IS NULL`,
        );
        const linkedNotifiedProjects = new Set(notifiedProjects);

        for (const rec of allUnlinked) {
          if (normaliseCompanyName(rec.company) !== normNewName) continue;

          // Check whether this rec came via the friend-recs flow (has an invite row)
          const inviteCheck = await mysqlQuery(
            `SELECT id FROM recommendation_invites WHERE recommendationId = ? LIMIT 1`,
            [rec.id],
          );
          const isFriendRecOrigin = inviteCheck.length > 0;

          await mysqlQuery(
            "UPDATE recommendations SET linked_tradesman_uid = ? WHERE id = ? AND linked_tradesman_uid IS NULL",
            [uid, rec.id],
          );

          if (rec.projectId && !linkedNotifiedProjects.has(rec.projectId)) {
            linkedNotifiedProjects.add(rec.projectId);
            try {
              const projectRows = await mysqlQuery(
                "SELECT ownerUserId FROM projects WHERE id = ?",
                [rec.projectId],
              );
              const ownerUid = projectRows[0]?.ownerUserId;
              if (ownerUid) {
                const message = isFriendRecOrigin
                  ? `"${companyName}" joined VetMyBuilder — view their profile to message them`
                  : `"${companyName}" has claimed their profile on VetMyBuilder and is now in your recommendations`;
                const linkPath = isFriendRecOrigin
                  ? `/projects/${rec.projectId}/friend-recs`
                  : `/projects/${rec.projectId}`;
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
              log.warn(
                { err: notifErr?.message, projectId: rec.projectId },
                "off-platform claim notification failed (non-fatal)",
              );
            }
          }
        }
      }
    } catch (linkErr) {
      log.warn({ err: linkErr?.message }, "off-platform rec linking failed (non-fatal)");
    }
  } catch (err) {
    log.warn({ err: err?.message }, "claimPipelineEntry failed");
  }
}

module.exports = { claimPipelineEntry };
