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
const analytics = require("../../lib/analytics");
const { firePublishNotifications } = require("../../lib/publishNotifications");

module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens, notifyUsers, mysqlQuery, broadcastNotification } = ctx;
  const log = ctx.log || console;
  const { notifyMatchedTradesmen } = require("../../lib/ai/notifyMatchedTradesmen");
  const { surfacePipelineTradespeople } = require("../../lib/surfacePipelineTradespeople");

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
    analytics.trackProjectPublished(req.user?.uid, { projectId: id, type: updated.type, location: updated.location });
    ctx.logActivity("project.publish", "info", req.user.uid, "Project #" + id + " published");

    // ---- BACKGROUND NOTIFICATIONS (fire-and-forget) ----
    firePublishNotifications({
      mysqlQuery,
      project: updated,
      uid: req.user.uid,
      extractLocationTokens,
      broadcastNotification,
      logActivity: ctx.logActivity,
      log,
      notifyMatchedTradesmen,
      surfacePipelineTradespeople,
      db,
      notifyUsers,
    }).catch((err) => {
      log.error?.("[projects.publish] firePublishNotifications error", err);
    });
  });
};
