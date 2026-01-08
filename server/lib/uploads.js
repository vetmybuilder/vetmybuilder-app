// server/lib/uploads.js
const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const multer = require("multer");

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base =
      Date.now().toString(36) +
      "-" +
      crypto.randomBytes(6).toString("base64url");
    cb(null, `${base}${ext || ""}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only images are allowed"), ok);
  },
});

module.exports = { upload, UPLOAD_DIR };
