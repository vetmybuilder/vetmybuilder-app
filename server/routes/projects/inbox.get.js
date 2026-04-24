// server/routes/projects/inbox.get.js
//
// GET /api/projects/:id/inbox
// Homeowner-only. Returns paid-unlock intro messages for this project.

module.exports = function mountInboxGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/api/projects/:id/inbox", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const pid = Number(req.params.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const proj = await mysqlQuery(
      `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
      [pid],
    );
    if (!proj?.[0]) return res.status(404).json({ error: "Project not found" });
    if (String(proj[0].ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Not your project" });
    }

    const rows = await mysqlQuery(
      `SELECT im.id, im.builder_uid, im.intro_message,
              im.homeowner_replied_at, im.created_at,
              t.company_name
         FROM inbox_messages im
         LEFT JOIN tradesmen t ON t.user_id = im.builder_uid
        WHERE im.project_id = ?
          AND im.homeowner_uid = ?
        ORDER BY im.created_at DESC`,
      [pid, uid],
    );

    const items = (rows || []).map((r) => ({
      id: r.id,
      builderUid: r.builder_uid,
      builderName: r.company_name || "Builder",
      introMessage: r.intro_message || "",
      replied: !!r.homeowner_replied_at,
      createdAt: r.created_at,
    }));

    return res.status(200).json({ items });
  });
};
