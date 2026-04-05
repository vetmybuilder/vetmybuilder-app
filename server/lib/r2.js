/**
 * server/lib/r2.js
 * Cloudflare R2 upload helper (S3-compatible).
 * Only used when R2_ENDPOINT is set in env — falls back to local disk otherwise.
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("node:path");
const crypto = require("node:crypto");

const isConfigured = !!(
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
);

let client;
if (isConfigured) {
  client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Upload a file buffer to R2.
 * @param {object} opts
 * @param {Buffer} opts.buffer       - File contents
 * @param {string} opts.mimetype     - e.g. "image/jpeg"
 * @param {string} opts.originalname - Original filename (used for extension)
 * @param {string} [opts.folder]     - Subfolder inside bucket, e.g. "tradesmen"
 * @returns {Promise<string>}        - Public URL of the uploaded file
 */
async function uploadToR2({ buffer, mimetype, originalname, folder = "" }) {
  if (!isConfigured) {
    throw new Error("R2 not configured");
  }

  const ext = path.extname(originalname || "").toLowerCase() || ".jpg";
  const base = Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("base64url");
  const filename = `${base}${ext}`;
  const key = folder ? `${folder}/${filename}` : filename;

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  return `${publicBase}/${key}`;
}

module.exports = { uploadToR2, isR2Configured: isConfigured };
