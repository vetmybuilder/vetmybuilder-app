// server/routes/demand-signal.post.js
//
// POST /api/demand-signal
//
// Public, unauthenticated endpoint. Captures interest when a homeowner
// taps a "Coming soon" category tile in the new-project picker, OR
// optionally leaves an email/postcode to be notified when it launches.
//
// Body:
//   { category: string,
//     email?: string,
//     notify?: boolean }
//
// Behaviour:
//   - Every successful request inserts a row. Anonymous taps (no contact
//     info) are still recorded so admin can see total interest per
//     category, not just opted-in leads.
//   - Logged-in callers are auto-opted-in (notify_when_live=1) because
//     we already have their email on the user record - no need to ask
//     them for it again.
//   - Guest callers can pass `notify:true` + `email` to opt in. Without
//     a contact channel, the tap is recorded but `notify_when_live` stays
//     0 (anonymous interest signal, not a lead).
//   - Validates `category` against the canonical catalog so the table
//     doesn't fill with garbage values.

const {
  TYPE_TO_CATEGORY,
} = require("../lib/matching/projectTradeMap");
const { publicWriteLimiter } = require("../lib/rateLimiters");

function ensureTable(mysqlQuery) {
  return mysqlQuery(
    `CREATE TABLE IF NOT EXISTS category_demand_signals (
       id INT AUTO_INCREMENT PRIMARY KEY,
       category VARCHAR(100) NOT NULL,
       user_uid VARCHAR(128) NULL,
       email VARCHAR(255) NULL,
       postcode VARCHAR(20) NULL,
       notify_when_live TINYINT(1) NOT NULL DEFAULT 0,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       KEY idx_category_demand_signals_category (category),
       KEY idx_category_demand_signals_created_at (created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

// Cache the canonical category set on first use - it's static at runtime.
let CANONICAL_CATEGORIES = null;
function canonicalCategories() {
  if (CANONICAL_CATEGORIES) return CANONICAL_CATEGORIES;
  CANONICAL_CATEGORIES = new Set(Object.values(TYPE_TO_CATEGORY));
  return CANONICAL_CATEGORIES;
}

module.exports = function mountDemandSignalPost(router, ctx) {
  const { mysqlQuery, auth } = ctx;
  const log = ctx.log || console;
  const TAG = "[POST /api/demand-signal]";

  // No auth middleware - this endpoint is intentionally public so guests
  // tapping a "Coming soon" tile pre-signup can still be counted. When a
  // request DOES carry a valid Authorization header, the optional-auth
  // path below populates user_uid; otherwise we record anonymously.
  router.post("/demand-signal", publicWriteLimiter, async (req, res) => {
    const body = req.body || {};
    const category = String(body.category || "").trim();
    const email = body.email ? String(body.email).trim().slice(0, 255) : null;

    if (!category) {
      return res.status(400).json({ error: "missing_category" });
    }
    if (!canonicalCategories().has(category)) {
      return res.status(400).json({ error: "unknown_category" });
    }
    // Cheap email sanity check - we're collecting leads, not enforcing
    // RFC 5321.
    if (email && !email.includes("@")) {
      return res.status(400).json({ error: "invalid_email" });
    }

    // user_uid + email: try to read the firebase decoded token if the
    // caller is signed in, but never reject on auth failure (this
    // endpoint is public). The try/catch swallows any verifier error -
    // we just fall back to anonymous.
    let userUid = null;
    let userEmail = null;
    if (typeof auth === "function") {
      try {
        await new Promise((resolve) => {
          auth(req, res, () => resolve(undefined));
        });
        userUid = req.user?.uid || null;
        userEmail = req.user?.email || null;
      } catch {
        userUid = null;
        userEmail = null;
      }
    }

    // Denormalise the email onto the signal row so the lead list can be
    // exported with a single SELECT. For logged-in users that's the
    // address Firebase has on file (SSO or password); for guests it's
    // whatever they typed into the modal.
    const storedEmail = email || userEmail || null;

    // Auto-opt-in for logged-in users (we already have their email).
    // Guests need to pass notify=true AND provide an email.
    const notifyFlag = userUid
      ? 1
      : !!body.notify && email
        ? 1
        : 0;

    try {
      await ensureTable(mysqlQuery);
      await mysqlQuery(
        `INSERT INTO category_demand_signals
           (category, user_uid, email, notify_when_live)
         VALUES (?, ?, ?, ?)`,
        [category, userUid, storedEmail, notifyFlag],
      );
      log.info?.(
        { category, notifyFlag, hasEmail: !!storedEmail, hasUid: !!userUid },
        `${TAG} captured`,
      );
      return res.status(201).json({ ok: true });
    } catch (err) {
      log.error?.(
        { err: err?.message, category },
        `${TAG} insert failed`,
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
