/* Express API for vetmybuilder v1 */
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { initDb } = require("./lib/db");
const { query: mysqlQuery } = require("./lib/mysql");
const { runMigrations } = require("./lib/migrate");
const { authMiddleware } = require("./lib/middleware");

// v2 libs you moved out
const { clientsByUser, sseSend } = require("./lib/sse");
const { upload, UPLOAD_DIR } = require("./lib/uploads");
const { extractLocationTokens, updateUserLocation } = require("./lib/location");
const {
  RecSchema /* ProjectSchema not needed in index */,
} = require("./lib/validation");
const { cleanPhone } = require("./lib/phone");
const { resolveFirebaseApiKey, PUBLIC_API_BASE } = require("./lib/config");

// Companies House helpers used by v2 routes
const {
  getCompanyProfile,
  searchCompanies,
  matchByName,
  chDiag,
} = require("./lib/companiesHouse");

const app = express();
app.set("trust proxy", true);
app.set("etag", false);
const PORT = process.env.PORT || 8787;

// Public API origin used to build absolute file URLs for images (kept for v1/public stats use)
const PUBLIC_API_BASE_LOCAL =
  process.env.NEXT_PUBLIC_API_BASE || `http://localhost:${PORT}`;

app.use(
  cors({
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
app.options("*", cors());
app.use(express.json());

/* -------------------- ultra-early request logger -------------------- */
app.use((req, res, next) => {
  const t0 = Date.now();
  const { method } = req;
  const url = req.originalUrl || req.url;
  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(`[http] ${method} ${url} -> ${res.statusCode} in ${ms}ms`);
  });
  next();
});

/* -------------------- TEST-ONLY helpers -------------------- */
const TEST_ROUTES_ENABLED =
  process.env.NODE_ENV === "test" || process.env.ENABLE_TEST_ROUTES === "1";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

function assertTestAccess(req, res) {
  if (!TEST_ROUTES_ENABLED) return res.status(404).json({ error: "Not found" });
  const hdr = req.header("X-Test-Secret") || "";
  if (!TEST_SECRET || hdr !== TEST_SECRET) {
    return res.status(401).json({ error: "Unauthorized (test)" });
  }
  return true;
}

// NOTE: we no longer wipe SQLite; this is a no-op placeholder for e2e helpers.
function wipeAllRows(_db) {
  console.warn("[test] wipeAllRows is a no-op in MySQL mode");
}

/* -------------------- Firebase Admin -------------------- */
(function initFirebaseAdmin() {
  const credsRaw = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!credsRaw) {
    console.warn("[server] FIREBASE_ADMIN_CREDENTIALS_JSON missing");
    return;
  }
  const creds = JSON.parse(credsRaw);
  if (!admin.apps.length)
    admin.initializeApp({ credential: admin.credential.cert(creds) });
})();

function optionalAuth(adminInstance) {
  return async (req, _res, next) => {
    try {
      const h = req.headers?.authorization || "";
      if (h.startsWith("Bearer ")) {
        const token = h.slice(7);
        const decoded = await adminInstance.auth().verifyIdToken(token);
        req.user = { uid: decoded.uid, email: decoded.email || null };
      }
    } catch (_e) {
      // ignore invalid/expired tokens; proceed anonymously
    }
    next();
  };
}

/* -------------------- DB & health -------------------- */
// SQLite is still initialised for any legacy routes that still depend on ctx.db,
// but all new work should go through mysqlQuery.
const db = initDb(process.env.DATABASE_URL || "./data/app.db");
if (runMigrations) runMigrations(db);

// Try to load a real notifyUsers, else install a minimal fallback (uses MySQL)
let notifyUsers = null;
try {
  const mod = require("./lib/notify");
  notifyUsers = mod.notifyUsers || mod;
} catch (_) {}

if (!notifyUsers) {
  notifyUsers = async function fallbackNotifyUsers(_dbConn, uids, payload) {
    try {
      const now = new Date().toISOString();
      const ids = Array.isArray(uids) ? uids : [];

      if (!ids.length) return;

      // 1) Persist notifications in MySQL
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
          console.warn(
            "[notifyUsers fallback] insert error:",
            err?.message || err
          );
        }

        // 2) Push to any live SSE clients
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
              console.warn(
                "[notifyUsers fallback] SSE send error:",
                e?.message || e
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn("[notifyUsers fallback] general error:", e?.message || e);
    }
  };
}

const auth = authMiddleware(admin);

app.get("/health", (_req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
);

/* -------------------- Public stats (now MySQL-backed) -------------------- */
async function handlePublicStats(_req, res) {
  try {
    const [usersRows, recRows, shortRows] = await Promise.all([
      mysqlQuery(`SELECT COUNT(*) AS c FROM users`),
      mysqlQuery(`SELECT COUNT(*) AS c FROM recommendations`),
      mysqlQuery(`SELECT COUNT(DISTINCT projectId) AS c FROM recommendations`),
    ]);

    const communityMembers = usersRows[0]?.c || 0;
    const recommendations = recRows[0]?.c || 0;
    const shortlists = shortRows[0]?.c || 0;

    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    return res
      .status(200)
      .json({ communityMembers, recommendations, shortlists });
  } catch (e) {
    console.error("stats error", e);
    return res.status(500).json({ error: "Failed to load stats" });
  }
}
app.get("/api/stats", handlePublicStats);
app.get("/api/stats/public", handlePublicStats);

/* -------------------- Uploads (static) -------------------- */
console.log("[uploads] UPLOAD_DIR:", UPLOAD_DIR);
try {
  const exists = fs.existsSync(UPLOAD_DIR);
  console.log("[uploads] exists?", exists);
  if (exists) {
    console.log("[uploads] top-level contents:", fs.readdirSync(UPLOAD_DIR));
  }
} catch (e) {
  console.log("[uploads] error reading UPLOAD_DIR:", e?.message || e);
}

// Serve /uploads/* from the uploads directory, with per-request logging
app.use(
  "/uploads",
  (req, res, next) => {
    console.log("[uploads] request", req.method, req.path);
    next();
  },
  express.static(UPLOAD_DIR, { maxAge: "7d", index: false })
);

/* -------------------- router -------------------- */
const { buildRouter } = require("./buildRouter");

// simple no-op touchUser middleware for ctx (SQLite touchUser is no longer needed)
const touchUserMw = (_req, _res, next) => next();

// Pass full ctx expected by the routes.
const v2Router = buildRouter({
  db, // still passed for any legacy routes that haven't been migrated yet
  mysqlQuery,
  admin,
  auth,
  touchUserMw,
  // test helpers
  assertTestAccess,
  wipeAllRows,
  // sse / notify
  clientsByUser,
  sseSend,
  notifyUsers,
  // misc
  fetch: global.fetch,
  // uploads
  upload,
  UPLOAD_DIR,
  // location + validation + phone
  extractLocationTokens,
  updateUserLocation,
  RecSchema,
  cleanPhone,
  // config
  resolveFirebaseApiKey,
  PUBLIC_API_BASE: PUBLIC_API_BASE || PUBLIC_API_BASE_LOCAL,
  path: require("node:path"),
  // Companies House
  getCompanyProfile,
  searchCompanies,
  matchByName,
  chDiag,
});

// Mount under /api to match existing paths
app.use("/api/v2", v2Router);
app.use("/api", v2Router);

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
