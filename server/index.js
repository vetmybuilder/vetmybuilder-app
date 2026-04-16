/* Express API for vetmybuilder v1 */
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

// ---------------------- LOGGER ----------------------
const { logger, withRequest } = require("./lib/logger");

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { query: mysqlQuery } = require("./lib/mysql");
const { authMiddleware } = require("./lib/middleware");

// Shared libs used by routes
const { clientsByUser, sseSend } = require("./lib/sse");
const { upload, UPLOAD_DIR } = require("./lib/uploads");
const { extractLocationTokens } = require("./lib/location");
const { RecSchema } = require("./lib/validation");
const { cleanPhone } = require("./lib/phone");
const { resolveFirebaseApiKey, PUBLIC_API_BASE } = require("./lib/config");

// Companies House helpers
const {
  getCompanyProfile,
  searchCompanies,
  matchByName,
  chDiag,
} = require("./lib/companiesHouse");

const app = express();
app.set("trust proxy", true);
app.set("etag", false);
const PORT = Number(process.env.PORT || 8787);

const PUBLIC_API_BASE_LOCAL =
  process.env.NEXT_PUBLIC_API_BASE || `http://localhost:${PORT}`;

app.use(
  cors({
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["x-db-name"],
    credentials: false,
  }),
);

app.options("*", cors());
app.use(express.json());

// ✅ Always set db name header early for debugging (doesn't affect behavior)
app.use((req, res, next) => {
  res.set("x-db-name", process.env.MYSQL_DATABASE || "vetmybuilder");
  next();
});

/* -------------------- HTTP request logger -------------------- */
let _reqCounter = 0;
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = `r${(++_reqCounter).toString(36)}-${Date.now().toString(36)}`;
  req.requestId = requestId;
  const log = withRequest(req).child({ requestId });

  res.on("finish", () => {
    // Suppress noisy dashboard polling from logs
    const p = req.originalUrl || req.url || "";
    if (p.startsWith("/api/admin/dashboard/")) return;

    log.info(
      {
        status: res.statusCode,
        duration: Date.now() - start,
      },
      "http request",
    );
  });

  next();
});

/* -------------------- TEST-ONLY helpers -------------------- */
const TEST_ROUTES_ENABLED =
  process.env.NODE_ENV === "test" ||
  process.env.ENABLE_TEST_ROUTES === "1" ||
  String(process.env.TEST_ENV || "").toLowerCase() === "e2e";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

function assertTestAccess(req, res) {
  if (!TEST_ROUTES_ENABLED) return res.status(404).json({ error: "Not found" });

  const hdr = req.header("X-Test-Secret") || "";
  if (!TEST_SECRET || hdr !== TEST_SECRET) {
    return res.status(401).json({ error: "Unauthorized (test)" });
  }

  return true;
}

function wipeAllRows(_db) {
  logger.warn("wipeAllRows called – no-op under MySQL mode");
}

/* -------------------- Firebase Admin -------------------- */
(function initFirebaseAdmin() {
  const credsRaw = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;

  if (!credsRaw) {
    logger.warn("FIREBASE_ADMIN_CREDENTIALS_JSON missing");
    return;
  }

  const creds = JSON.parse(credsRaw);

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    logger.info("Firebase Admin initialised");
  }
})();

function optionalAuth(adminInstance) {
  return async (req, _res, next) => {
    try {
      const h = req.headers?.authorization || "";
      if (h.startsWith("Bearer ")) {
        const token = h.slice(7);
        const decoded = await adminInstance.auth().verifyIdToken(token);

        req.user = {
          uid: decoded.uid,
          email: decoded.email || null,
        };
      }
    } catch (_) {
      // ignore invalid tokens
    }
    next();
  };
}

/* -------------------- Notify -------------------- */
let notifyUsers = null;
try {
  const mod = require("./lib/notify");
  notifyUsers = mod.notifyUsers || mod;
} catch (_) {
  // silent fallback
}

if (!notifyUsers) {
  notifyUsers = async function fallbackNotifyUsers(_dbConn, uids, payload) {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const ids = Array.isArray(uids) ? uids : [];
    if (!ids.length) return;

    const insertSql = `
      INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    for (const uid of ids) {
      try {
        await mysqlQuery(insertSql, [
          uid,
          payload.type || "info",
          String(payload.message || ""),
          typeof payload.projectId === "number" ? payload.projectId : null,
          payload.linkPath || null,
          now,
        ]);
      } catch (err) {
        logger.warn(
          { error: err?.message, uid },
          "notifyUsers fallback insert error",
        );
      }

      const set = clientsByUser.get(uid);
      if (set && set.size) {
        for (const res of set) {
          try {
            sseSend(res, "notification", {
              type: payload.type || "info",
              message: String(payload.message || ""),
              projectId:
                typeof payload.projectId === "number"
                  ? payload.projectId
                  : null,
              linkPath: payload.linkPath || null,
              createdAt: now,
            });
          } catch (e) {
            logger.warn(
              { error: e?.message, uid },
              "notifyUsers fallback SSE send error",
            );
          }
        }
      }
    }
  };
}

const auth = authMiddleware(admin);

/* -------------------- Health -------------------- */
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    now: new Date().toISOString(),
    mysqlDatabase: process.env.MYSQL_DATABASE || null,
    testDbName: process.env.TEST_DB_NAME || null,
  }),
);

/* -------------------- Public stats -------------------- */
async function handlePublicStats(_req, res) {
  try {
    const [usersRows, recRows, shortRows] = await Promise.all([
      mysqlQuery(`SELECT COUNT(*) AS c FROM users`),
      mysqlQuery(`SELECT COUNT(*) AS c FROM recommendations`),
      mysqlQuery(`SELECT COUNT(DISTINCT projectId) AS c FROM recommendations`),
    ]);

    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    return res.status(200).json({
      communityMembers: usersRows[0]?.c || 0,
      recommendations: recRows[0]?.c || 0,
      shortlists: shortRows[0]?.c || 0,
    });
  } catch (e) {
    logger.error({ error: e?.message }, "stats endpoint error");
    return res.status(500).json({ error: "Failed to load stats" });
  }
}

app.get("/api/stats", handlePublicStats);
app.get("/api/stats/public", handlePublicStats);

/* -------------------- Uploads (static) -------------------- */
logger.info({ uploadDir: UPLOAD_DIR }, "uploads initialised");

app.use(
  "/uploads",
  (req, res, next) => {
    withRequest(req).info("uploads request");
    next();
  },
  express.static(UPLOAD_DIR, { maxAge: "7d", index: false }),
);

/* -------------------- Build router -------------------- */
const { buildRouter } = require("./buildRouter");

/**
 * touchUserMw
 * Ensures the authenticated user exists in the MySQL `users` table.
 * Also (best-effort) seeds first/last name from the Firebase token's `name`
 * so /api/me can show initials even if /api/account hasn't run yet.
 */
const touchUserMw = async (req, _res, next) => {
  const uid = req.user?.uid;
  if (!uid) return next();

  const email = req.user?.email ?? null;

  // Best-effort parse of Firebase token "name" claim
  const fullName = String(req.user?.name || "").trim();
  let firstName = null;
  let lastName = null;

  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      firstName = parts[0];
    } else if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }

  try {
    await mysqlQuery(
      `
      INSERT INTO users (uid, email, createdAt, firstName, lastName)
      VALUES (?, ?, NOW(), ?, ?)
      ON DUPLICATE KEY UPDATE
        email     = COALESCE(VALUES(email), email),
        firstName = COALESCE(firstName, VALUES(firstName)),
        lastName  = COALESCE(lastName, VALUES(lastName))
      `,
      [uid, email, firstName, lastName],
    );
  } catch (err) {
    // Don't block requests if touch fails; log for diagnosis
    logger.error(
      { err: err?.message, uid, email },
      "touchUserMw failed to upsert users row",
    );
  }

  return next();
};

const router = buildRouter({
  mysqlQuery,
  admin,
  auth,
  optionalAuth: optionalAuth(admin),
  touchUserMw,
  assertTestAccess,
  wipeAllRows,
  clientsByUser,
  sseSend,
  notifyUsers,
  fetch: global.fetch,
  upload,
  UPLOAD_DIR,
  extractLocationTokens,
  RecSchema,
  cleanPhone,
  resolveFirebaseApiKey,
  PUBLIC_API_BASE: PUBLIC_API_BASE || PUBLIC_API_BASE_LOCAL,
  path: require("node:path"),
  getCompanyProfile,
  searchCompanies,
  matchByName,
  chDiag,
});

app.use("/api", router);

// Friendly error messages. Intercepts outgoing JSON responses that have
// a bare error code (e.g. { error: "internal_error" }) but no human-
// readable `message` field, and adds one. This covers all 80+ routes
// that return generic error codes without changing each one individually.
const FRIENDLY_MESSAGES = {
  internal_error: "Something went wrong. Please try again or contact support if this keeps happening.",
  server_error: "Something went wrong on our end. Please try again.",
  create_failed: "We couldn't complete that action right now. Please try again.",
  upload_failed: "The upload didn't work. Please check your file and try again.",
  store_failed: "We couldn't save that right now. Please try again.",
  unexpected_failure: "Something unexpected happened. Please try again.",
};
const originalJson = app.response.json;
app.response.json = function friendlyJson(body) {
  if (
    body &&
    typeof body === "object" &&
    typeof body.error === "string" &&
    !body.message &&
    FRIENDLY_MESSAGES[body.error]
  ) {
    body.message = FRIENDLY_MESSAGES[body.error];
  }
  return originalJson.call(this, body);
};

logger.info(
  {
    port: PORT,
    db: process.env.MYSQL_DATABASE,
    testShard: process.env.TEST_SHARD,
  },
  "boot env",
);

console.log(
  `\n[VMB] API running on port ${PORT} using database: ${process.env.MYSQL_DATABASE}\n`,
);

/* -------------------- Start server -------------------- */
app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "server started");

  // Production sentinel: warn loudly if simulator data is found in the
  // live DB. See server/lib/simDataSentinel.js for the incident note.
  // Fire-and-forget - we don't want a transient DB blip at boot to kill
  // the process or block healthchecks.
  try {
    const { checkProdForSimData } = require("./lib/simDataSentinel");
    const mysql = require("./lib/mysql");
    checkProdForSimData({ mysqlQuery: mysql.query, log: logger }).catch(() => {});
  } catch (e) {
    logger.warn(
      { error: e?.message || String(e) },
      "sim-sentinel could not start",
    );
  }
});
