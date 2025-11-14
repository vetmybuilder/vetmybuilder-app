/* Express API for vetmybuilder v1 */
const path = require("node:path");
const fs = require("node:fs"); // 🔍 added
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { initDb } = require("./lib/db");
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
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
app.options("*", cors());
app.use(express.json());

/* -------------------- ultra-early request logger -------------------- */
/* Logs every request that reaches Express, before any routers/middleware. */
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

function wipeAllRows(db) {
  try {
    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN");
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all()
      .map((r) => r.name);

    const keep = new Set(["migrations"]);

    for (const name of tables) {
      if (keep.has(name)) continue;
      db.prepare(`DELETE FROM "${name}"`).run();
      try {
        db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(name);
      } catch {}
    }
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    db.pragma("foreign_keys = ON");
  }
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
const db = initDb(process.env.DATABASE_URL || "./data/app.db");
if (runMigrations) runMigrations(db);

// Try to load a real notifyUsers, else install a minimal fallback (needs SSE hub)
let notifyUsers = null;
try {
  const mod = require("./lib/notify");
  notifyUsers = mod.notifyUsers || mod;
} catch (_) {}

if (!notifyUsers) {
  // ensure a notifications table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      projectId INTEGER,
      linkPath TEXT,
      createdAt TEXT NOT NULL,
      readAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(userId, readAt);
  `);

  notifyUsers = function fallbackNotifyUsers(dbConn, uids, payload) {
    const now = new Date().toISOString();
    const ins = dbConn.prepare(`
      INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
      VALUES (@uid, @type, @message, @projectId, @linkPath, @createdAt)
    `);

    const tx = dbConn.transaction((ids) => {
      ids.forEach((uid) => {
        ins.run({
          uid,
          type: payload.type || "info",
          message: String(payload.message || ""),
          projectId:
            typeof payload.projectId === "number" ? payload.projectId : null,
          linkPath: payload.linkPath || null,
          createdAt: now,
        });

        // push to any live SSE clients
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
            } catch {}
          }
        }
      });
    });

    tx(uids || []);
  };
}

// Ensure users table exists (and columns) + optional backfill from Firebase
ensureUsersTable(db);
backfillUsersFromFirebaseIfEmpty(db, admin).catch(() => {});

app.get("/health", (_req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
);

// --- Users helpers (local bootstrap-only) ---
function ensureUsersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT,
      createdAt TEXT NOT NULL,
      firstName TEXT,
      lastName TEXT,
      username TEXT,
      locationRaw TEXT,
      postcode TEXT,
      postcodeSector TEXT,
      postcodeOutward TEXT,
      city TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users(createdAt);
    CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
    CREATE INDEX IF NOT EXISTS idx_users_postcode ON users(postcode);
    CREATE INDEX IF NOT EXISTS idx_users_postcodeSector ON users(postcodeSector);
    CREATE INDEX IF NOT EXISTS idx_users_postcodeOutward ON users(postcodeOutward);
  `);
  try {
    db.exec(`ALTER TABLE users ADD COLUMN firstName TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN lastName TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN username TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN locationRaw TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN postcode TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN postcodeSector TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN postcodeOutward TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN city TEXT;`);
  } catch {}
}

function touchUserRow(db, { uid, email }) {
  if (!uid) return;
  db.prepare(
    `INSERT INTO users (uid, email, createdAt)
     VALUES (@uid, @email, @createdAt)
     ON CONFLICT(uid) DO UPDATE SET email = excluded.email`
  ).run({
    uid,
    email: email || null,
    createdAt: new Date().toISOString(),
  });
}

function touchUser(db) {
  return (req, _res, next) => {
    if (req.user?.uid) {
      touchUserRow(db, { uid: req.user.uid, email: req.user.email });
    }
    next();
  };
}

const auth = authMiddleware(admin);

// One-time backfill if the users table is empty (from Firebase Admin)
async function backfillUsersFromFirebaseIfEmpty(db, adminInstance) {
  try {
    const present = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c || 0;
    if (present > 0) return; // already populated
    if (!adminInstance?.apps?.length) return; // admin not initialized

    console.log("[users] backfill: pulling users from Firebase...");
    let nextPageToken = undefined;
    let inserted = 0;

    do {
      const res = await adminInstance.auth().listUsers(1000, nextPageToken);
      const stmt = db.prepare(
        `INSERT INTO users (uid, email, createdAt)
         VALUES (?, ?, ?)
         ON CONFLICT(uid) DO UPDATE SET email=excluded.email`
      );
      const nowIso = new Date().toISOString();

      for (const u of res.users) {
        stmt.run(u.uid, u.email || null, nowIso);
        inserted++;
      }
      nextPageToken = res.pageToken;
    } while (nextPageToken);

    console.log(`[users] backfill complete: ${inserted} upserts`);
  } catch (e) {
    console.warn("[users] backfill failed:", e?.message || e);
  }
}

/* -------------------- Public stats (still in index for now) -------------------- */
async function handlePublicStats(_req, res) {
  try {
    const communityMembers =
      db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c || 0;
    const recommendations =
      db.prepare(`SELECT COUNT(*) AS c FROM recommendations`).get().c || 0;
    const shortlists =
      db
        .prepare(`SELECT COUNT(DISTINCT projectId) AS c FROM recommendations`)
        .get().c || 0;

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
// 🔍 debug uploads dir
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

// Photo table (used by v2 routes; safe to create here at boot)
db.exec(`
  CREATE TABLE IF NOT EXISTS recommendation_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recommendationId INTEGER NOT NULL,
    filePath TEXT NOT NULL,
    mime TEXT,
    sizeBytes INTEGER,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_rec_photos_rec ON recommendation_photos(recommendationId);
`);

/* -------------------- v2 router -------------------- */
const { buildRouter } = require("./buildRouter");

// Pass full ctx expected by the v2 routes.
const v2Router = buildRouter({
  db,
  admin,
  auth,
  touchUserMw: touchUser(db),
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