// server/routes/projects/close.photos.post.js
/**
 * POST /api/projects/:id/close/photos  (router path = "/projects/:id/close/photos")
 * Auth: owner only
 * Multipart field: "photos" (up to 20)
 * If not multipart, we just no-op with { ok:true, count:0 }.
 */
module.exports = (router, ctx) => {
  const { auth, upload, mysqlQuery } = ctx;

  const uploadMany = (req, res, next) => {
    try {
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      if (!ct.startsWith("multipart/form-data")) {
        // allow non-multipart calls (no files)
        req.files = [];
        return next();
      }

      upload.array("photos", 20)(req, res, (err) => {
        if (err) {
          if (
            err.code === "LIMIT_FILE_COUNT" ||
            err.message === "Too many files"
          ) {
            return next();
          }

          return res
            .status(400)
            .json({ error: err.message || "Upload failed" });
        }
        next();
      });
    } catch (err) {
      return res.status(400).json({
        error: "Invalid upload",
        detail: String(err?.message || err),
      });
    }
  };

  // NOTE: router is mounted under /api, so do NOT prefix with /api here
  router.post(
    "/projects/:id/close/photos",
    auth,
    uploadMany,
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          return res.status(400).json({ error: "Invalid id" });
        }

        // Check project + ownership in MySQL
        let currentRows;
        try {
          currentRows = await mysqlQuery(
            "SELECT id, ownerUserId FROM projects WHERE id = ?",
            [id]
          );
        } catch (err) {
          console.error(
            "MySQL fetch error in close.photos.post (project):",
            err
          );
          return res.status(500).json({ error: "internal_error" });
        }

        const current = currentRows[0] || null;
        if (!current) return res.status(404).json({ error: "Not found" });
        if (current.ownerUserId !== req.user.uid) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const files = Array.isArray(req.files) ? req.files.slice(0, 20) : [];
        if (files.length === 0) {
          return res.json({ ok: true, count: 0 });
        }

        const now = new Date().toISOString(); // TEXT column in mysql_schema

        // Insert each photo row into MySQL
        try {
          for (const f of files) {
            await mysqlQuery(
              `INSERT INTO project_closure_photos
                 (projectId, filePath, mime, sizeBytes, createdAt)
               VALUES (?, ?, ?, ?, ?)`,
              [
                id,
                f.filename || f.key || f.originalname || "",
                f.mimetype || null,
                f.size || null,
                now,
              ]
            );
          }
        } catch (err) {
          console.error(
            "MySQL insert error in close.photos.post (photos):",
            err
          );
          return res.status(500).json({
            error: "Failed to store photos",
            detail: String(err?.message || err),
          });
        }

        return res.status(201).json({ ok: true, count: files.length });
      } catch (err) {
        console.error("close photos error:", err);
        return res.status(500).json({
          error: "Failed to store photos",
          detail: String(err?.message || err),
        });
      }
    }
  );
};
