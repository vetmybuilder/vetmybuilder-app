/**
 * GET /api/track/go/:code
 * Logs an acquisition scan then 302s to the trade signup landing page
 * with ?ref=<code> set. This is the endpoint behind the printed QR code
 * on flyers and behind short links posted on Nextdoor / TikTok / etc.
 *
 * The page rewrite in next.config.js maps the public URL `/go/<code>`
 * onto this route so the QR can carry the friendlier path.
 *
 * The route is intentionally public (it has to be - QR scans land here
 * with no auth). We hash the IP before storing so we never persist raw
 * IPs, and truncate the UA so a hostile string can't bloat the table.
 */
const crypto = require("crypto");

const IP_HASH_SALT =
  process.env.ACQ_IP_HASH_SALT || "vmb-acq-static-salt-v1";

// Allow letters, digits, dash, dot, underscore. 1-64 chars. Anything
// else falls back to the org page without logging - we don't want to
// pollute the table with garbage refs from scrapers fuzzing the path.
const REF_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const REDIRECT_TARGET = "/tradesman/register-tradesmen";

function hashIp(ip) {
  if (!ip) return null;
  return crypto
    .createHash("sha256")
    .update(IP_HASH_SALT + ":" + String(ip))
    .digest("hex");
}

async function ensureTable(mysqlQuery) {
  try {
    await mysqlQuery(`
      CREATE TABLE IF NOT EXISTS acquisition_scans (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        ref VARCHAR(64) NOT NULL,
        scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_hash VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        INDEX idx_acquisition_scans_ref (ref, scanned_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch {
    // Table already exists or DB unavailable - the redirect still works.
  }
}

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;

  router.get("/track/go/:code", async (req, res) => {
    const raw = String(req.params?.code || "").trim();

    if (!REF_PATTERN.test(raw)) {
      return res.redirect(302, REDIRECT_TARGET);
    }

    if (mysqlQuery) {
      await ensureTable(mysqlQuery);
      try {
        const ip =
          (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
          req.ip ||
          req.connection?.remoteAddress ||
          null;
        const ua = String(req.headers["user-agent"] || "").slice(0, 255);
        await mysqlQuery(
          "INSERT INTO acquisition_scans (ref, ip_hash, user_agent) VALUES (?, ?, ?)",
          [raw, hashIp(ip), ua || null]
        );
      } catch {
        // Logging failure must not break the redirect.
      }
    }

    return res.redirect(302, `${REDIRECT_TARGET}?ref=${encodeURIComponent(raw)}`);
  });
};
