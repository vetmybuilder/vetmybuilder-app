/* Express API for vetmybuilder v1 */
const path = require("node:path");
require("dotenv").config();
require("dotenv").config({
  path: path.resolve(process.cwd(), "web/.env.local"),
});

// Helper to resolve the Firebase Web API key from either FIREBASE_API_KEY or NEXT_PUBLIC_FIREBASE_CONFIG_JSON
function resolveFirebaseApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  try {
    const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG_JSON || "{}";
    const cfg = JSON.parse(raw);
    return cfg.apiKey;
  } catch {
    return undefined;
  }
}

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { initDb } = require("./lib/db");
const { runMigrations } = require("./lib/migrate");
const { authMiddleware } = require("./lib/middleware");
const { z } = require("zod");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
// ---- Robust notifyUsers fallback (defer implementation until DB is ready) ----
let notifyUsers = null;
try {
  const mod = require("./lib/notify");
  notifyUsers = mod.notifyUsers || mod;
} catch (_) {}

const app = express();
app.set("trust proxy", true);
app.set("etag", false);
const PORT = process.env.PORT || 8787;

// Public API origin used to build absolute file URLs for images
const PUBLIC_API_BASE =
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

// ---- TEST-ONLY helpers (disabled by default) ----
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

/* -------------------- SSE hub -------------------- */

const clientsByUser = new Map(); // Map<uid, Set<res>>

function sseSend(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/* -------------------- Location helpers -------------------- */
function extractLocationTokens(raw) {
  const sRaw = String(raw || "").trim();
  if (!sRaw) {
    return { full: null, sector: null, outward: null, city: null, raw: "" };
  }

  const s = sRaw.toUpperCase();

  // 1) FULL UK postcode (outward + inward), eg "E4 6JH", "SW1A 1AA"
  //   acceptable outward forms: A9, A9A, A99, AA9, AA9A
  const fullRe =
    /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))\s*(?<inward>\d[A-Z]{2})$/;
  const mFull = s.match(fullRe);
  if (mFull && mFull.groups) {
    const outward = mFull.groups.outward;
    const inward = mFull.groups.inward;
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward[0]}`; // outward + first digit of inward
    return {
      full,
      sector,
      outward,
      city: null,
      raw: sRaw,
    };
  }

  // 2) SECTOR form, eg "E4 6", "SW1A 1"
  const sectorRe = /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))\s*(?<digit>\d)$/;
  const mSector = s.match(sectorRe);
  if (mSector && mSector.groups) {
    const outward = mSector.groups.outward;
    const sector = `${outward} ${mSector.groups.digit}`;
    return {
      full: null,
      sector,
      outward,
      city: null,
      raw: sRaw,
    };
  }

  // 3) OUTWARD-ONLY form, eg "E4", "SW1A", "EC1"
  const outwardRe = /^(?<outward>(?:[A-Z]{1,2}\d{1,2}[A-Z]?))$/;
  const mOut = s.match(outwardRe);
  if (mOut && mOut.groups) {
    const outward = mOut.groups.outward;
    return {
      full: null,
      sector: null,
      outward,
      city: null,
      raw: sRaw,
    };
  }

  // 4) Otherwise treat as a city/area string
  return {
    full: null,
    sector: null,
    outward: null,
    city: sRaw.toLowerCase(),
    raw: sRaw,
  };
}

function updateUserLocation(db, uid, location) {
  const t = extractLocationTokens(String(location ?? "").trim());
  db.prepare(
    `UPDATE users SET
       locationRaw=@raw,
       postcode=@full,
       postcodeSector=@sector,
       postcodeOutward=@outward,
       city=@city
     WHERE uid=@uid`
  ).run({
    uid,
    raw: t.raw,
    full: t.full,
    sector: t.sector,
    outward: t.outward,
    city: t.city,
  });
}

/* -------------------- Firebase -------------------- */

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

// If no external notifyUsers module is available, install a minimal in-file fallback *now*
// (db is available at this point)
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

// Ensure users table has location fields
ensureUsersTable(db);
backfillUsersFromFirebaseIfEmpty(db, admin).catch(() => {});

app.get("/health", (_req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
);

// --- Helpers to adapt to existing users schema (id vs userId vs uid)
let __USERS_PK_COL = null;
function getUsersPkCol(db) {
  if (__USERS_PK_COL) return __USERS_PK_COL;
  try {
    const cols = db.prepare("PRAGMA table_info(users)").all();
    const candidates = ["id", "userId", "uid"];
    const found = candidates.find((c) => cols.some((r) => r.name === c));
    __USERS_PK_COL = found || "id";
  } catch {
    __USERS_PK_COL = "id";
  }
  return __USERS_PK_COL;
}

/* -------------------- Uploads (photos) -------------------- */

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", index: false }));

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

// Multer storage
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
  limits: { fileSize: 8 * 1024 * 1024, files: 8 }, // 8MB, up to 8 photos
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Only images are allowed"), ok);
  },
});

/* -------------------- Users table helpers -------------------- */

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

const authed = (handler) => [authMiddleware(admin), touchUser(db), handler];

// One-time backfill if the users table is empty (from Firebase Admin)
async function backfillUsersFromFirebaseIfEmpty(db, adminInstance) {
  try {
    const present = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c || 0;
    if (present > 0) return;
    if (!adminInstance?.apps?.length) return;

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

/* -------------------- Public stats (for homepage) -------------------- */

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

/* -------------------- Validation -------------------- */

const ProjectSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.string().min(2).max(80),
  location: z.string().min(2).max(120),
  description: z.string().min(2).max(2000),
  propertyType: z.string().min(2).max(80),
  bedrooms: z.number().int().min(0).max(20),
});

const RecSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z
      .string()
      .email()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    phone: z
      .string()
      .min(3)
      .max(40)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    company: z.string().min(1).max(200),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    hireAgain: z.enum(["yes", "no"]).optional(),
    comment: z.string().min(10).max(2000),
  })
  .transform((v) => {
    const r =
      typeof v.rating === "number" ? v.rating : v.hireAgain === "yes" ? 5 : 3;
    return { ...v, rating: r };
  });

// --- phone helper (very light) ---
function cleanPhone(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const compact = s.replace(/[^\d+]/g, "");
  return compact || null;
}

/* -------------------- Account (names + location) -------------------- */

app.get(
  "/api/account",
  ...authed((req, res) => {
    const uid = req.user.uid;

    const user =
      db
        .prepare(
          `SELECT uid, email, firstName, lastName, username,
                  locationRaw, postcode, postcodeSector, postcodeOutward, city
           FROM users
           WHERE uid = ?`
        )
        .get(uid) || null;

    const profile =
      db
        .prepare(
          `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
           FROM users WHERE uid = ?`
        )
        .get(uid) || null;

    res.json({ user, profile });
  })
);

app.post(
  "/api/account",
  ...authed((req, res) => {
    const uid = req.user.uid;

    const firstName = (req.body?.firstName ?? "").toString().trim() || null;
    const lastName = (req.body?.lastName ?? "").toString().trim() || null;
    const username = (req.body?.username ?? "").toString().trim() || null;
    const location = (req.body?.location ?? "").toString();

    if (username) {
      const taken = db
        .prepare(`SELECT 1 FROM users WHERE username = ? AND uid <> ?`)
        .get(username, uid);
      if (taken)
        return res
          .status(409)
          .json({ error: "That username is already taken." });
    }

    const existing = db
      .prepare(`SELECT email, createdAt FROM users WHERE uid = ?`)
      .get(uid);

    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (uid, email, createdAt, firstName, lastName, username)
       VALUES (@uid, @email, @createdAt, @firstName, @lastName, @username)
       ON CONFLICT(uid) DO UPDATE SET
         email=excluded.email,
         firstName=excluded.firstName,
         lastName=excluded.lastName,
         username=excluded.username`
    ).run({
      uid,
      email: existing?.email ?? req.user.email ?? null,
      createdAt: existing?.createdAt ?? now,
      firstName,
      lastName,
      username,
    });

    updateUserLocation(db, uid, location);
    res.json({ ok: true });
  })
);

/* -------------------- Profile (legacy path; proxies users) -------------------- */

app.get(
  "/api/profile",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const row = db
      .prepare(
        `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
         FROM users WHERE uid = ?`
      )
      .get(uid);
    res.json({ profile: row || null });
  })
);

app.post(
  "/api/profile",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const loc = String(req.body?.location ?? "").trim();
    updateUserLocation(db, uid, loc);
    const row = db
      .prepare(
        `SELECT uid AS userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, createdAt AS updatedAt
         FROM users WHERE uid=?`
      )
      .get(uid);

    res.json({ profile: row });
  })
);

app.get(
  "/api/me",
  ...authed(async (req, res) => {
    const uid = req.user.uid;

    // pull name fields from your users table
    const row =
      db
        .prepare(
          `SELECT uid, email, firstName, lastName, username
           FROM users WHERE uid = ?`
        )
        .get(uid) || {};

    const email = row.email || req.user.email || null;
    const firstName = row.firstName || null;
    const lastName = row.lastName || null;
    const username = row.username || null;

    // compute displayName + initials on the server (optional but handy)
    const displayName =
      [firstName, lastName].filter(Boolean).join(" ") ||
      username ||
      email ||
      uid;

    const initials =
      firstName || lastName
        ? `${(firstName || "").slice(0, 1)}${(lastName || "").slice(
            0,
            1
          )}`.toUpperCase()
        : username
        ? username
            .split(/[.\-_ ]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0])
            .join("")
            .toUpperCase()
        : undefined;

    res.set("Cache-Control", "no-store");
    res.json({
      uid,
      email,
      firstName,
      lastName,
      username,
      displayName,
      initials,
    });
  })
);

/* -------------------- Projects: CRUD -------------------- */

/** List my projects */
app.get(
  "/api/projects",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const tab = req.query.tab === "recommended" ? "recommended" : "mine";

    const qName = String(req.query.name ?? "").trim();
    const qType = String(req.query.type ?? "").trim();
    const qLocation = String(req.query.location ?? "").trim();
    const qProperty = String(req.query.property ?? "").trim();
    const rawStatus = String(req.query.status ?? "all").toLowerCase();

    const allowedSort = new Set(["createdAt", "name"]);
    const sort = allowedSort.has(String(req.query.sort))
      ? String(req.query.sort)
      : "createdAt";
    const order =
      String(req.query.order).toLowerCase() === "asc" ? "ASC" : "DESC";

    const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(req.query.pageSize ?? "10", 10))
    );
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];

    if (rawStatus !== "all") {
      where.push(`p.status = ?`);
      params.push(rawStatus);
    }
    if (qName) {
      where.push(`p.name LIKE ? COLLATE NOCASE`);
      params.push(`%${qName}%`);
    }
    if (qType) {
      where.push(`p.type LIKE ? COLLATE NOCASE`);
      params.push(`%${qType}%`);
    }
    if (qLocation) {
      where.push(`p.location LIKE ? COLLATE NOCASE`);
      params.push(`%${qLocation}%`);
    }
    if (qProperty) {
      where.push(`p.propertyType LIKE ? COLLATE NOCASE`);
      params.push(`%${qProperty}%`);
    }

    const whereSql = where.length ? `AND ${where.join(" AND ")}` : "";

    if (tab === "mine") {
      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS c
           FROM projects p
          WHERE p.ownerUserId = ?
            ${whereSql}`
        )
        .get(uid, ...params);

      const rows = db
        .prepare(
          `SELECT p.*
           FROM projects p
          WHERE p.ownerUserId = ?
            ${whereSql}
          ORDER BY p.${sort} ${order}
          LIMIT ? OFFSET ?`
        )
        .all(uid, ...params, pageSize, offset);

      return res.json({ items: rows, total: countRow.c, page, pageSize });
    } else {
      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS c
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
          WHERE r.recommenderUserId = ?
            ${whereSql}`
        )
        .get(uid, ...params);

      const rows = db
        .prepare(
          `SELECT p.*
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
          WHERE r.recommenderUserId = ?
            ${whereSql}
          ORDER BY p.${sort} ${order}
          LIMIT ? OFFSET ?`
        )
        .all(uid, ...params, pageSize, offset);

      return res.json({ items: rows, total: countRow.c, page, pageSize });
    }
  })
);

/** Create a project (owner = current user) */
app.post(
  "/api/projects",
  ...authed((req, res) => {
    const uid = req.user.uid;

    let body;
    try {
      body = ProjectSchema.parse({
        name: req.body?.name,
        type: req.body?.type,
        location: req.body?.location,
        description: req.body?.description,
        propertyType: req.body?.propertyType,
        bedrooms: req.body?.bedrooms,
      });
    } catch (e) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects
        (name, type, location, description, propertyType, bedrooms, status, createdAt, ownerUserId)
       VALUES (@name, @type, @location, @description, @propertyType, @bedrooms, 'pending', @createdAt, @owner)`
    ).run({
      ...body,
      createdAt: now,
      owner: uid,
    });

    const project = db
      .prepare(
        `SELECT *
           FROM projects
          WHERE ownerUserId = @owner
          ORDER BY id DESC
          LIMIT 1`
      )
      .get({ owner: uid });

    res.status(201).json({ project });
  })
);

/** Read single project (public if live) */
app.get("/api/projects/:id", optionalAuth(admin), (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  if (!project) return res.status(404).json({ error: "Not found" });
  if (!req.user) {
    if ((project.status || "").toLowerCase() !== "live") {
      return res.status(401).json({ error: "Missing bearer token" });
    }
  }
  res.json({ project });
});

/** Update a project (owner only) */
app.put(
  "/api/projects/:id",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!current) return res.status(404).json({ error: "Not found" });
    if (current.ownerUserId !== uid)
      return res.status(403).json({ error: "Forbidden" });

    // Partial update – reuse schema but allow blanks -> coerce to current values
    const fields = {
      name: String(req.body?.name ?? current.name),
      type: String(req.body?.type ?? current.type),
      location: String(req.body?.location ?? current.location),
      description: String(req.body?.description ?? current.description),
      propertyType: String(req.body?.propertyType ?? current.propertyType),
      bedrooms: Number(
        req.body?.bedrooms !== undefined ? req.body.bedrooms : current.bedrooms
      ),
    };

    try {
      ProjectSchema.parse(fields);
    } catch {
      return res.status(400).json({ error: "Invalid payload" });
    }

    db.prepare(
      `UPDATE projects SET
         name=@name,
         type=@type,
         location=@location,
         description=@description,
         propertyType=@propertyType,
         bedrooms=@bedrooms
       WHERE id=@id`
    ).run({ ...fields, id });

    const updated = db.prepare(`SELECT * FROM projects WHERE id=?`).get(id);
    res.json({ project: updated });
  })
);

/** Archive (owner only) */
app.post(
  "/api/projects/:id/archive",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!current) return res.status(404).json({ error: "Not found" });
    if (current.ownerUserId !== uid)
      return res.status(403).json({ error: "Forbidden" });

    db.prepare(`UPDATE projects SET status='archived' WHERE id=?`).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id=?`).get(id);
    res.json({ project: updated });
  })
);

/** Unarchive (owner only) */
app.post(
  "/api/projects/:id/unarchive",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!current) return res.status(404).json({ error: "Not found" });
    if (current.ownerUserId !== uid)
      return res.status(403).json({ error: "Forbidden" });

    db.prepare(`UPDATE projects SET status='pending' WHERE id=?`).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id=?`).get(id);
    res.json({ project: updated });
  })
);

/* -------------------- Magic links & recommendations -------------------- */

// --- MAGIC LINK: one token per project; rotate=1 to force a new token
app.post(
  "/api/projects/:id/magic-link",
  ...authed((req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const project = db
      .prepare(`SELECT id, ownerUserId, status FROM projects WHERE id = ?`)
      .get(projectId);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.ownerUserId !== req.user.uid) {
      return res
        .status(403)
        .json({ error: "Only the owner can generate invites." });
    }
    if ((project.status || "").toLowerCase() !== "live") {
      return res.status(400).json({
        error: "Project must be live before inviting recommendations.",
      });
    }

    // Backward-compatible table ensure (no UNIQUE so older DBs don’t error)
    db.exec(`
      CREATE TABLE IF NOT EXISTS recommendation_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        token TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
    `);

    const rotate =
      String(req.query.rotate || "").toLowerCase() === "1" ||
      String(req.body?.rotate || "").toLowerCase() === "1";

    const now = new Date().toISOString();

    // Get the latest link for this project (in case older DBs have duplicates)
    let link = db
      .prepare(
        `SELECT id, token, createdAt
         FROM recommendation_links
        WHERE projectId = ?
        ORDER BY id DESC
        LIMIT 1`
      )
      .get(projectId);

    if (!link) {
      // No link yet → insert
      const token = crypto.randomBytes(24).toString("base64url");
      db.prepare(
        `INSERT INTO recommendation_links (projectId, token, createdAt)
         VALUES (?, ?, ?)`
      ).run(projectId, token, now);

      link = db
        .prepare(
          `SELECT id, token, createdAt
           FROM recommendation_links
           WHERE projectId = ?
           ORDER BY id DESC
           LIMIT 1`
        )
        .get(projectId);

      console.log("[magic-link] created", { projectId, token: link.token });
    } else if (rotate) {
      // Rotate existing token
      const token = crypto.randomBytes(24).toString("base64url");
      db.prepare(
        `UPDATE recommendation_links SET token = ?, createdAt = ? WHERE id = ?`
      ).run(token, now, link.id);

      link = db
        .prepare(
          `SELECT id, token, createdAt FROM recommendation_links WHERE id = ?`
        )
        .get(link.id);

      console.log("[magic-link] rotated", { projectId, token: link.token });
    } else {
      console.log("[magic-link] existing", { projectId, token: link.token });
    }

    // --- Build a public, absolute URL that points to the WEB app ---
    function resolveWebBase(req) {
      // 1) Explicit server-side config (best)
      const explicit =
        process.env.WEB_PUBLIC_BASE || process.env.NEXT_PUBLIC_WEB_BASE;
      if (explicit) return String(explicit).replace(/\/+$/, "");

      // 2) Production fallback: derive from API host, fix common port mismatch
      if (process.env.NODE_ENV === "production") {
        const proto =
          String(req.headers["x-forwarded-proto"] || req.protocol || "http")
            .split(",")[0]
            .trim() || "http";

        // first try forwarded host if present
        let host = String(
          req.headers["x-forwarded-host"] || req.headers.host || ""
        )
          .split(",")[0]
          .trim();

        if (!host) return `${proto}://localhost:3000`;

        // If we’re on the API port, rewrite to the web port
        host = host.replace(/:8787$/, ":3000");

        return `${proto}://${host}`;
      }

      // 3) Dev fallback
      return "http://localhost:3000";
    }

    const webBase = resolveWebBase(req);
    const url = new URL(`/r/${link.token}`, webBase).toString();

    return res
      .status(200)
      .json({ ok: true, url, token: link.token, projectId });
  })
);

// Resolve magic link (public)
app.get("/api/recommendations/magic/:token", (req, res) => {
  const { token } = req.params;
  const row = db
    .prepare(
      `SELECT rl.*, p.name as projectName, p.id as projectId, p.status as projectStatus
       FROM recommendation_links rl
       JOIN projects p ON p.id = rl.projectId
      WHERE rl.token = ?`
    )
    .get(token);

  if (!row) return res.status(404).json({ error: "Invalid link" });
  if ((row.projectStatus || "").toLowerCase() !== "live") {
    return res
      .status(400)
      .json({ error: "This project is not accepting recommendations yet." });
  }
  res.json({ token, project: { id: row.projectId, name: row.projectName } });
});

// Submit recommendation via magic link (public; optional auth)
app.post(
  "/api/recommendations/magic/:token",
  optionalAuth(admin),
  (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      upload.array("photos", 8)(req, res, (err) => {
        if (err)
          return res
            .status(400)
            .json({ error: err.message || "Upload failed" });
        next();
      });
    } else {
      next();
    }
  },
  (req, res) => {
    const { token } = req.params;

    const link = db
      .prepare(`SELECT * FROM recommendation_links WHERE token = ?`)
      .get(token);
    if (!link) {
      console.warn("[magic-post] token not found", { token });
      return res.status(404).json({ error: "Invalid or expired link token." });
    }

    const proj = db
      .prepare(`SELECT status FROM projects WHERE id = ?`)
      .get(link.projectId);
    if (!proj || (proj.status || "").toLowerCase() !== "live") {
      console.warn("[magic-post] project not live", {
        token,
        pid: link.projectId,
      });
      return res
        .status(400)
        .json({ error: "This project is not accepting recommendations yet." });
    }

    const asNumber = (v) =>
      v === undefined || v === null || v === "" ? undefined : Number(v);

    // Raw payload (rating may be missing when multipart FormData is used)
    const payload = {
      name: String(req.body?.name ?? "").trim(),
      email: String(req.body?.email ?? "").trim() || undefined,
      phone: String(req.body?.phone ?? "").trim() || undefined,
      company: String(req.body?.company ?? "").trim(),
      rating: asNumber(req.body?.rating), // may be undefined
      comment: String(req.body?.comment ?? "").trim(),
    };

    // Allow anonymous name
    if (!payload.name) payload.name = "Anonymous";

    const parsed = RecSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("[magic-post] bad payload", parsed.error.flatten());
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const { name, email, phone, company, comment } = parsed.data;

    // Robust rating: prefer numeric; else map hireAgain; default 5; clamp [1,5]
    const rawParsedRating = parsed.data.rating;
    const hireAgainRaw =
      typeof req.body?.hireAgain === "string"
        ? req.body.hireAgain.toLowerCase()
        : undefined;

    let ratingNum = Number.isFinite(rawParsedRating)
      ? Number(rawParsedRating)
      : hireAgainRaw === "no"
      ? 1
      : 5;
    ratingNum = Math.max(1, Math.min(5, ratingNum));

    const now = new Date().toISOString();
    const uid = req.user?.uid ?? null;
    const isAnonymous = uid ? 0 : 1;

    const info = db
      .prepare(
        `INSERT INTO recommendations
        (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
       VALUES
        (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, @isAnonymous, 'magic')`
      )
      .run({
        projectId: link.projectId,
        uid,
        createdAt: now,
        name,
        email: email ?? null,
        phone: cleanPhone(phone),
        company,
        rating: ratingNum,
        comment,
        isAnonymous,
      });

    const recommendationId = info.lastInsertRowid;

    // Persist photos if any
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length) {
      const stmt = db.prepare(
        `INSERT INTO recommendation_photos (recommendationId, filePath, mime, sizeBytes, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const f of files) {
        const rel = path.relative(UPLOAD_DIR, f.path).split(path.sep).join("/");
        stmt.run(recommendationId, `/uploads/${rel}`, f.mimetype, f.size, now);
      }
    }

    /* Notify owner */
    try {
      const ownerRow = db
        .prepare(`SELECT ownerUserId, name FROM projects WHERE id=?`)
        .get(link.projectId);
      if (ownerRow && ownerRow.ownerUserId) {
        const submitter = uid || null;
        if (ownerRow.ownerUserId !== submitter) {
          notifyUsers(db, [ownerRow.ownerUserId], {
            type: "recommendation_new",
            message: `Someone has recommended a tradesperson to your project “${ownerRow.name}”`,
            projectId: link.projectId,
            linkPath: `/projects/${link.projectId}`,
          });
        }
      }
    } catch (e) {
      console.warn("[notify-owner magic] failed", e);
    }

    // Auto-like when hireAgain = yes, even if anonymous (one like per token/uid)
    try {
      if (hireAgainRaw !== "no") {
        const voterId = uid || `magic:${token}`;
        db.prepare(
          `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
           VALUES (?, ?, 1)`
        ).run(recommendationId, voterId);
      }
    } catch (e) {
      console.warn("[magic-post] auto-like failed", e);
    }

    console.log("[magic-post] recommendation created", {
      token,
      pid: link.projectId,
      uid: uid || "anon",
      photos: files.length,
      rating: ratingNum,
    });

    return res.status(201).json({ ok: true, recommendationId });
  }
);

// Debug helper (owner only): list rec-links for a project
app.get(
  "/api/debug/reclinks/:projectId",
  ...authed((req, res) => {
    const pid = Number(req.params.projectId);
    if (!Number.isFinite(pid)) return res.status(400).json({ error: "bad id" });
    const p = db
      .prepare(`SELECT ownerUserId FROM projects WHERE id=?`)
      .get(pid);
    if (!p) return res.status(404).json({ error: "not found" });
    if (p.ownerUserId !== req.user.uid)
      return res.status(403).json({ error: "forbidden" });
    const rows = db
      .prepare(
        `SELECT id, token, createdAt FROM recommendation_links WHERE projectId=?`
      )
      .all(pid);
    res.json({ rows });
  })
);

/* -------------------- Shortlist w/ likes -------------------- */

/** Publish (owner only) + notifications */
app.post(
  "/api/projects/:id/publish",
  ...authed((req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.ownerUserId !== req.user.uid)
      return res.status(403).json({ error: "Forbidden" });

    const status = (existing.status || "").toLowerCase();
    if (status === "archived")
      return res
        .status(400)
        .json({ error: "Project is archived. Unarchive before publishing." });
    if (status === "live") return res.json({ project: existing });

    db.prepare(`UPDATE projects SET status='live' WHERE id=?`).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    res.json({ project: updated });

    // Target local users using users table location fields
    const locTokens = extractLocationTokens(updated.location);
    const whereParts = [];
    const areaParams = {};
    if (locTokens.full) {
      whereParts.push("u.postcode = @full");
      areaParams.full = locTokens.full;
    }
    if (locTokens.sector) {
      whereParts.push("u.postcodeSector = @sector");
      areaParams.sector = locTokens.sector;
    }
    if (locTokens.outward) {
      whereParts.push("u.postcodeOutward = @outward");
      areaParams.outward = locTokens.outward;
    }
    if (locTokens.city) {
      whereParts.push("u.city = @city");
      areaParams.city = locTokens.city.toLowerCase();
    }
    if (!whereParts.length) return;

    const areaWhere = whereParts.join(" OR ");

    const areaUsers = db
      .prepare(
        `SELECT u.uid AS uid
         FROM users u
         WHERE (${areaWhere}) AND u.uid != @owner`
      )
      .all({ ...areaParams, owner: updated.ownerUserId })
      .map((r) => r.uid);

    const recUsers = db
      .prepare(
        `SELECT DISTINCT r.recommenderUserId AS uid
         FROM recommendations r
         JOIN users u ON u.uid = r.recommenderUserId
         WHERE r.projectId = @pid
           AND r.recommenderUserId IS NOT NULL
           AND (${areaWhere})
           AND r.recommenderUserId != @owner`
      )
      .all({ ...areaParams, pid: id, owner: updated.ownerUserId })
      .map((r) => r.uid);

    const targets = Array.from(new Set([...areaUsers, ...recUsers]));
    if (targets.length) {
      notifyUsers(db, targets, {
        type: "project_live_local",
        message: `A new project “${updated.name}” in your area is now live`,
        projectId: id,
        linkPath: `/projects/${id}`,
      });
    }
  })
);

/* -------------------- Notifications API & SSE -------------------- */

// SSE with token (EventSource can’t send headers in all browsers; we accept ?token=)
app.get("/api/notifications/stream", async (req, res) => {
  let token = "";
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) token = auth.slice(7);
  if (!token && typeof req.query.token === "string")
    token = String(req.query.token);

  let uid = null;
  try {
    if (token) {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    }
  } catch (_) {}
  if (!uid) return res.status(401).json({ error: "Missing/invalid token" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");

  let set = clientsByUser.get(uid);
  if (!set) {
    set = new Set();
    clientsByUser.set(uid, set);
  }
  set.add(res);

  const unread = db
    .prepare(
      `SELECT COUNT(*) AS c FROM notifications WHERE userId=? AND readAt IS NULL`
    )
    .get(uid).c;

  const latest = db
    .prepare(
      `SELECT id, type, message, projectId, linkPath, createdAt, readAt
       FROM notifications
      WHERE userId=?
      ORDER BY createdAt DESC
      LIMIT 5`
    )
    .all(uid);

  sseSend(res, "bootstrap", { unread, latest });

  const ping = setInterval(() => res.write(": keepalive\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    set.delete(res);
  });
});

// List / mark read
app.get(
  "/api/notifications",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const items = db
      .prepare(
        `SELECT id, type, message, projectId, linkPath, createdAt, readAt
         FROM notifications
        WHERE userId=?
        ORDER BY createdAt DESC
        LIMIT 50`
      )
      .all(uid);
    const unread = items.filter((i) => !i.readAt).length;
    res.json({ items, unread });
  })
);

app.post(
  "/api/notifications/:id/read",
  ...authed((req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const row = db
      .prepare(`SELECT userId FROM notifications WHERE id=?`)
      .get(id);
    if (!row || row.userId !== req.user.uid)
      return res.status(404).json({ error: "Not found" });
    db.prepare(`UPDATE notifications SET readAt=? WHERE id=?`).run(
      new Date().toISOString(),
      id
    );
    res.json({ ok: true });
  })
);

app.post(
  "/api/notifications/read-all",
  ...authed((req, res) => {
    db.prepare(
      `UPDATE notifications SET readAt=? WHERE userId=? AND readAt IS NULL`
    ).run(new Date().toISOString(), req.user.uid);
    res.json({ ok: true });
  })
);

/* -------------------- Voting (likes) -------------------- */

// POST /api/recommendations/:id/like  (one like per user; no unlike)
app.post(
  "/api/recommendations/:id/like",
  ...authed((req, res) => {
    const userId = req.user.uid;
    const recId = Number(req.params.id);
    if (!Number.isFinite(recId))
      return res.status(400).json({ error: "Bad id" });

    const rec = db
      .prepare(`SELECT id, projectId FROM recommendations WHERE id=?`)
      .get(recId);
    if (!rec)
      return res.status(404).json({ error: "Recommendation not found" });

    const proj = db
      .prepare(`SELECT ownerUserId FROM projects WHERE id=?`)
      .get(rec.projectId);
    if (!proj) return res.status(404).json({ error: "Project not found" });
    if (proj.ownerUserId === userId)
      return res.status(403).json({ error: "Owner cannot like" });

    // Insert once; if already liked, do nothing (no unlike)
    db.prepare(
      `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value) VALUES (?, ?, 1)`
    ).run(recId, userId);

    const row = db
      .prepare(
        `SELECT COUNT(*) AS likes FROM recommendation_votes WHERE recommendationId = ? AND value = 1`
      )
      .get(recId);
    const myLike = !!db
      .prepare(
        `SELECT 1 FROM recommendation_votes WHERE recommendationId = ? AND userId = ? LIMIT 1`
      )
      .get(recId, userId);

    res.json({
      ok: true,
      recommendationId: recId,
      likes: row.likes || 0,
      myLike,
    });
  })
);

/* -------------------- Recommendations (join users, not user_profiles) -------------------- */

app.get(
  "/api/projects/:id/recommendations",
  ...authed((req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const proj = db
      .prepare(`SELECT ownerUserId, status, location FROM projects WHERE id=?`)
      .get(id);
    if (!proj) return res.status(404).json({ error: "Not found" });
    const pTok = extractLocationTokens(proj.location);

    const uid = req.user?.uid || null;
    const isOwner = uid && uid === proj.ownerUserId;
    const isLive = (proj.status || "").toLowerCase() === "live";

    let allowed = !!isOwner;
    if (!allowed) {
      if (isLive) allowed = !!uid;
      else {
        const hasRec = db
          .prepare(
            `SELECT 1 FROM recommendations WHERE projectId = ? AND recommenderUserId = ? LIMIT 1`
          )
          .get(id, uid);
        if (hasRec) allowed = true;
      }
    }
    if (!allowed) return res.status(403).json({ error: "Forbidden" });

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.max(
      1,
      Math.min(50, parseInt(String(req.query.pageSize ?? "10"), 10))
    );
    const offset = (page - 1) * pageSize;

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM recommendations WHERE projectId = ?`)
      .get(id);

    // ✅ Join the *users* table (not user_profiles) to access location fields
    const raw = db
      .prepare(
        `
        SELECT
          r.id, r.name, r.email, r.phone, r.company, r.comment, r.isAnonymous, r.createdAt, r.source,
          r.recommenderUserId,
          r.rating,
          u.postcode        AS u_postcode,
          u.postcodeSector  AS u_sector,
          u.postcodeOutward AS u_outward,
          u.city            AS u_city,
          COALESCE(v.likes, 0) AS likes,
          CASE WHEN mv.userId IS NULL THEN 0 ELSE 1 END AS myLike
        FROM recommendations r
        LEFT JOIN (
          SELECT recommendationId, COUNT(*) AS likes
          FROM recommendation_votes
          WHERE value = 1
          GROUP BY recommendationId
        ) v ON v.recommendationId = r.id
        LEFT JOIN recommendation_votes mv
          ON mv.recommendationId = r.id AND mv.userId = ?
        LEFT JOIN users u
          ON u.uid = r.recommenderUserId
        WHERE r.projectId = ?
        ORDER BY likes DESC, r.createdAt DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(uid || "", id, pageSize, offset);

    function communityMatch(row) {
      if (!row.recommenderUserId) return 0;
      return Number(
        (pTok.full && row.u_postcode === pTok.full) ||
          (pTok.sector && row.u_sector === pTok.sector) ||
          (pTok.outward && row.u_outward === pTok.outward) ||
          (pTok.city &&
            row.u_city &&
            String(row.u_city).toLowerCase() ===
              String(pTok.city || "").toLowerCase())
      );
    }

    const items = raw.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone == null ? null : String(r.phone),
      company: r.company,
      comment: r.comment,
      isAnonymous: r.isAnonymous,
      createdAt: r.createdAt,
      fromFriend:
        String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
      fromCommunity: communityMatch(r),
      likes: r.likes,
      myLike: r.myLike ? 1 : 0,
      rating: r.rating ?? null,
    }));

    res.json({ items, total: totalRow.c || 0, page, pageSize });
  })
);

app.post(
  "/api/projects/:id/recommendations",
  ...authed((req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      upload.array("photos", 8)(req, res, (err) => {
        if (err)
          return res
            .status(400)
            .json({ error: err.message || "Upload failed" });
        next();
      });
    } else {
      next();
    }
  }),
  (req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId))
      return res.status(400).json({ error: "Invalid id" });

    const asNumber = (v) =>
      v === undefined || v === null || v === "" ? undefined : Number(v);
    const payload = {
      name: String(req.body?.name ?? "").trim(),
      email: String(req.body?.email ?? "").trim() || undefined,
      phone: String(req.body?.phone ?? "").trim() || undefined,
      company: String(req.body?.company ?? "").trim(),
      rating: asNumber(req.body?.rating) ?? 5,
      comment: String(req.body?.comment ?? "").trim(),
    };

    const parsed = RecSchema.safeParse(payload);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const { name, email, phone, company, rating, comment } = parsed.data;
    const now = new Date().toISOString();
    const uid = req.user?.uid ?? null;

    // Allow caller to hint the source. We only recognize "magic".
    const rawSource = String(req.body?.source ?? "")
      .trim()
      .toLowerCase();
    const source = rawSource === "magic" ? "magic" : "platform";

    const info = db
      .prepare(
        `INSERT INTO recommendations
         (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
         VALUES
         (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, 0, @source)`
      )
      .run({
        projectId,
        uid,
        createdAt: now,
        name,
        email: email ?? null,
        phone: cleanPhone(phone),
        company,
        rating,
        comment,
        source,
      });

    const recommendationId = info.lastInsertRowid;

    // --- Auto-like by the recommender (unless they are the owner) ---
    try {
      if (uid) {
        const ownerRow = db
          .prepare(`SELECT ownerUserId FROM projects WHERE id=?`)
          .get(projectId);
        if (!ownerRow || ownerRow.ownerUserId !== uid) {
          // one like per user; ignore if already exists
          db.prepare(
            `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
             VALUES (?, ?, 1)`
          ).run(recommendationId, uid);
        }
      }
    } catch (e) {
      // don’t fail the main request if this write flakes
      console.warn("[recommendation auto-like] failed", e);
    }
    // --- End auto-like ---

    // photos
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length) {
      const stmt = db.prepare(
        `INSERT INTO recommendation_photos (recommendationId, filePath, mime, sizeBytes, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const f of files) {
        const rel = path.relative(UPLOAD_DIR, f.path).split(path.sep).join("/");
        stmt.run(recommendationId, `/uploads/${rel}`, f.mimetype, f.size, now);
      }
    }

    /* Notify project owner */
    try {
      const ownerRow = db
        .prepare(`SELECT ownerUserId, name FROM projects WHERE id=?`)
        .get(projectId);

      if (ownerRow && ownerRow.ownerUserId && ownerRow.ownerUserId !== uid) {
        notifyUsers(db, [ownerRow.ownerUserId], {
          type: "recommendation_new",
          message: `Someone has recommended a tradesperson to your project “${ownerRow.name}”`,
          projectId,
          linkPath: `/builders/${recommendationId}`,
        });
      }
    } catch (e) {
      console.warn("[notify-owner platform] failed", e);
    }

    return res.status(201).json({ ok: true, recommendationId });
  }
);

app.get("/api/recommendations/:id", optionalAuth(admin), (req, res) => {
  const recId = Number(req.params.id);
  if (!Number.isFinite(recId))
    return res.status(400).json({ error: "Invalid id" });

  const row = db
    .prepare(
      `
    SELECT r.*, p.id AS projectId, p.name AS projectName, p.ownerUserId, p.status AS projectStatus,
      COALESCE((
        SELECT COUNT(*) FROM recommendation_votes v
        WHERE v.recommendationId = r.id AND v.value = 1
      ), 0) AS likes
    FROM recommendations r
    JOIN projects p ON p.id = r.projectId
    WHERE r.id = ?
  `
    )
    .get(recId);

  if (!row) return res.status(404).json({ error: "Not found" });

  const uid = req.user?.uid || null;
  const isOwner = uid && uid === row.ownerUserId;
  const isLive = String(row.projectStatus || "").toLowerCase() === "live";

  // Access rules: if project is live -> anyone can read; otherwise owner or the recommender may read.
  if (!isLive) {
    const isRecommender = uid && uid === row.recommenderUserId;
    if (!isOwner && !isRecommender)
      return res.status(403).json({ error: "Forbidden" });
  }

  // myLike
  const myLike = uid
    ? db
        .prepare(
          `SELECT 1 FROM recommendation_votes WHERE recommendationId = ? AND userId = ? AND value = 1`
        )
        .get(recId, uid)
      ? 1
      : 0
    : 0;

  // Photos → build absolute URLs so Next (port 3000) can load from API (port 8787)
  const photoRows = db
    .prepare(
      `SELECT id, filePath AS fp, mime
       FROM recommendation_photos
       WHERE recommendationId = ?
       ORDER BY id ASC`
    )
    .all(recId);

  const photos = photoRows.map((p) => {
    const abs = new URL(p.fp, PUBLIC_API_BASE).toString();
    return { id: String(p.id), url: abs, thumb: abs };
  });

  const recommendation = {
    id: row.id,
    company: row.company,
    comment: row.comment,
    createdAt: row.createdAt,
    name: row.name,
    email: row.email,
    phone: row.phone == null ? null : String(row.phone),
    isAnonymous: row.isAnonymous,
    likes: row.likes,
    myLike,
    rating: row.rating ?? null,
    fromFriend: String(row.source || "").toLowerCase() === "magic" ? 1 : 0,
    fromCommunity:
      String(row.source || "").toLowerCase() === "community" ? 1 : 0,
    photos,
    project: { id: row.projectId, name: row.projectName },
  };

  res.json({ recommendation });
});

/* -------------------- Test-only endpoints -------------------- */

app.post("/api/__test__/db/clear", (req, res) => {
  if (assertTestAccess(req, res) !== true) return;
  wipeAllRows(db);
  res.json({ ok: true });
});

app.post("/api/__test__/users", async (req, res) => {
  if (assertTestAccess(req, res) !== true) return;

  try {
    const {
      uid: incomingUid,
      email,
      password,
      firstName,
      lastName,
      username,
      location = "",
    } = req.body || {};

    if (!email || typeof email !== "string")
      return res.status(400).json({ error: "email is required" });

    let uid = incomingUid;
    if (!uid && admin?.apps?.length && password) {
      try {
        const userRec = await admin.auth().createUser({
          email,
          password,
          emailVerified: true,
        });
        uid = userRec.uid;
      } catch (e) {
        try {
          const existing = await admin.auth().getUserByEmail(email);
          uid = existing.uid;
        } catch (_) {
          console.warn(
            "[test users] Firebase create/get failed",
            e?.message || e
          );
        }
      }
    }
    if (!uid) uid = crypto.randomBytes(16).toString("base64url");

    const now = new Date().toISOString();
    const t = extractLocationTokens(location);

    db.prepare(
      `INSERT INTO users
         (uid, email, createdAt, firstName, lastName, username,
          locationRaw, postcode, postcodeSector, postcodeOutward, city)
       VALUES
         (@uid, @email, @createdAt, @firstName, @lastName, @username,
          @raw, @full, @sector, @outward, @city)
       ON CONFLICT(uid) DO UPDATE SET
         email=excluded.email,
         firstName=excluded.firstName,
         lastName=excluded.lastName,
         username=excluded.username,
         locationRaw=excluded.locationRaw,
         postcode=excluded.postcode,
         postcodeSector=excluded.postcodeSector,
         postcodeOutward=excluded.postcodeOutward,
         city=excluded.city`
    ).run({
      uid,
      email,
      createdAt: now,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      username: username ?? null,
      raw: t.raw,
      full: t.full,
      sector: t.sector,
      outward: t.outward,
      city: t.city,
    });

    res.status(201).json({
      ok: true,
      uid,
      email,
      createdFirebase: Boolean(password && admin?.apps?.length),
    });
  } catch (e) {
    console.error("[test users] create error", e);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/api/__test__/auth/custom-token", async (req, res) => {
  if (assertTestAccess(req, res) !== true) return;

  const uid = String(req.body?.uid || "").trim();
  if (!uid) return res.status(400).json({ error: "uid required" });

  if (!admin?.apps?.length) {
    return res.status(503).json({ error: "firebase admin not initialised" });
  }

  try {
    const token = await admin.auth().createCustomToken(uid);
    res.json({ ok: true, token });
  } catch (e) {
    console.error("[test] custom-token error", e);
    res.status(500).json({ error: "failed to mint token" });
  }
});

// In server/index.js (test-only):
app.post("/api/__test__/auth/id-token", async (req, res) => {
  if (assertTestAccess(req, res) !== true) return;
  try {
    const uid = String(req.body?.uid || "").trim();
    if (!uid) return res.status(400).json({ error: "uid required" });
    if (!admin?.apps?.length)
      return res.status(503).json({ error: "firebase admin not initialised" });

    const apiKey = resolveFirebaseApiKey?.() || process.env.FIREBASE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing Web API key" });

    // 1) Custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // 2) Exchange for ID token via REST
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(500).json({ error: "exchange failed", details: data });
    }

    res.json({ ok: true, idToken: data.idToken });
  } catch (e) {
    console.error("[test] id-token error", e);
    res.status(500).json({ error: "failed to mint id token" });
  }
});

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
