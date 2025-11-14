// server/routes/tradesmen/upload-photos.post.js
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");

module.exports = (router, ctx) => {
  const { auth, UPLOAD_DIR } = ctx; // ✅ use shared upload root
  const TAG = "[tradesmen/upload-photos]";

  // Write under the SAME uploads root the server serves
  const tradesmenDir = path.join(UPLOAD_DIR, "tradesmen");

  // Ensure target dir exists
  try {
    if (!fs.existsSync(UPLOAD_DIR))
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    if (!fs.existsSync(tradesmenDir))
      fs.mkdirSync(tradesmenDir, { recursive: true });
  } catch (e) {
    console.error(`${TAG} failed to ensure upload dirs`, e);
  }

  // Multer storage that writes into <project>/uploads/tradesmen
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tradesmenDir),
    filename: (req, file, cb) => {
      const uid = (req.user && req.user.uid) || "anon";
      const ext = path.extname(file.originalname || ".jpg");
      const ts = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 8);
      cb(null, `${uid}_${ts}_${rnd}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 12 },
    fileFilter: (_req, file, cb) => {
      const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
      cb(ok ? null : new Error("Only images are allowed"), ok);
    },
  });

  // Log where we’re saving
  console.log(`${TAG} UPLOAD_DIR=`, UPLOAD_DIR);
  console.log(
    `${TAG} tradesmenDir=`,
    tradesmenDir,
    "exists:",
    fs.existsSync(tradesmenDir)
  );

  router.post(
    "/tradesmen/upload-photos",
    auth,
    upload.array("photos", 12),
    (req, res) => {
      try {
        const files = req.files || [];
        if (!files.length) {
          return res.status(400).json({ ok: false, error: "no_files" });
        }

        // URLs that match Express static /uploads
        const urls = files.map((f) => `/uploads/tradesmen/${f.filename}`);

        console.log(
          `${TAG} uid=${req.user?.uid} saved ${files.length} files ->`,
          urls
        );

        return res.json({ ok: true, urls });
      } catch (e) {
        console.error(`${TAG} error`, e);
        return res.status(500).json({ ok: false, error: "upload_failed" });
      }
    }
  );

  if (!ctx.__logged_tradesmen_upload_photos_post) {
    ctx.__logged_tradesmen_upload_photos_post = true;
    console.log("[routes] mounted: POST /api/tradesmen/upload-photos");
  }
};
