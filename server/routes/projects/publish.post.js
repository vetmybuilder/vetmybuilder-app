// server/v2/routes/projects/publish.post.js
/**
 * POST /api/v2/projects/:id/publish
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
  const { db, auth, extractLocationTokens, notifyUsers } = ctx;

  router.post("/projects/:id/publish", auth, (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
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
      return res.json({ project: existing }); // idempotent
    }

    // Publish
    db.prepare(`UPDATE projects SET status='live' WHERE id=?`).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    res.json({ project: updated });

    // ---- Target local users using users table location fields ----
    try {
      const locTokens = extractLocationTokens(updated.location);
      const whereParts = [];
      const areaParams = {};

      if (locTokens.full) {
        whereParts.push("u.postcode = @full");
        areaParams.full = locTokens.full;
      }
      if (locTokens.sector) {
        whereParts.push("u.postcodeSector = @sector");
        areaParams.sector = locTokens.sector;
      }
      if (locTokens.outward) {
        whereParts.push("u.postcodeOutward = @outward");
        areaParams.outward = locTokens.outward;
      }
      if (locTokens.city) {
        whereParts.push("u.city = @city");
        areaParams.city = String(locTokens.city).toLowerCase();
      }
      if (!whereParts.length) return;

      const areaWhere = whereParts.join(" OR ");

      const areaUsers = db
        .prepare(
          `SELECT u.uid AS uid
             FROM users u
            WHERE (${areaWhere}) AND u.uid != @owner`
        )
        .all({ ...areaParams, owner: updated.ownerUserId })
        .map((r) => r.uid);

      const recUsers = db
        .prepare(
          `SELECT DISTINCT r.recommenderUserId AS uid
             FROM recommendations r
             JOIN users u ON u.uid = r.recommenderUserId
            WHERE r.projectId = @pid
              AND r.recommenderUserId IS NOT NULL
              AND (${areaWhere})
              AND r.recommenderUserId != @owner`
        )
        .all({ ...areaParams, pid: id, owner: updated.ownerUserId })
        .map((r) => r.uid);

      const targets = Array.from(new Set([...areaUsers, ...recUsers]));
      if (targets.length && typeof notifyUsers === "function") {
        notifyUsers(db, targets, {
          type: "project_live_local",
          message: `A new project “${updated.name}” in your area is now live`,
          projectId: id,
          linkPath: `/projects/${id}`,
        });
      }
    } catch (e) {
      console.warn("[v2 publish] notify/targeting failed", e);
    }
  });
};
