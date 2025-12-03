// server/routes/projects/publish.post.js
/**
 * POST /api/projects/:id/publish
 * Auth: required (owner only)
 *
 * Behavior:
 * - 400 if id invalid
 * - 404 if project not found
 * - 403 if not owner
 * - 400 if archived (must unarchive first)
 * - idempotent if already live
 * - sets status='live', returns { project }
 * - notifies local users (by postcode / city) + prior recommenders in area
 */
module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens, notifyUsers, mysqlQuery } = ctx;

  router.post("/projects/:id/publish", auth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    let existing;
    try {
      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
      existing = rows[0] || null;
    } catch (err) {
      console.error("Error fetching project in publish (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }

    if (!existing) return res.status(404).json({ error: "Not found" });
    if (String(existing.ownerUserId) !== String(req.user.uid)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const status = String(existing.status || "").toLowerCase();
    if (status === "archived") {
      return res
        .status(400)
        .json({ error: "Project is archived. Unarchive before publishing." });
    }
    if (status === "live") {
      // idempotent
      return res.json({ project: existing });
    }

    // Publish in MySQL
    let updated = existing;
    try {
      await mysqlQuery(`UPDATE projects SET status = 'live' WHERE id = ?`, [
        id,
      ]);

      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
      updated = rows[0] || existing;
    } catch (err) {
      console.error("Error updating project status to live (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }

    // Respond immediately so the UI updates
    res.json({ project: updated });

    // ---- Background: target local users + prior recommenders ----
    try {
      const locTokens = extractLocationTokens(updated.location);
      console.log("[publish] locTokens:", locTokens, "for project", id);

      const whereParts = [];
      const areaParams = [];

      if (locTokens.full) {
        whereParts.push("u.postcode = ?");
        areaParams.push(locTokens.full);
      }
      if (locTokens.sector) {
        whereParts.push("u.postcodeSector = ?");
        areaParams.push(locTokens.sector);
      }
      if (locTokens.outward) {
        whereParts.push("u.postcodeOutward = ?");
        areaParams.push(locTokens.outward);
      }
      if (locTokens.city) {
        // match on lowercase city
        whereParts.push("LOWER(u.city) = ?");
        areaParams.push(String(locTokens.city).toLowerCase());
      }

      if (!whereParts.length) {
        console.warn(
          "[publish] no location tokens extracted; skipping local notifications for project",
          id
        );
        return;
      }

      const areaWhere = whereParts.join(" OR ");

      // Local users by location
      let areaUsers = [];
      try {
        const areaUserRows = await mysqlQuery(
          `SELECT u.uid AS uid
             FROM users u
            WHERE (${areaWhere})
              AND u.uid <> ?`,
          [...areaParams, updated.ownerUserId]
        );
        areaUsers = areaUserRows
          .map((r) => (r && r.uid ? String(r.uid) : null))
          .filter(Boolean);
        console.log(
          "[publish] areaUsers for project",
          id,
          "->",
          areaUsers.length
        );
      } catch (err) {
        console.warn(
          "[publish] error loading areaUsers for project",
          id,
          err?.message || err
        );
      }

      // Prior recommenders for this project in same area
      let recUsers = [];
      try {
        const recUserRows = await mysqlQuery(
          `SELECT DISTINCT r.recommenderUserId AS uid
             FROM recommendations r
             JOIN users u ON u.uid = r.recommenderUserId
            WHERE r.projectId = ?
              AND r.recommenderUserId IS NOT NULL
              AND (${areaWhere})
              AND r.recommenderUserId <> ?`,
          [id, ...areaParams, updated.ownerUserId]
        );
        recUsers = recUserRows
          .map((r) => (r && r.uid ? String(r.uid) : null))
          .filter(Boolean);
        console.log(
          "[publish] recUsers for project",
          id,
          "->",
          recUsers.length
        );
      } catch (err) {
        console.warn(
          "[publish] error loading recUsers for project",
          id,
          err?.message || err
        );
      }

      const targets = Array.from(new Set([...areaUsers, ...recUsers]));
      console.log(
        "[publish] total notification targets for project",
        id,
        "->",
        targets.length,
        targets
      );

      if (!targets.length) {
        // This is the key line: if you hit this in logs, it means user rows
        // in MySQL don't have matching postcode / sector / outward / city.
        return;
      }

      const message = `A new project “${updated.name}” in your area is now live`;
      const linkPath = `/projects/${id}`;

      // MySQL-friendly datetime (if column is DATETIME)
      const createdAt = new Date();
      // mysql2 will convert JS Date to proper DATETIME/TIMESTAMP

      // Write notifications into MySQL so /api/notifications can see them
      let inserted = 0;
      try {
        for (const uid of targets) {
          await mysqlQuery(
            `INSERT INTO notifications
               (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              uid,
              "project_live_local",
              message,
              id,
              linkPath,
              createdAt,
            ]
          );
          inserted += 1;
        }
        console.log(
          "[publish] inserted",
          inserted,
          "notifications into MySQL for project",
          id
        );
      } catch (err) {
        console.warn(
          "[publish] failed to insert notifications into MySQL:",
          err?.message || err
        );
      }

      // Legacy: still call notifyUsers(db, …) for SSE/email side-effects
      if (typeof notifyUsers === "function" && db && targets.length) {
        try {
          notifyUsers(db, targets, {
            type: "project_live_local",
            message,
            projectId: id,
            linkPath,
          });
        } catch (err) {
          console.warn(
            "[publish] notifyUsers (SQLite/legacy) failed:",
            err?.message || err
          );
        }
      }
    } catch (e) {
      console.warn("[publish] notify/targeting failed", e);
    }
  });
};

// // server/routes/projects/publish.post.js
// /**
//  * POST /api/projects/:id/publish
//  * Auth: required (owner only)
//  *
//  * Behavior:
//  * - 400 if id invalid
//  * - 404 if project not found
//  * - 403 if not owner
//  * - 400 if archived (must unarchive first)
//  * - idempotent if already live
//  * - sets status='live', returns { project }
//  * - notifies local users (by postcode / city) + prior recommenders in area
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, extractLocationTokens, notifyUsers, mysqlQuery } = ctx;

//   router.post("/projects/:id/publish", auth, async (req, res) => {
//     const id = Number(req.params.id);
//     if (Number.isNaN(id)) {
//       return res.status(400).json({ error: "Invalid id" });
//     }

//     let existing;
//     try {
//       const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
//         id,
//       ]);
//       existing = rows[0] || null;
//     } catch (err) {
//       console.error("Error fetching project in publish (MySQL):", err);
//       return res.status(500).json({ error: "internal_error" });
//     }

//     if (!existing) return res.status(404).json({ error: "Not found" });
//     if (String(existing.ownerUserId) !== String(req.user.uid)) {
//       return res.status(403).json({ error: "Forbidden" });
//     }

//     const status = String(existing.status || "").toLowerCase();
//     if (status === "archived") {
//       return res
//         .status(400)
//         .json({ error: "Project is archived. Unarchive before publishing." });
//     }
//     if (status === "live") {
//       // idempotent
//       return res.json({ project: existing });
//     }

//     // Publish in MySQL
//     let updated = existing;
//     try {
//       await mysqlQuery(`UPDATE projects SET status = 'live' WHERE id = ?`, [
//         id,
//       ]);

//       const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
//         id,
//       ]);
//       updated = rows[0] || existing;
//     } catch (err) {
//       console.error("Error updating project status to live (MySQL):", err);
//       return res.status(500).json({ error: "internal_error" });
//     }

//     // Respond immediately
//     res.json({ project: updated });

//     // ---- Background: target local users + prior recommenders ----
//     try {
//       const locTokens = extractLocationTokens(updated.location);
//       const whereParts = [];
//       const areaParams = [];

//       if (locTokens.full) {
//         whereParts.push("u.postcode = ?");
//         areaParams.push(locTokens.full);
//       }
//       if (locTokens.sector) {
//         whereParts.push("u.postcodeSector = ?");
//         areaParams.push(locTokens.sector);
//       }
//       if (locTokens.outward) {
//         whereParts.push("u.postcodeOutward = ?");
//         areaParams.push(locTokens.outward);
//       }
//       if (locTokens.city) {
//         // match on lowercase city
//         whereParts.push("LOWER(u.city) = ?");
//         areaParams.push(String(locTokens.city).toLowerCase());
//       }

//       if (!whereParts.length) return; // nothing to target

//       const areaWhere = whereParts.join(" OR ");

//       // Local users by location
//       const areaUserRows = await mysqlQuery(
//         `SELECT u.uid AS uid
//            FROM users u
//           WHERE (${areaWhere})
//             AND u.uid <> ?`,
//         [...areaParams, updated.ownerUserId]
//       );
//       const areaUsers = areaUserRows.map((r) => r.uid).filter(Boolean);

//       // Prior recommenders for this project in same area
//       const recUserRows = await mysqlQuery(
//         `SELECT DISTINCT r.recommenderUserId AS uid
//            FROM recommendations r
//            JOIN users u ON u.uid = r.recommenderUserId
//           WHERE r.projectId = ?
//             AND r.recommenderUserId IS NOT NULL
//             AND (${areaWhere})
//             AND r.recommenderUserId <> ?`,
//         [id, ...areaParams, updated.ownerUserId]
//       );
//       const recUsers = recUserRows.map((r) => r.uid).filter(Boolean);

//       const targets = Array.from(new Set([...areaUsers, ...recUsers]));
//       if (targets.length && typeof notifyUsers === "function") {
//         // NOTE: notifyUsers currently still uses SQLite db; later we'll migrate it to MySQL too.
//         notifyUsers(db, targets, {
//           type: "project_live_local",
//           message: `A new project “${updated.name}” in your area is now live`,
//           projectId: id,
//           linkPath: `/projects/${id}`,
//         });
//       }
//     } catch (e) {
//       console.warn("[publish] notify/targeting failed", e);
//     }
//   });
// };

// // server/routes/projects/publish.post.js
// /**
//  * POST /api/projects/:id/publish
//  * Auth: required (owner only)
//  *
//  * Behavior:
//  * - 400 if id invalid
//  * - 404 if project not found
//  * - 403 if not owner
//  * - 400 if archived (must unarchive first)
//  * - idempotent if already live
//  * - sets status='live', returns { project }
//  * - notifies local users (by postcode / city) + prior recommenders in area
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, extractLocationTokens, notifyUsers } = ctx;

//   router.post("/projects/:id/publish", auth, (req, res) => {
//     const id = Number(req.params.id);
//     if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

//     const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
//     if (!existing) return res.status(404).json({ error: "Not found" });
//     if (String(existing.ownerUserId) !== String(req.user.uid)) {
//       return res.status(403).json({ error: "Forbidden" });
//     }

//     const status = String(existing.status || "").toLowerCase();
//     if (status === "archived") {
//       return res
//         .status(400)
//         .json({ error: "Project is archived. Unarchive before publishing." });
//     }
//     if (status === "live") {
//       return res.json({ project: existing }); // idempotent
//     }

//     // Publish
//     db.prepare(`UPDATE projects SET status='live' WHERE id=?`).run(id);
//     const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
//     res.json({ project: updated });

//     // ---- Target local users using users table location fields ----
//     try {
//       const locTokens = extractLocationTokens(updated.location);
//       const whereParts = [];
//       const areaParams = {};

//       if (locTokens.full) {
//         whereParts.push("u.postcode = @full");
//         areaParams.full = locTokens.full;
//       }
//       if (locTokens.sector) {
//         whereParts.push("u.postcodeSector = @sector");
//         areaParams.sector = locTokens.sector;
//       }
//       if (locTokens.outward) {
//         whereParts.push("u.postcodeOutward = @outward");
//         areaParams.outward = locTokens.outward;
//       }
//       if (locTokens.city) {
//         whereParts.push("u.city = @city");
//         areaParams.city = String(locTokens.city).toLowerCase();
//       }
//       if (!whereParts.length) return;

//       const areaWhere = whereParts.join(" OR ");

//       const areaUsers = db
//         .prepare(
//           `SELECT u.uid AS uid
//              FROM users u
//             WHERE (${areaWhere}) AND u.uid != @owner`
//         )
//         .all({ ...areaParams, owner: updated.ownerUserId })
//         .map((r) => r.uid);

//       const recUsers = db
//         .prepare(
//           `SELECT DISTINCT r.recommenderUserId AS uid
//              FROM recommendations r
//              JOIN users u ON u.uid = r.recommenderUserId
//             WHERE r.projectId = @pid
//               AND r.recommenderUserId IS NOT NULL
//               AND (${areaWhere})
//               AND r.recommenderUserId != @owner`
//         )
//         .all({ ...areaParams, pid: id, owner: updated.ownerUserId })
//         .map((r) => r.uid);

//       const targets = Array.from(new Set([...areaUsers, ...recUsers]));
//       if (targets.length && typeof notifyUsers === "function") {
//         notifyUsers(db, targets, {
//           type: "project_live_local",
//           message: `A new project “${updated.name}” in your area is now live`,
//           projectId: id,
//           linkPath: `/projects/${id}`,
//         });
//       }
//     } catch (e) {
//       console.warn("[publish] notify/targeting failed", e);
//     }
//   });
// };
