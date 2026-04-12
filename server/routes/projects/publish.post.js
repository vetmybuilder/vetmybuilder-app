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
  const { db, auth, extractLocationTokens, notifyUsers, mysqlQuery, broadcastNotification } = ctx;
  const log = ctx.log || console;
  const { notifyMatchedTradesmen } = require("../../lib/ai/notifyMatchedTradesmen");

  router.post("/projects/:id/publish", auth, async (req, res) => {
    const id = Number(req.params.id);
    log.info?.("[projects.publish] start", { id });

    if (Number.isNaN(id)) {
      log.warn?.("[projects.publish] invalid id");
      return res.status(400).json({ error: "Invalid id" });
    }

    let existing;
    try {
      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
      existing = rows[0] || null;
    } catch (err) {
      log.error?.("[projects.publish] fetch error", err);
      return res.status(500).json({ error: "internal_error" });
    }

    if (!existing) {
      log.warn?.("[projects.publish] project not found", { id });
      return res.status(404).json({ error: "Not found" });
    }

    if (String(existing.ownerUserId) !== String(req.user.uid)) {
      log.warn?.("[projects.publish] forbidden (not owner)", {
        id,
        owner: existing.ownerUserId,
        viewer: req.user.uid,
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    const status = String(existing.status || "").toLowerCase();

    if (status === "archived") {
      log.warn?.("[projects.publish] archived project", { id });
      return res
        .status(400)
        .json({ error: "Project is archived. Unarchive before publishing." });
    }

    if (status === "live") {
      // idempotent
      log.info?.("[projects.publish] already live", { id });
      return res.json({ project: existing });
    }

    // ----- PUBLISH -----
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
      log.error?.("[projects.publish] update-to-live error", err);
      return res.status(500).json({ error: "internal_error" });
    }

    // Respond to client immediately
    res.json({ project: updated });

    // ---- BACKGROUND NOTIFICATIONS ----
    // Notify matched tradesmen first — this doesn't depend on location
    // token extraction so it must run even if the homeowner-area
    // notification block exits early below.
    notifyMatchedTradesmen({
      mysqlQuery,
      projectId: id,
      sseBroadcast: broadcastNotification,
      projectName: updated.name,
      projectType: updated.type,
      projectLocation: updated.location,
      projectCreatedAt: updated.createdAt,
      log,
    }).catch((err) => {
      log.warn?.("[projects.publish] notifyMatchedTradesmen error", err);
    });

    try {
      const locTokens = extractLocationTokens(updated.location);
      log.info?.("[projects.publish] locTokens", { id, locTokens });

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
        whereParts.push("LOWER(u.city) = ?");
        areaParams.push(String(locTokens.city).toLowerCase());
      }

      if (!whereParts.length) {
        log.warn?.(
          "[projects.publish] no location tokens extracted; skipping notifications",
          { id }
        );
        return;
      }

      const areaWhere = whereParts.join(" OR ");

      // ---- Local users ----
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

        log.info?.("[projects.publish] areaUsers", {
          id,
          count: areaUsers.length,
        });
      } catch (err) {
        log.warn?.("[projects.publish] areaUsers load error", err);
      }

      // ---- Prior recommenders in area ----
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

        log.info?.("[projects.publish] recUsers", {
          id,
          count: recUsers.length,
        });
      } catch (err) {
        log.warn?.("[projects.publish] recUsers load error", err);
      }

      const targets = Array.from(new Set([...areaUsers, ...recUsers]));
      log.info?.("[projects.publish] notification targets", {
        id,
        count: targets.length,
      });

      if (!targets.length) return;

      // ---- Build notification ----
      const message = `A new project “${updated.name}” in your area is now live`;
      const linkPath = `/projects/${id}`;
      const createdAt = new Date();

      // ---- Insert notifications into MySQL ----
      let inserted = 0;
      try {
        for (const uid of targets) {
          await mysqlQuery(
            `INSERT INTO notifications
               (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uid, "project_live_local", message, id, linkPath, createdAt]
          );
          broadcastNotification?.(uid, { type: "project_live_local", message, projectId: id, linkPath });
          inserted++;
        }
        log.info?.("[projects.publish] notifications inserted", {
          id,
          count: inserted,
        });
      } catch (err) {
        log.warn?.("[projects.publish] MySQL notification insert error", err);
      }

      // ---- Legacy notifyUsers (SSE/email) ----
      if (typeof notifyUsers === "function" && db && targets.length) {
        try {
          notifyUsers(db, targets, {
            type: "project_live_local",
            message,
            projectId: id,
            linkPath,
          });
        } catch (err) {
          log.warn?.("[projects.publish] notifyUsers legacy error", err);
        }
      }

      log.info?.("[projects.publish] done", { id });
    } catch (err) {
      log.error?.("[projects.publish] background notify error", err);
    }
  });
};
