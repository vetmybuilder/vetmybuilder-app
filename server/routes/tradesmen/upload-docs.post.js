// server/routes/tradesmen/upload-docs.post.js
//
// POST /api/tradesmen/upload-docs
// Auth: required
// Body: multipart/form-data with one or more files in field `docs`.
// Returns: { ok: true, files: [{ key, fileName }, ...] }
//
// Sister of upload-photos. Accepts PDFs in addition to images so trades
// can upload insurance certs, trade certifications and membership proof.
// Stored under tradesmen-docs/ to keep them separate from portfolio
// photos.
//
// Unlike photo uploads, the response no longer hands back a directly-
// reachable public URL. Callers must store the bare `key` in
// `supporting_docs_json` and request a short-lived presigned URL via
// the dedicated download endpoint (GET /api/tradesmen/:uid/docs/:idx
// for admin, GET /api/tradesmen/me/docs/:idx for the owner). That keeps
// insurance + cert documents out of the public R2 bucket.
//
// We do NOT image-sanitise these (PDFs aren't images, and an image cert
// uploaded as proof should keep its metadata - the cropping/EXIF strip
// applied to portfolio photos is for privacy of public-facing images).

const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");
const { uploadToR2, isR2Configured } = require("../../lib/r2");

module.exports = (router, ctx) => {
  const { auth, UPLOAD_DIR } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/upload-docs]";
  const ROUTE = "/tradesmen/upload-docs";

  const docsDir = path.join(UPLOAD_DIR, "tradesmen-docs");

  if (!isR2Configured) {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
    } catch (e) {
      log.error(`${TAG} failed to ensure upload directory`, { error: e?.message });
    }
  }

  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (req, file, cb) => {
      const uid = req.user?.uid || "anon";
      const ext = path.extname(file.originalname || ".bin");
      const ts = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 8);
      cb(null, `${uid}_${ts}_${rnd}${ext}`);
    },
  });

  const memoryStorage = multer.memoryStorage();

  const fileFilter = (_req, file, cb) => {
    // Allow common image formats + PDF. Most insurance + cert docs are
    // either scanned PDFs or photos taken on a phone.
    const ok = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/i.test(
      file.mimetype,
    );
    if (!ok) {
      log.warn(`${TAG} rejected file: invalid mime`, {
        mimetype: file.mimetype,
      });
    }
    cb(ok ? null : new Error("Only images and PDFs are allowed"), ok);
  };

  const upload = multer({
    storage: isR2Configured ? memoryStorage : diskStorage,
    // 20MB per file - PDFs can be larger than photos. Cap at 6 files per
    // request to stop someone from spamming with bulk uploads.
    limits: { fileSize: 20 * 1024 * 1024, files: 6 },
    fileFilter,
  });

  log.info(`${TAG} config`, {
    storage: isR2Configured ? "r2" : "local",
    docsDir: isR2Configured ? "n/a" : docsDir,
  });

  router.post(ROUTE, auth, upload.array("docs", 6), async (req, res) => {
    const uid = req.user?.uid || "unknown";

    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ ok: false, error: "no_files" });
      }

      let entries;
      if (isR2Configured) {
        entries = await Promise.all(
          files.map(async (f) => {
            const { key } = await uploadToR2({
              buffer: f.buffer,
              mimetype: f.mimetype,
              originalname: f.originalname,
              folder: "tradesmen-docs",
            });
            return { key, fileName: f.originalname || null };
          }),
        );
      } else {
        // Local-disk fallback for dev when R2 isn't configured. The
        // local path doubles as the "key" so the download endpoint can
        // route through the same code path; the file is served via the
        // existing /uploads static mount when needed.
        entries = files.map((f) => ({
          key: `tradesmen-docs/${f.filename}`,
          fileName: f.originalname || null,
        }));
      }

      log.info(`${TAG} upload success`, {
        uid,
        fileCount: files.length,
        storage: isR2Configured ? "r2" : "local",
      });
      // Also return `urls: []` (always empty) so any old client checking
      // for `.urls` doesn't 500 - they'll just see no entries and move
      // on to read the new `files` shape.
      res.json({ ok: true, files: entries, urls: [] });
      ctx.logActivity?.("tradesman.docs", "info", uid, "Supporting docs uploaded");
      return;
    } catch (e) {
      log.error(`${TAG} upload failed`, { error: e?.message || e });
      return res.status(500).json({ ok: false, error: "upload_failed" });
    }
  });

  if (!ctx.__logged_tradesmen_upload_docs_post) {
    ctx.__logged_tradesmen_upload_docs_post = true;
    log.info(`[routes] mounted: POST ${ROUTE}`);
  }
};
