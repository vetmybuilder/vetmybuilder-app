// server/routes/tradesmen/upload-photos.post.js
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");
const { uploadToR2, isR2Configured } = require("../../lib/r2");
const {
  processBuffer,
  processFile,
} = require("../../lib/imageSanitiser");

module.exports = (router, ctx) => {
  const { auth, UPLOAD_DIR } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/upload-photos]";
  const ROUTE = "/tradesmen/upload-photos";

  /* ---------- Local disk storage (dev / fallback) ---------- */
  const tradesmenDir = path.join(UPLOAD_DIR, "tradesmen");

  if (!isR2Configured) {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      if (!fs.existsSync(tradesmenDir)) fs.mkdirSync(tradesmenDir, { recursive: true });
    } catch (e) {
      log.error(`${TAG} failed to ensure upload directories`, { error: e?.message });
    }
  }

  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tradesmenDir),
    filename: (req, file, cb) => {
      const uid = req.user?.uid || "anon";
      const ext = path.extname(file.originalname || ".jpg");
      const ts = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 8);
      cb(null, `${uid}_${ts}_${rnd}${ext}`);
    },
  });

  /* ---------- Memory storage (for R2 — we need the buffer) ---------- */
  const memoryStorage = multer.memoryStorage();

  const fileFilter = (_req, file, cb) => {
    // HEIC / HEIF accepted because Apple devices default to it -
    // server/lib/imageSanitiser.js transcodes them to JPEG on arrival.
    const ok = /^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.mimetype);
    if (!ok) log.warn(`${TAG} rejected file: invalid mime`, { mimetype: file.mimetype });
    cb(ok ? null : new Error("Only images are allowed"), ok);
  };

  const upload = multer({
    storage: isR2Configured ? memoryStorage : diskStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 12 },
    fileFilter,
  });

  log.info(`${TAG} config`, {
    storage: isR2Configured ? "r2" : "local",
    UPLOAD_DIR: isR2Configured ? "n/a" : UPLOAD_DIR,
  });

  /* ---------- Route ---------- */
  router.post(ROUTE, auth, upload.array("photos", 12), async (req, res) => {
    const uid = req.user?.uid || "unknown";

    try {
      const files = req.files || [];

      if (!files.length) {
        log.warn(`${TAG} no files uploaded`, { uid });
        return res.status(400).json({ ok: false, error: "no_files" });
      }

      let urls;

      if (isR2Configured) {
        // Normalise (transcode HEIC -> JPEG, strip EXIF / GPS) BEFORE
        // the image leaves our process. See lib/imageSanitiser.js.
        const processed = await Promise.all(
          files.map((f) =>
            processBuffer({
              buffer: f.buffer,
              mimetype: f.mimetype,
              originalname: f.originalname,
            }),
          ),
        );
        urls = await Promise.all(
          processed.map((p) =>
            uploadToR2({
              buffer: p.buffer,
              mimetype: p.mimetype,
              originalname: p.originalname,
              folder: "tradesmen",
            })
          )
        );
      } else {
        // Local disk: multer has written each file to disk; normalise
        // in place (HEIC is replaced by a .jpg file, EXIF stripped).
        // Use the returned filename because a HEIC upload now ends up
        // on disk as .jpg.
        const processed = await Promise.all(
          files.map((f) =>
            processFile({
              filePath: f.path,
              mimetype: f.mimetype,
              originalname: f.originalname,
              filename: f.filename,
            }),
          ),
        );
        urls = processed.map(
          (p) => `/uploads/tradesmen/${p.filename}`,
        );
      }

      log.info(`${TAG} upload success`, { uid, fileCount: files.length, storage: isR2Configured ? "r2" : "local" });
      res.json({ ok: true, urls });
      ctx.logActivity("tradesman.photos", "info", req.user.uid, "Photos uploaded");
      return;
    } catch (e) {
      log.error(`${TAG} upload failed`, { error: e?.message || e });
      return res.status(500).json({ ok: false, error: "upload_failed" });
    }
  });

  if (!ctx.__logged_tradesmen_upload_photos_post) {
    ctx.__logged_tradesmen_upload_photos_post = true;
    log.info(`[routes] mounted: POST ${ROUTE}`);
  }
};
