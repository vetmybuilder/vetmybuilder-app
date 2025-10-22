// server/v2/routes/projects/project.get.js
/**
 * GET /api/v2/projects/:id  (also /api/projects/:id if mounted there)
 * Auth: optional
 * - Anonymous: only live projects visible (401 if not live)
 * - Authenticated: owner or live (404 if not owner & not live)
 * Response: { project }
 */
module.exports = (router, ctx) => {
  const { db, admin, touchUserMw } = ctx;

  // optional auth middleware (mirrors your server/index.js helper)
  function optionalAuth(adminInstance) {
    return async (req, _res, next) => {
      try {
        const h = req.headers?.authorization || "";
        if (h.startsWith("Bearer ")) {
          const token = h.slice(7);
          const decoded = await adminInstance.auth().verifyIdToken(token);
          req.user = { uid: decoded.uid, email: decoded.email || null };
        }
      } catch {
        // ignore invalid/expired tokens
      }
      next();
    };
  }

  router.get("/projects/:id", optionalAuth(admin), touchUserMw, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!project) return res.status(404).json({ error: "Not found" });

    const status = String(project.status || "").toLowerCase();
    const isLive = status === "completed";
    const viewerUid = req.user?.uid ?? null;
    const isOwner =
      !!viewerUid && String(project.ownerUserId) === String(viewerUid);

    // Unauthenticated viewers: only live projects are visible
    if (!viewerUid) {
      if (!isLive)
        return res.status(401).json({ error: "Missing bearer token" });
      res.set("Cache-Control", "no-store");
      return res.json({ project });
    }

    // Authenticated viewers: only owner or live
    if (!isOwner && !isLive && !isCompleted) {
      // Use 404 to avoid leaking the project's existence
      return res.status(404).json({ error: "Not found" });
    }

    res.set("Cache-Control", "no-store");
    return res.json({ project });
  });
};
