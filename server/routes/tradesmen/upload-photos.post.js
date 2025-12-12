// server/routes/tradesmen/upload-photos.post.js
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");

module.exports = (router, ctx) => {
  const { auth, UPLOAD_DIR } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/upload-photos]";
  const ROUTE = "/tradesmen/upload-photos";

  // Write under the SAME uploads root the server serves
  const tradesmenDir = path.join(UPLOAD_DIR, "tradesmen");

  /* ---------- Ensure directory structure ---------- */
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      log.info(`${TAG} created UPLOAD_DIR`, { UPLOAD_DIR });
    }

    if (!fs.existsSync(tradesmenDir)) {
      fs.mkdirSync(tradesmenDir, { recursive: true });
      log.info(`${TAG} created tradesmenDir`, { tradesmenDir });
    }
  } catch (e) {
    log.error(`${TAG} failed to ensure upload directories`, {
      error: e?.message || e,
    });
  }

  /* ---------- Multer storage ---------- */
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tradesmenDir),
    filename: (req, file, cb) => {
      const uid = (req.user && req.user.uid) || "anon";
      const ext = path.extname(file.originalname || ".jpg");
      const ts = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 8);
      const filename = `${uid}_${ts}_${rnd}${ext}`;

      log.info(`${TAG} generating filename`, { uid, filename });

      cb(null, filename);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 12 },
    fileFilter: (_req, file, cb) => {
      const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
      if (!ok) {
        log.warn(`${TAG} rejected file: invalid mime`, {
          mimetype: file.mimetype,
        });
      }
      cb(ok ? null : new Error("Only images are allowed"), ok);
    },
  });

  /* ---------- Log directory config ---------- */
  log.info(`${TAG} config`, {
    UPLOAD_DIR,
    tradesmenDir,
    exists: fs.existsSync(tradesmenDir),
  });

  /* ---------- Route ---------- */
  router.post(ROUTE, auth, upload.array("photos", 12), (req, res) => {
    const uid = req.user?.uid || "unknown";

    try {
      const files = req.files || [];

      if (!files.length) {
        log.warn(`${TAG} no files uploaded`, { uid });
        return res.status(400).json({ ok: false, error: "no_files" });
      }

      const urls = files.map((f) => `/uploads/tradesmen/${f.filename}`);

      log.info(`${TAG} upload success`, {
        uid,
        fileCount: files.length,
        urls,
      });

      return res.json({ ok: true, urls });
    } catch (e) {
      log.error(`${TAG} upload failed`, { error: e?.message || e });
      return res.status(500).json({ ok: false, error: "upload_failed" });
    }
  });

  /* ---------- Mounted logging ---------- */
  if (!ctx.__logged_tradesmen_upload_photos_post) {
    ctx.__logged_tradesmen_upload_photos_post = true;
    log.info(`[routes] mounted: POST ${ROUTE}`);
  }
};
