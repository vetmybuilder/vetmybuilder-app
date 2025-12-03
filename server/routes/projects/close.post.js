// server/routes/projects/close.post.js
/**
 * POST /api/projects/:id/close   (router path here is "/projects/:id/close")
 * Auth: owner only
 * Body:
 *  {
 *    didGoAhead: boolean,
 *    reasons?: string[],
 *    otherReason?: string,
 *    selectedRecommendationId?: number,
 *    winnerTradesmanUid?: string,          // NEW: shared-profile winner
 *    winnerFromCommunity?: boolean | 0 | 1 | "0" | "1" | "true" | "false",
 *    wouldUseAgain?: boolean | 0 | 1 | "0" | "1" | "true" | "false" | null
 *  }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  // NOTE: router is mounted under /api, so do NOT prefix with /api here
  router.post("/projects/:id/close", auth, async (req, res) => {
    try {
      const uid = req.user.uid;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "Invalid id" });
      }

      // Fetch project (for owner + status check)
      let currentRows;
      try {
        currentRows = await mysqlQuery(
          "SELECT id, ownerUserId, status FROM projects WHERE id = ?",
          [id]
        );
      } catch (err) {
        console.error("MySQL fetch error in close.post (project):", err);
        return res.status(500).json({ error: "internal_error" });
      }

      const current = currentRows[0] || null;
      if (!current) return res.status(404).json({ error: "Not found" });
      if (current.ownerUserId !== uid) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const {
        didGoAhead,
        reasons,
        otherReason,
        selectedRecommendationId,
        winnerTradesmanUid: winnerTradesmanUidRaw, // NEW
        winnerFromCommunity,
        wouldUseAgain,
      } = req.body || {};

      const did = !!didGoAhead;

      // Normalize reasons
      const allowed = new Set([
        "budget",
        "no_show",
        "quote_too_high",
        "other",
        "tradesman_unavailable",
      ]);
      const reasonsJson = JSON.stringify(
        Array.isArray(reasons)
          ? reasons.filter((r) => allowed.has(String(r)))
          : []
      );

      const now = new Date().toISOString();

      // Winner from recommendations
      const candidateWinnerId = Number(selectedRecommendationId);
      const winnerId =
        Number.isFinite(candidateWinnerId) && candidateWinnerId > 0
          ? candidateWinnerId
          : null;

      // Winner from shared profile (only if there is NO recommendation winner)
      const winnerTradesmanUid =
        !winnerId && winnerTradesmanUidRaw
          ? String(winnerTradesmanUidRaw).trim() || null
          : null;

      // Keep winnerFromCommunity for analytics if you need it later
      const winnerFromCommunityNum =
        winnerFromCommunity === 1 ||
        winnerFromCommunity === "1" ||
        winnerFromCommunity === true ||
        winnerFromCommunity === "true"
          ? 1
          : 0;

      // Normalize wouldUseAgain -> null|0|1
      let wouldUseAgainNorm = null;
      if (
        wouldUseAgain === 0 ||
        wouldUseAgain === "0" ||
        wouldUseAgain === false ||
        wouldUseAgain === "false"
      ) {
        wouldUseAgainNorm = 0;
      } else if (
        wouldUseAgain === 1 ||
        wouldUseAgain === "1" ||
        wouldUseAgain === true ||
        wouldUseAgain === "true"
      ) {
        wouldUseAgainNorm = 1;
      } else {
        wouldUseAgainNorm = null; // absent/unknown
      }

      // ---- Status transitions (treat rec + shared winners the SAME) ----
      const hasWinner = !!winnerId || !!winnerTradesmanUid;

      try {
        if (!did) {
          // Work did NOT go ahead -> archived
          await mysqlQuery(
            `UPDATE projects
               SET status = 'archived',
                   archivedAt = ?,
                   completedAt = completedAt
             WHERE id = ?`,
            [now, id]
          );
        } else if (hasWinner) {
          // Work went ahead AND we have a winner (rec OR shared) -> completed
          await mysqlQuery(
            `UPDATE projects
               SET status = 'completed',
                   completedAt = COALESCE(completedAt, ?),
                   archivedAt = archivedAt
             WHERE id = ?`,
            [now, id]
          );
        } else {
          // Work went ahead but no winner selected (e.g. hired outside VMB) -> archived
          await mysqlQuery(
            `UPDATE projects
               SET status = 'archived',
                   archivedAt = ?,
                   completedAt = completedAt
             WHERE id = ?`,
            [now, id]
          );
        }
      } catch (err) {
        console.error("MySQL update error in close.post (projects):", err);
        return res.status(500).json({ error: "internal_error" });
      }

      // ---- Manual upsert into project_closures (now includes winner_tradesman_uid) ----
      try {
        const existsRows = await mysqlQuery(
          "SELECT projectId FROM project_closures WHERE projectId = ? LIMIT 1",
          [id]
        );
        const exists = existsRows.length > 0;

        if (exists) {
          await mysqlQuery(
            `UPDATE project_closures
                SET didGoAhead = ?,
                    reasons = ?,
                    otherReason = ?,
                    winnerRecommendationId = ?,
                    winner_tradesman_uid = ?,  -- shared-profile winner
                    wouldUseAgain = ?,
                    createdBy = ?,
                    createdAt = ?
              WHERE projectId = ?`,
            [
              did ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerId || null,
              winnerTradesmanUid || null,
              wouldUseAgainNorm,
              uid,
              now,
              id,
            ]
          );
        } else {
          await mysqlQuery(
            `INSERT INTO project_closures
                (projectId,
                 didGoAhead,
                 reasons,
                 otherReason,
                 winnerRecommendationId,
                 winner_tradesman_uid,
                 wouldUseAgain,
                 createdBy,
                 createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              did ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerId || null,
              winnerTradesmanUid || null,
              wouldUseAgainNorm,
              uid,
              now,
            ]
          );
        }
      } catch (err) {
        console.error(
          "MySQL upsert error in close.post (project_closures):",
          err
        );
        return res.status(500).json({ error: "internal_error" });
      }

      // Final safety: if row is completed but completedAt is NULL, backfill it now
      let project;
      try {
        const projRows = await mysqlQuery(
          "SELECT * FROM projects WHERE id = ?",
          [id]
        );
        project = projRows[0] || null;

        if (project && project.status === "completed" && !project.completedAt) {
          await mysqlQuery("UPDATE projects SET completedAt = ? WHERE id = ?", [
            now,
            id,
          ]);
          const projRows2 = await mysqlQuery(
            "SELECT * FROM projects WHERE id = ?",
            [id]
          );
          project = projRows2[0] || null;
        }
      } catch (err) {
        console.error(
          "MySQL fetch/backfill error in close.post (projects):",
          err
        );
        return res.status(500).json({ error: "internal_error" });
      }

      return res.json({ ok: true, project });
    } catch (err) {
      console.error("close project error:", err);
      return res.status(500).json({
        error: "Internal error closing project",
        detail: String(err?.message || err),
      });
    }
  });
};

// // server/routes/projects/close.post.js
// /**
//  * POST /api/projects/:id/close   (router path here is "/projects/:id/close")
//  * Auth: owner only
//  * Body:
//  *  {
//  *    didGoAhead: boolean,
//  *    reasons?: string[],
//  *    otherReason?: string,
//  *    selectedRecommendationId?: number,
//  *    winnerTradesmanUid?: string,          // NEW: winner from shared profile
//  *    winnerFromCommunity?: boolean | 0 | 1 | "0" | "1" | "true" | "false",
//  *    wouldUseAgain?: boolean | 0 | 1 | "0" | "1" | "true" | "false" | null
//  *  }
//  *
//  * Rules:
//  *  - didGoAhead === true:
//  *      • winnerFromCommunity truthy -> status='completed', completedAt=now
//  *      • otherwise                  -> status='archived',  archivedAt=now
//  *  - didGoAhead === false            -> status='archived',  archivedAt=now
//  *
//  * Also upserts project_closures (manual upsert) including wouldUseAgain
//  * AND winner_tradesman_uid.
//  */
// module.exports = (router, ctx) => {
//   const { auth, mysqlQuery } = ctx;

//   // NOTE: router is mounted under /api, so do NOT prefix with /api here
//   router.post("/projects/:id/close", auth, async (req, res) => {
//     try {
//       const uid = req.user.uid;
//       const id = Number(req.params.id);
//       if (!Number.isFinite(id)) {
//         return res.status(400).json({ error: "Invalid id" });
//       }

//       // Fetch project (for owner + status check)
//       let currentRows;
//       try {
//         currentRows = await mysqlQuery(
//           "SELECT id, ownerUserId, status FROM projects WHERE id = ?",
//           [id]
//         );
//       } catch (err) {
//         console.error("MySQL fetch error in close.post (project):", err);
//         return res.status(500).json({ error: "internal_error" });
//       }

//       const current = currentRows[0] || null;
//       if (!current) return res.status(404).json({ error: "Not found" });
//       if (current.ownerUserId !== uid) {
//         return res.status(403).json({ error: "Forbidden" });
//       }

//       const {
//         didGoAhead,
//         reasons,
//         otherReason,
//         selectedRecommendationId,
//         winnerTradesmanUid: winnerTradesmanUidRaw, // NEW
//         winnerFromCommunity,
//         wouldUseAgain,
//       } = req.body || {};

//       const did = !!didGoAhead;

//       // Normalize reasons
//       const allowed = new Set([
//         "budget",
//         "no_show",
//         "quote_too_high",
//         "other",
//         "tradesman_unavailable",
//       ]);
//       const reasonsJson = JSON.stringify(
//         Array.isArray(reasons)
//           ? reasons.filter((r) => allowed.has(String(r)))
//           : []
//       );

//       const now = new Date().toISOString();

//       // Winner info (provided by client; avoids schema coupling)
//       const candidateWinnerId = Number(selectedRecommendationId);
//       const winnerId =
//         Number.isFinite(candidateWinnerId) && candidateWinnerId > 0
//           ? candidateWinnerId
//           : null;

//       // Only use winnerTradesmanUid when there is NO winner recommendation
//       const winnerTradesmanUid =
//         !winnerId && winnerTradesmanUidRaw
//           ? String(winnerTradesmanUidRaw).trim() || null
//           : null;

//       const winnerFromCommunityNum =
//         winnerFromCommunity === 1 ||
//         winnerFromCommunity === "1" ||
//         winnerFromCommunity === true ||
//         winnerFromCommunity === "true"
//           ? 1
//           : 0;

//       // Normalize wouldUseAgain -> null|0|1
//       let wouldUseAgainNorm = null;
//       if (
//         wouldUseAgain === 0 ||
//         wouldUseAgain === "0" ||
//         wouldUseAgain === false ||
//         wouldUseAgain === "false"
//       ) {
//         wouldUseAgainNorm = 0;
//       } else if (
//         wouldUseAgain === 1 ||
//         wouldUseAgain === "1" ||
//         wouldUseAgain === true ||
//         wouldUseAgain === "true"
//       ) {
//         wouldUseAgainNorm = 1;
//       } else {
//         wouldUseAgainNorm = null; // absent/unknown
//       }

//       // ---- Status transitions (guarantee completedAt when completed) ----
//       try {
//         if (!did) {
//           await mysqlQuery(
//             `UPDATE projects
//                SET status = 'archived',
//                    archivedAt = ?,
//                    completedAt = completedAt
//              WHERE id = ?`,
//             [now, id]
//           );
//         } else if (winnerFromCommunityNum === 1) {
//           await mysqlQuery(
//             `UPDATE projects
//                SET status = 'completed',
//                    completedAt = COALESCE(completedAt, ?),
//                    archivedAt = archivedAt
//              WHERE id = ?`,
//             [now, id]
//           );
//         } else {
//           await mysqlQuery(
//             `UPDATE projects
//                SET status = 'archived',
//                    archivedAt = ?,
//                    completedAt = completedAt
//              WHERE id = ?`,
//             [now, id]
//           );
//         }
//       } catch (err) {
//         console.error("MySQL update error in close.post (projects):", err);
//         return res.status(500).json({ error: "internal_error" });
//       }

//       // Manual upsert into project_closures (now includes winner_tradesman_uid)
//       try {
//         const existsRows = await mysqlQuery(
//           "SELECT projectId FROM project_closures WHERE projectId = ? LIMIT 1",
//           [id]
//         );
//         const exists = existsRows.length > 0;

//         if (exists) {
//           await mysqlQuery(
//             `UPDATE project_closures
//                 SET didGoAhead = ?,
//                     reasons = ?,
//                     otherReason = ?,
//                     winnerRecommendationId = ?,
//                     winner_tradesman_uid = ?,  -- NEW
//                     wouldUseAgain = ?,
//                     createdBy = ?,
//                     createdAt = ?
//               WHERE projectId = ?`,
//             [
//               did ? 1 : 0,
//               reasonsJson,
//               otherReason || null,
//               winnerId || null,
//               winnerTradesmanUid, // NEW
//               wouldUseAgainNorm,
//               uid,
//               now,
//               id,
//             ]
//           );
//         } else {
//           await mysqlQuery(
//             `INSERT INTO project_closures
//                 (projectId,
//                  didGoAhead,
//                  reasons,
//                  otherReason,
//                  winnerRecommendationId,
//                  winner_tradesman_uid,
//                  wouldUseAgain,
//                  createdBy,
//                  createdAt)
//               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//             [
//               id,
//               did ? 1 : 0,
//               reasonsJson,
//               otherReason || null,
//               winnerId || null,
//               winnerTradesmanUid, // NEW
//               wouldUseAgainNorm,
//               uid,
//               now,
//             ]
//           );
//         }
//       } catch (err) {
//         console.error(
//           "MySQL upsert error in close.post (project_closures):",
//           err
//         );
//         return res.status(500).json({ error: "internal_error" });
//       }

//       // Final safety: if row is completed but completedAt is NULL, backfill it now
//       let project;
//       try {
//         const projRows = await mysqlQuery(
//           "SELECT * FROM projects WHERE id = ?",
//           [id]
//         );
//         project = projRows[0] || null;

//         if (project && project.status === "completed" && !project.completedAt) {
//           await mysqlQuery("UPDATE projects SET completedAt = ? WHERE id = ?", [
//             now,
//             id,
//           ]);
//           const projRows2 = await mysqlQuery(
//             "SELECT * FROM projects WHERE id = ?",
//             [id]
//           );
//           project = projRows2[0] || null;
//         }
//       } catch (err) {
//         console.error(
//           "MySQL fetch/backfill error in close.post (projects):",
//           err
//         );
//         return res.status(500).json({ error: "internal_error" });
//       }

//       return res.json({ ok: true, project });
//     } catch (err) {
//       console.error("close project error:", err);
//       return res.status(500).json({
//         error: "Internal error closing project",
//         detail: String(err?.message || err),
//       });
//     }
//   });
// };

// // server/routes/projects/close.post.js
// /**
//  * POST /api/projects/:id/close   (router path here is "/projects/:id/close")
//  * Auth: owner only
//  * Body:
//  *  {
//  *    didGoAhead: boolean,
//  *    reasons?: string[],
//  *    otherReason?: string,
//  *    selectedRecommendationId?: number,
//  *    winnerFromCommunity?: boolean | 0 | 1 | "0" | "1" | "true" | "false",
//  *    wouldUseAgain?: boolean | 0 | 1 | "0" | "1" | "true" | "false" | null
//  *  }
//  *
//  * Rules:
//  *  - didGoAhead === true:
//  *      • winnerFromCommunity truthy -> status='completed', completedAt=now
//  *      • otherwise                  -> status='archived',  archivedAt=now
//  *  - didGoAhead === false            -> status='archived',  archivedAt=now
//  *
//  * Also upserts project_closures (manual upsert) including wouldUseAgain.
//  */
// module.exports = (router, ctx) => {
//   const { auth, mysqlQuery } = ctx;

//   // NOTE: router is mounted under /api, so do NOT prefix with /api here
//   router.post("/projects/:id/close", auth, async (req, res) => {
//     try {
//       const uid = req.user.uid;
//       const id = Number(req.params.id);
//       if (!Number.isFinite(id)) {
//         return res.status(400).json({ error: "Invalid id" });
//       }

//       // Fetch project (for owner + status check)
//       let currentRows;
//       try {
//         currentRows = await mysqlQuery(
//           "SELECT id, ownerUserId, status FROM projects WHERE id = ?",
//           [id]
//         );
//       } catch (err) {
//         console.error("MySQL fetch error in close.post (project):", err);
//         return res.status(500).json({ error: "internal_error" });
//       }

//       const current = currentRows[0] || null;
//       if (!current) return res.status(404).json({ error: "Not found" });
//       if (current.ownerUserId !== uid) {
//         return res.status(403).json({ error: "Forbidden" });
//       }

//       const {
//         didGoAhead,
//         reasons,
//         otherReason,
//         selectedRecommendationId,
//         winnerFromCommunity,
//         wouldUseAgain,
//       } = req.body || {};

//       const did = !!didGoAhead;

//       // Normalize reasons
//       const allowed = new Set([
//         "budget",
//         "no_show",
//         "quote_too_high",
//         "other",
//         "tradesman_unavailable",
//       ]);
//       const reasonsJson = JSON.stringify(
//         Array.isArray(reasons)
//           ? reasons.filter((r) => allowed.has(String(r)))
//           : []
//       );

//       const now = new Date().toISOString();

//       // Winner info (provided by client; avoids schema coupling)
//       const candidateWinnerId = Number(selectedRecommendationId);
//       const winnerId =
//         Number.isFinite(candidateWinnerId) && candidateWinnerId > 0
//           ? candidateWinnerId
//           : null;

//       const winnerFromCommunityNum =
//         winnerFromCommunity === 1 ||
//         winnerFromCommunity === "1" ||
//         winnerFromCommunity === true ||
//         winnerFromCommunity === "true"
//           ? 1
//           : 0;

//       // Normalize wouldUseAgain -> null|0|1
//       let wouldUseAgainNorm = null;
//       if (
//         wouldUseAgain === 0 ||
//         wouldUseAgain === "0" ||
//         wouldUseAgain === false ||
//         wouldUseAgain === "false"
//       ) {
//         wouldUseAgainNorm = 0;
//       } else if (
//         wouldUseAgain === 1 ||
//         wouldUseAgain === "1" ||
//         wouldUseAgain === true ||
//         wouldUseAgain === "true"
//       ) {
//         wouldUseAgainNorm = 1;
//       } else {
//         wouldUseAgainNorm = null; // absent/unknown
//       }

//       // ---- Status transitions (guarantee completedAt when completed) ----
//       try {
//         if (!did) {
//           await mysqlQuery(
//             `UPDATE projects
//                SET status = 'archived',
//                    archivedAt = ?,
//                    completedAt = completedAt
//              WHERE id = ?`,
//             [now, id]
//           );
//         } else if (winnerFromCommunityNum === 1) {
//           await mysqlQuery(
//             `UPDATE projects
//                SET status = 'completed',
//                    completedAt = COALESCE(completedAt, ?),
//                    archivedAt = archivedAt
//              WHERE id = ?`,
//             [now, id]
//           );
//         } else {
//           await mysqlQuery(
//             `UPDATE projects
//                SET status = 'archived',
//                    archivedAt = ?,
//                    completedAt = completedAt
//              WHERE id = ?`,
//             [now, id]
//           );
//         }
//       } catch (err) {
//         console.error("MySQL update error in close.post (projects):", err);
//         return res.status(500).json({ error: "internal_error" });
//       }

//       // Manual upsert into project_closures (now includes wouldUseAgain)
//       try {
//         const existsRows = await mysqlQuery(
//           "SELECT projectId FROM project_closures WHERE projectId = ? LIMIT 1",
//           [id]
//         );
//         const exists = existsRows.length > 0;

//         if (exists) {
//           await mysqlQuery(
//             `UPDATE project_closures
//                 SET didGoAhead = ?,
//                     reasons = ?,
//                     otherReason = ?,
//                     winnerRecommendationId = ?,
//                     wouldUseAgain = ?,
//                     createdBy = ?,
//                     createdAt = ?
//               WHERE projectId = ?`,
//             [
//               did ? 1 : 0,
//               reasonsJson,
//               otherReason || null,
//               winnerId || null,
//               wouldUseAgainNorm,
//               uid,
//               now,
//               id,
//             ]
//           );
//         } else {
//           await mysqlQuery(
//             `INSERT INTO project_closures
//                 (projectId,
//                  didGoAhead,
//                  reasons,
//                  otherReason,
//                  winnerRecommendationId,
//                  wouldUseAgain,
//                  createdBy,
//                  createdAt)
//               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//             [
//               id,
//               did ? 1 : 0,
//               reasonsJson,
//               otherReason || null,
//               winnerId || null,
//               wouldUseAgainNorm,
//               uid,
//               now,
//             ]
//           );
//         }
//       } catch (err) {
//         console.error(
//           "MySQL upsert error in close.post (project_closures):",
//           err
//         );
//         return res.status(500).json({ error: "internal_error" });
//       }

//       // Final safety: if row is completed but completedAt is NULL, backfill it now
//       let project;
//       try {
//         const projRows = await mysqlQuery(
//           "SELECT * FROM projects WHERE id = ?",
//           [id]
//         );
//         project = projRows[0] || null;

//         if (project && project.status === "completed" && !project.completedAt) {
//           await mysqlQuery("UPDATE projects SET completedAt = ? WHERE id = ?", [
//             now,
//             id,
//           ]);
//           const projRows2 = await mysqlQuery(
//             "SELECT * FROM projects WHERE id = ?",
//             [id]
//           );
//           project = projRows2[0] || null;
//         }
//       } catch (err) {
//         console.error(
//           "MySQL fetch/backfill error in close.post (projects):",
//           err
//         );
//         return res.status(500).json({ error: "internal_error" });
//       }

//       return res.json({ ok: true, project });
//     } catch (err) {
//       console.error("close project error:", err);
//       return res.status(500).json({
//         error: "Internal error closing project",
//         detail: String(err?.message || err),
//       });
//     }
//   });
// };
