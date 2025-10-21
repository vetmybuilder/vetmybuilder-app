// server/routes/projects/close.photos.post.js
/**
 * POST /api/projects/:id/close/photos  (router path = "/projects/:id/close/photos")
 * Auth: owner only
 * Multipart field: "photos" (up to 20)
 * If not multipart, we just no-op with { ok:true, count:0 }.
 */
module.exports = (router, ctx) => {
  const { db, auth, upload } = ctx;

  const uploadMany = (req, res, next) => {
    try {
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      if (!ct.startsWith("multipart/form-data")) {
        // allow non-multipart calls (no files)
        req.files = [];
        return next();
      }
      upload.array("photos", 20)(req, res, (err) => {
        if (err)
          return res
            .status(400)
            .json({ error: err.message || "Upload failed" });
        next();
      });
    } catch (err) {
      return res
        .status(400)
        .json({ error: "Invalid upload", detail: String(err?.message || err) });
    }
  };

  // NOTE: router is mounted under /api, so do NOT prefix with /api here
  router.post("/projects/:id/close/photos", auth, uploadMany, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res.status(400).json({ error: "Invalid id" });

      const current = db
        .prepare("SELECT id, ownerUserId FROM projects WHERE id=?")
        .get(id);
      if (!current) return res.status(404).json({ error: "Not found" });
      if (current.ownerUserId !== req.user.uid)
        return res.status(403).json({ error: "Forbidden" });

      const files = Array.isArray(req.files) ? req.files.slice(0, 20) : [];
      if (files.length === 0) return res.json({ ok: true, count: 0 });

      const now = new Date().toISOString();
      const stmt = db.prepare(
        `INSERT INTO project_closure_photos (projectId, filePath, mime, sizeBytes, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      );
      const tx = db.transaction((rows) => {
        for (const f of rows) {
          stmt.run(
            id,
            f.filename || f.key || f.originalname || "",
            f.mimetype || null,
            f.size || null,
            now
          );
        }
      });
      tx(files);

      res.status(201).json({ ok: true, count: files.length });
    } catch (err) {
      console.error("close photos error:", err);
      res
        .status(500)
        .json({
          error: "Failed to store photos",
          detail: String(err?.message || err),
        });
    }
  });
};
