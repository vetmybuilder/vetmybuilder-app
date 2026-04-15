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
  const { uploadToR2, isR2Configured } = require("../../lib/r2");
  const {
    processBuffer,
    processFile,
  } = require("../../lib/imageSanitiser");
  const multer = require("multer");
  const r2Upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 20 } });

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

      const handler = isR2Configured ? r2Upload.array("photos", 20) : upload.array("photos", 20);
      handler(req, res, (err) => {
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
          res.json({ ok: true, count: 0 });
          ctx.logActivity("project.close.photos", "info", req.user?.uid, `Photos uploaded for project #${projectId}`);
          return;
        }

        const now = new Date().toISOString();

        // --------------------------------------------------------------
        // 3) Insert photo metadata into DB
        // --------------------------------------------------------------
        try {
          for (const f of files) {
            let filePath;
            let storedMime = f.mimetype || null;
            let storedSize = f.size ?? f.buffer?.length ?? null;

            if (isR2Configured) {
              try {
                // Normalise (transcode HEIC -> JPEG, strip EXIF / GPS)
                // before the image leaves our process.
                const p = await processBuffer({
                  buffer: f.buffer,
                  mimetype: f.mimetype,
                  originalname: f.originalname,
                });
                filePath = await uploadToR2({
                  buffer: p.buffer,
                  mimetype: p.mimetype,
                  originalname: p.originalname,
                  folder: "closures",
                });
                storedMime = p.mimetype;
                storedSize = p.buffer?.length ?? storedSize;
              } catch (e) {
                log.error({ error: e?.message }, "R2 upload failed for closure photo");
                continue;
              }
            } else {
              filePath = f.filename || f.key || f.originalname || "";
              if (f.path) {
                try {
                  const p = await processFile({
                    filePath: f.path,
                    mimetype: f.mimetype,
                    originalname: f.originalname,
                    filename: f.filename,
                  });
                  // If HEIC was transcoded, filename / mimetype change.
                  filePath = p.filename || filePath;
                  storedMime = p.mimetype;
                } catch (e) {
                  log.warn(
                    { error: e?.message, filePath },
                    "processFile failed for closure photo",
                  );
                }
              }
            }
            await mysqlQuery(
              `INSERT INTO project_closure_photos
                 (projectId, filePath, mime, sizeBytes, createdAt)
               VALUES (?, ?, ?, ?, ?)`,
              [projectId, filePath, storedMime, storedSize, now]
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

        res.status(201).json({
          ok: true,
          count: files.length,
        });
        ctx.logActivity("project.close.photos", "info", req.user?.uid, `Photos uploaded for project #${projectId}`);
        return;
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
