/**
 * server/lib/r2.js
 * Cloudflare R2 helper (S3-compatible).
 * Only used when R2_ENDPOINT is set in env — falls back to local disk otherwise.
 *
 * Two access patterns:
 *
 *   - Portfolio photos: public bucket, callers store the full public URL and
 *     embed it in <img src>. Used by `uploadToR2(...)`.
 *
 *   - Supporting docs: private bucket access, callers store the bare object
 *     key in MySQL and request a short-lived presigned URL via
 *     `getPresignedReadUrl(key)` whenever an admin or the owning trade
 *     wants to view the file. The R2 bucket itself should have Public
 *     Access disabled at the Cloudflare side.
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
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
 *
 * Returns BOTH the public URL (for the still-public photos bucket) AND
 * the object key (for the private docs flow where callers store the key
 * and use presigned reads). Callers can pick whichever fits their access
 * model; old callers that ignore the key get the same string URL they
 * always did via the legacy default-export path.
 *
 * @param {object} opts
 * @param {Buffer} opts.buffer       - File contents
 * @param {string} opts.mimetype     - e.g. "image/jpeg"
 * @param {string} opts.originalname - Original filename (used for extension)
 * @param {string} [opts.folder]     - Subfolder inside bucket, e.g. "tradesmen"
 * @returns {Promise<{ key: string, publicUrl: string }>}
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
  const publicUrl = `${publicBase}/${key}`;
  return { key, publicUrl };
}

/**
 * Generate a short-lived signed GET URL for a private R2 object.
 *
 * The browser fetches the object directly from R2; the server doesn't
 * proxy bytes. Default TTL is 5 minutes - long enough for the admin
 * UI to open the PDF in a new tab, short enough that a leaked URL
 * expires before it's useful.
 *
 * @param {string} key                - R2 object key (no leading slash)
 * @param {number} [expiresInSec=300] - Signed URL lifetime in seconds
 * @returns {Promise<string>}
 */
async function getPresignedReadUrl(key, expiresInSec = 300) {
  if (!isConfigured) {
    throw new Error("R2 not configured");
  }
  if (!key) throw new Error("missing key");

  const cmd = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(client, cmd, { expiresIn: expiresInSec });
}

/**
 * Translate a legacy public R2 URL back into the bare object key, so we
 * can migrate existing `supporting_docs_json` rows to the new key-only
 * shape without re-uploading anything. Returns null if the URL doesn't
 * look like one of ours.
 */
function publicUrlToKey(url) {
  if (!url) return null;
  const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!publicBase) return null;
  const prefix = publicBase + "/";
  if (typeof url !== "string" || !url.startsWith(prefix)) return null;
  return url.slice(prefix.length) || null;
}

module.exports = {
  uploadToR2,
  getPresignedReadUrl,
  publicUrlToKey,
  isR2Configured: isConfigured,
};
