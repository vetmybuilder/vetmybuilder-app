// server/routes/projects/close.photos.post.js
/**
 * POST /api/projects/:id/close/photos
 * Auth: owner only
 * Multipart field: "photos" (max 20)
 *
 * If non-multipart request → treated as no-op with { ok: true, count: 0 }.
 */

module.exports = (router, ctx) => {
  const { auth, upload, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Structured logger
  const { logger, withRequest } = require("../../lib/logger");

  /**
   * Wrap mulitpart upload gracefully
   */
  const uploadMany = (req, res, next) => {
    try {
      const ct = String(req.headers["content-type"] || "").toLowerCase();

      // If not multipart → skip
      if (!ct.startsWith("multipart/form-data")) {
        req.files = [];
        return next();
      }

      upload.array("photos", 20)(req, res, (err) => {
        if (err) {
          if (
            err.code === "LIMIT_FILE_COUNT" ||
            err.message === "Too many files"
          ) {
            // Still allow through — we truncate to 20 later
            return next();
          }

          return res.status(400).json({
            error: "upload_failed",
            message: err.message || "Upload failed",
          });
        }
        next();
      });
    } catch (err) {
      return res.status(400).json({
        error: "invalid_upload",
        detail: String(err?.message || err),
      });
    }
  };

  // ----------------------------------------------------------------------
  // ROUTE
  // ----------------------------------------------------------------------

  router.post(
    "/projects/:id/close/photos",
    auth,
    uploadMany,
    async (req, res) => {
      const uid = req.user?.uid;
      const projectId = Number(req.params.id);

      const log = withRequest(req, logger).child({
        route: "/projects/:id/close/photos",
        action: "upload_closure_photos",
        uid,
        projectId,
      });

      try {
        // Validate ID
        if (!Number.isFinite(projectId)) {
          log.warn("Invalid projectId");
          return res.status(400).json({ error: "Invalid id" });
        }

        // --------------------------------------------------------------
        // 1) Load project + ownership (MySQL)
        // --------------------------------------------------------------
        let current;
        try {
          const rows = await mysqlQuery(
            "SELECT id, ownerUserId FROM projects WHERE id = ?",
            [projectId]
          );
          current = rows[0] || null;
        } catch (err) {
          log.error(
            { error: err?.message, stack: err?.stack },
            "MySQL error fetching project"
          );
          return res.status(500).json({ error: "internal_error" });
        }

        if (!current) {
          log.info("Project not found");
          return res.status(404).json({ error: "Not found" });
        }

        if (String(current.ownerUserId) !== String(uid)) {
          log.warn("Forbidden: user is not project owner");
          return res.status(403).json({ error: "Forbidden" });
        }

        // --------------------------------------------------------------
        // 2) Process photos
        // --------------------------------------------------------------
        const files = Array.isArray(req.files) ? req.files.slice(0, 20) : [];
        if (files.length === 0) {
          log.info("No files uploaded (non-multipart or empty)");
          return res.json({ ok: true, count: 0 });
        }

        const now = new Date().toISOString();

        // --------------------------------------------------------------
        // 3) Insert photo metadata into DB
        // --------------------------------------------------------------
        try {
          for (const f of files) {
            await mysqlQuery(
              `INSERT INTO project_closure_photos
                 (projectId, filePath, mime, sizeBytes, createdAt)
               VALUES (?, ?, ?, ?, ?)`,
              [
                projectId,
                f.filename || f.key || f.originalname || "",
                f.mimetype || null,
                f.size || null,
                now,
              ]
            );
          }
        } catch (err) {
          log.error(
            { error: err?.message, stack: err?.stack },
            "MySQL insert error (closure photos)"
          );
          return res.status(500).json({
            error: "store_failed",
            message: "Failed to store photos",
            detail: String(err?.message || err),
          });
        }

        log.info(
          { count: files.length },
          "Closure photos uploaded successfully"
        );

        return res.status(201).json({
          ok: true,
          count: files.length,
        });
      } catch (err) {
        log.error(
          { error: err?.message, stack: err?.stack },
          "Unexpected error in close.photos.post"
        );
        return res.status(500).json({
          error: "unexpected_failure",
          detail: err?.message || String(err),
        });
      }
    }
  );
};
