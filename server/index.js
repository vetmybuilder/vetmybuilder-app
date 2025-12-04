/* Express API for vetmybuilder v1 */
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

// ---------------------- DEBUG FLAG ----------------------
const DEBUG = process.env.DEBUG_SERVER === "1";

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { initDb } = require("./lib/db");
const { query: mysqlQuery } = require("./lib/mysql");
const { runMigrations } = require("./lib/migrate");
const { authMiddleware } = require("./lib/middleware");

// Shared libs used by routes
const { clientsByUser, sseSend } = require("./lib/sse");
const { upload, UPLOAD_DIR } = require("./lib/uploads");
const { extractLocationTokens, updateUserLocation } = require("./lib/location");
const {
  RecSchema /* ProjectSchema not needed in index */,
} = require("./lib/validation");
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
const PORT = process.env.PORT || 8787;

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
    if (DEBUG)
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

function wipeAllRows(_db) {
  if (DEBUG) console.warn("[test] wipeAllRows is a no-op in MySQL mode");
}

/* -------------------- Firebase Admin -------------------- */
(function initFirebaseAdmin() {
  const credsRaw = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!credsRaw) {
    if (DEBUG) console.warn("[server] FIREBASE_ADMIN_CREDENTIALS_JSON missing");
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
      // ignore invalid tokens
    }
    next();
  };
}

/* -------------------- DB & health -------------------- */
const db = initDb(process.env.DATABASE_URL || "./data/app.db");
if (runMigrations) runMigrations(db);

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
          if (DEBUG)
            console.warn(
              "[notifyUsers fallback] insert error:",
              err?.message || err
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
              if (DEBUG)
                console.warn(
                  "[notifyUsers fallback] SSE send error:",
                  e?.message || e
                );
            }
          }
        }
      }
    } catch (e) {
      if (DEBUG)
        console.warn("[notifyUsers fallback] general error:", e?.message || e);
    }
  };
}

const auth = authMiddleware(admin);

app.get("/health", (_req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
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
    console.error("stats error", e);
    return res.status(500).json({ error: "Failed to load stats" });
  }
}
app.get("/api/stats", handlePublicStats);
app.get("/api/stats/public", handlePublicStats);

/* -------------------- Uploads (static) -------------------- */
if (DEBUG) {
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
}

app.use(
  "/uploads",
  (req, res, next) => {
    if (DEBUG) console.log("[uploads] request", req.method, req.path);
    next();
  },
  express.static(UPLOAD_DIR, { maxAge: "7d", index: false })
);

/* -------------------- router -------------------- */
const { buildRouter } = require("./buildRouter");

const touchUserMw = (_req, _res, next) => next();

const router = buildRouter({
  db,
  mysqlQuery,
  admin,
  auth,
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
  updateUserLocation,
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

/* -------------------- Start server -------------------- */
if (DEBUG) console.log(`[server] http://localhost:${PORT}`);
app.listen(PORT);
