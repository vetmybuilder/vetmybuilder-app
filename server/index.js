/* Express API for Vetmybuilder v1 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { initDb } = require("./lib/db");
const { runMigrations } = require("./lib/migrate");
const { authMiddleware } = require("./lib/middleware");
const { z } = require("zod");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
app.set("trust proxy", true);
app.set("etag", false);
const PORT = process.env.PORT || 8787;

// Public API origin used to build absolute file URLs for images
const PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || `http://localhost:${PORT}`;

app.use(cors());
app.options("*", cors());
app.use(express.json());

/* -------------------- SSE hub -------------------- */

const clientsByUser = new Map(); // Map<uid, Set<res>>

function sseSend(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function notifyUsers(db, userIds, payload) {
  if (!userIds || !userIds.length) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const uid of new Set(userIds)) {
    const info = stmt.run(
      uid,
      payload.type,
      payload.message,
      payload.projectId ?? null,
      payload.linkPath ?? null,
      now
    );
    const insertedId = info.lastInsertRowid;
    const bucket = clientsByUser.get(uid);
    if (bucket) {
      for (const res of bucket) {
        sseSend(res, "notification", {
          id: Number(insertedId),
          ...payload,
          projectId: payload.projectId ?? null,
          linkPath: payload.linkPath ?? null,
          createdAt: now,
        });
      }
    }
  }
}

/* -------------------- Location helpers -------------------- */
function extractLocationTokens(raw) {
  const s = String(raw || "").trim();
  if (!s)
    return { full: null, sector: null, outward: null, city: null, raw: "" };

  const m = s.toUpperCase().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/);
  if (m) {
    const outward = m[1];
    const inward = m[2];
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward[0]}`;
    return { full, sector, outward, city: null, raw: s };
  }
  return {
    full: null,
    sector: null,
    outward: null,
    city: s.toLowerCase(),
    raw: s,
  };
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

function optionalAuth(admin) {
  return async (req, _res, next) => {
    try {
      const h = req.headers?.authorization || "";
      if (h.startsWith("Bearer ")) {
        const token = h.slice(7);
        const decoded = await admin.auth().verifyIdToken(token);
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

// Ensure users table exists & backfill if empty
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
    __USERS_PK_COL = found || "id"; // default if newly migrated
  } catch {
    __USERS_PK_COL = "id";
  }
  return __USERS_PK_COL;
}

/* -------------------- Uploads (photos) -------------------- */

// Serve uploaded files
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", index: false }));

// Ensure photos table (defensive, in case migration hasn't run)
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
  // base
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT,
      createdAt TEXT NOT NULL,
      firstName TEXT,
      lastName TEXT,
      username TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_users_createdAt ON users(createdAt);
  `);
  // add missing columns safely for older DBs
  try {
    db.exec(`ALTER TABLE users ADD COLUMN firstName TEXT;`);
  } catch (_) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN lastName TEXT;`);
  } catch (_) {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN username TEXT;`);
  } catch (_) {}
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

// Middleware to run AFTER authMiddleware(admin)
function touchUser(db) {
  return (req, _res, next) => {
    if (req.user?.uid) {
      touchUserRow(db, { uid: req.user.uid, email: req.user.email });
    }
    next();
  };
}

// Convenience: apply auth + user upsert
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

    // 👇 important when hitting cross-origin in dev/prod
    res.set("Access-Control-Allow-Origin", "*");

    // prevent 304 / stale bodies
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

// Accepts either rating (1–5) or hireAgain ("yes" | "no"); rating is coerced.
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

/* -------------------- Account (names) -------------------- */

// GET current account
app.get(
  "/api/account",
  ...authed((req, res) => {
    const uid = req.user.uid;

    const user =
      db
        .prepare(
          `SELECT uid, email, firstName, lastName, username
       FROM users
      WHERE uid = ?`
        )
        .get(uid) || null;

    const profile =
      db
        .prepare(
          `SELECT userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt
       FROM user_profiles
      WHERE userId = ?`
        )
        .get(uid) || null;

    res.json({ user, profile });
  })
);

// POST update editable fields (first/last/location)
app.post(
  "/api/account",
  ...authed((req, res) => {
    const uid = req.user.uid;

    const firstName = (req.body?.firstName ?? "").toString().trim() || null;
    const lastName = (req.body?.lastName ?? "").toString().trim() || null;
    const username = (req.body?.username ?? "").toString().trim() || null;
    const location = (req.body?.location ?? "").toString();

    // enforce username uniqueness if provided
    if (username) {
      const taken = db
        .prepare(`SELECT 1 FROM users WHERE username = ? AND uid <> ?`)
        .get(username, uid);
      if (taken)
        return res
          .status(409)
          .json({ error: "That username is already taken." });
    }

    // keep existing email/createdAt if row exists
    const existing = db
      .prepare(`SELECT email, createdAt FROM users WHERE uid = ?`)
      .get(uid);

    const now = new Date().toISOString();

    // upsert users by uid
    db.prepare(
      `INSERT INTO users (uid, email, createdAt, firstName, lastName, username)
     VALUES (@uid, @email, @createdAt, @firstName, @lastName, @username)
     ON CONFLICT(uid) DO UPDATE SET
       firstName = excluded.firstName,
       lastName  = excluded.lastName,
       username  = excluded.username`
    ).run({
      uid,
      email: existing?.email ?? null,
      createdAt: existing?.createdAt ?? now,
      firstName,
      lastName,
      username,
    });

    // upsert profile/location
    const t = extractLocationTokens(location);
    db.prepare(
      `INSERT INTO user_profiles
       (userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt)
     VALUES (@userId, @raw, @full, @sector, @outward, @city, @updatedAt)
     ON CONFLICT(userId) DO UPDATE SET
       locationRaw     = excluded.locationRaw,
       postcode        = excluded.postcode,
       postcodeSector  = excluded.postcodeSector,
       postcodeOutward = excluded.postcodeOutward,
       city            = excluded.city,
       updatedAt       = excluded.updatedAt`
    ).run({
      userId: uid,
      raw: t.raw,
      full: t.full,
      sector: t.sector,
      outward: t.outward,
      city: t.city,
      updatedAt: now,
    });

    res.json({ ok: true });
  })
);

/* -------------------- Projects CRUD -------------------- */

// Create (default pending)
app.post(
  "/api/projects",
  ...authed((req, res) => {
    const CreateProjectSchema = ProjectSchema.extend({
      bedrooms: z.coerce.number().int().min(0).max(20),
    });

    const data = {
      name: String(req.body?.name ?? "").trim(),
      type: String(req.body?.type ?? "").trim(),
      location: String(req.body?.location ?? "").trim(),
      description: String(req.body?.description ?? "").trim(),
      propertyType: String(req.body?.propertyType ?? "").trim(),
      bedrooms: req.body?.bedrooms,
    };

    const parsed = CreateProjectSchema.safeParse(data);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const now = new Date().toISOString();
    const ownerUserId = req.user.uid;

    const info = db
      .prepare(
        `INSERT INTO projects
         (name, type, location, description, propertyType, bedrooms, ownerUserId, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      )
      .run(
        parsed.data.name,
        parsed.data.type,
        parsed.data.location,
        parsed.data.description,
        parsed.data.propertyType,
        parsed.data.bedrooms,
        ownerUserId,
        now
      );

    const project = db
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(info.lastInsertRowid);
    res.json({ project });
  })
);

// List (filters + pagination consolidated)
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

app.get(
  "/api/me",
  ...authed((req, res) => {
    res.json({ uid: req.user.uid, email: req.user.email || null });
  })
);

/* -------------------- Profile (location) -------------------- */

// Get my profile
app.get(
  "/api/profile",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const row = db
      .prepare(
        `SELECT userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt
         FROM user_profiles WHERE userId=?`
      )
      .get(uid);
    res.json({ profile: row || null });
  })
);

// Update my location (body: { location: string })
app.post(
  "/api/profile",
  ...authed((req, res) => {
    const uid = req.user.uid;
    const loc = String(req.body?.location ?? "").trim();
    const t = extractLocationTokens(loc);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO user_profiles (userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt)
       VALUES (@userId, @raw, @full, @sector, @outward, @city, @updatedAt)
       ON CONFLICT(userId) DO UPDATE SET
         locationRaw=excluded.locationRaw,
         postcode=excluded.postcode,
         postcodeSector=excluded.postcodeSector,
         postcodeOutward=excluded.postcodeOutward,
         city=excluded.city,
         updatedAt=excluded.updatedAt`
    ).run({
      userId: uid,
      raw: t.raw,
      full: t.full,
      sector: t.sector,
      outward: t.outward,
      city: t.city,
      updatedAt: now,
    });

    const row = db
      .prepare(
        `SELECT userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt
         FROM user_profiles WHERE userId=?`
      )
      .get(uid);

    res.json({ profile: row });
  })
);

/* -------------------- Publish + local notifications -------------------- */

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
    if (status === "live") return res.json({ project: existing }); // already live — do nothing

    db.prepare(`UPDATE projects SET status='live' WHERE id=?`).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    res.json({ project: updated });

    // Target local users...
    const locTokens = extractLocationTokens(updated.location);
    const whereParts = [];
    const areaParams = {};
    if (locTokens.full) {
      whereParts.push("up.postcode = @full");
      areaParams.full = locTokens.full;
    }
    if (locTokens.sector) {
      whereParts.push("up.postcodeSector = @sector");
      areaParams.sector = locTokens.sector;
    }
    if (locTokens.outward) {
      whereParts.push("up.postcodeOutward = @outward");
      areaParams.outward = locTokens.outward;
    }
    if (locTokens.city) {
      whereParts.push("up.city = @city");
      areaParams.city = locTokens.city.toLowerCase();
    }
    if (!whereParts.length) return;

    const areaWhere = whereParts.join(" OR ");

    const areaUsers = db
      .prepare(
        `SELECT up.userId AS uid
         FROM user_profiles up
        WHERE (${areaWhere}) AND up.userId != @owner`
      )
      .all({ ...areaParams, owner: updated.ownerUserId })
      .map((r) => r.uid);

    const recUsers = db
      .prepare(
        `SELECT DISTINCT r.recommenderUserId AS uid
         FROM recommendations r
         JOIN user_profiles up ON up.userId = r.recommenderUserId
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

/* -------------------- Read / Update / Archive -------------------- */

// IMPORTANT: optionalAuth here so LIVE projects can be read without a token.
// ...
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

app.put(
  "/api/projects/:id",
  ...authed((req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.ownerUserId !== req.user.uid)
      return res.status(403).json({ error: "Forbidden" });

    const parse = ProjectSchema.partial().safeParse(req.body);
    if (!parse.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parse.error.issues });
    }

    const f = { ...existing, ...parse.data };
    db.prepare(
      `UPDATE projects
          SET name=?, type=?, location=?, description=?, propertyType=?, bedrooms=?
        WHERE id=?`
    ).run(
      f.name,
      f.type,
      f.location,
      f.description,
      f.propertyType,
      f.bedrooms,
      id
    );

    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    res.json({ project: updated });
  })
);

app.post("/api/projects/:id/close", (req, res) => {
  req.url = req.url.replace("/close", "/archive");
  return app._router.handle(req, res);
});

app.post(
  "/api/projects/:id/archive",
  ...authed((req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.ownerUserId !== req.user.uid)
      return res.status(403).json({ error: "Forbidden" });

    if (existing.status === "archived") return res.json({ project: existing });

    db.prepare(
      `UPDATE projects SET status='archived', archivedAt=? WHERE id=?`
    ).run(new Date().toISOString(), id);

    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    res.json({ project: updated });
  })
);

app.post(
  "/api/projects/:id/unarchive",
  ...authed((req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.ownerUserId !== req.user.uid)
      return res.status(403).json({ error: "Forbidden" });

    if (existing.status !== "archived") {
      return res
        .status(400)
        .json({ error: "Only archived projects can be unarchived." });
    }

    db.prepare(
      `UPDATE projects SET status='pending', archivedAt=NULL WHERE id=?`
    ).run(id);
    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
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

    // --- Build a public, absolute URL that works in both prod and local ---
    function getWebBase(req) {
      // Prefer reverse-proxy headers (Next.js rewrites, Cloud Run, LB, etc.)
      const xfProto = String(req.headers["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim();
      const xfHost = String(req.headers["x-forwarded-host"] || "")
        .split(",")[0]
        .trim();
      if (xfHost) {
        return `${xfProto || req.protocol || "http"}://${xfHost}`;
      }

      // Direct host (no proxy)
      if (req.headers.host) {
        return `${req.protocol || "http"}://${req.headers.host}`;
      }

      // Explicit env override (set in prod if needed)
      if (process.env.NEXT_PUBLIC_WEB_BASE)
        return process.env.NEXT_PUBLIC_WEB_BASE;

      // Dev fallback
      return "http://localhost:3000";
    }

    const webBase = getWebBase(req);
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

    /* === NEW: notify project owner === */
    try {
      const ownerRow = db
        .prepare(`SELECT ownerUserId, name FROM projects WHERE id=?`)
        .get(link.projectId);

      // For magic links, submitter may be anonymous; never notify self
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
      // non-blocking
    }
    /* === END NEW === */

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
      if (isLive) allowed = !!uid; // any logged-in user on live projects
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

    // include likes + myLike and keep location/profile join; also select phone
    const raw = db
      .prepare(
        `
        SELECT
          r.id, r.name, r.email, r.phone, r.company, r.comment, r.isAnonymous, r.createdAt, r.source,
          r.recommenderUserId,
          r.rating,
          up.postcode AS up_postcode,
          up.postcodeSector AS up_sector,
          up.postcodeOutward AS up_outward,
          up.city AS up_city,
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
        LEFT JOIN user_profiles up ON up.userId = r.recommenderUserId
        WHERE r.projectId = ?
        ORDER BY likes DESC, r.createdAt DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(uid || "", id, pageSize, offset);

    function communityMatch(row) {
      if (!row.recommenderUserId) return 0;
      return Number(
        (pTok.full && row.up_postcode === pTok.full) ||
          (pTok.sector && row.up_sector === pTok.sector) ||
          (pTok.outward && row.up_outward === pTok.outward) ||
          (pTok.city &&
            row.up_city &&
            String(row.up_city).toLowerCase() ===
              String(pTok.city || "").toLowerCase())
      );
    }

    const items = raw.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      comment: r.comment,
      isAnonymous: r.isAnonymous,
      createdAt: r.createdAt,
      fromFriend: String(r.source || "magic") === "magic" ? 1 : 0,
      fromCommunity: communityMatch(r),
      likes: r.likes,
      myLike: r.myLike ? 1 : 0,
      rating: r.rating ?? null,
    }));

    res.json({ items, total: totalRow.c || 0, page, pageSize });
  })
);

/* -------------------- Logged-in recommendation submission -------------- */
/* Canonical endpoint */
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

    const info = db
      .prepare(
        `INSERT INTO recommendations
        (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
       VALUES
        (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, 0, 'platform')`
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
      });

    const recommendationId = info.lastInsertRowid;

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

    /* === Notify project owner (platform) -> open builders/<recommendationId> === */
    try {
      const ownerRow = db
        .prepare(`SELECT ownerUserId, name FROM projects WHERE id=?`)
        .get(projectId);

      if (ownerRow && ownerRow.ownerUserId && ownerRow.ownerUserId !== uid) {
        notifyUsers(db, [ownerRow.ownerUserId], {
          type: "recommendation_new",
          message: `Someone has recommended a tradesperson to your project “${ownerRow.name}”`,
          projectId, // keep for context
          linkPath: `/builders/${recommendationId}`, // <-- go to builder detail
        });
      }
    } catch (e) {
      console.warn("[notify-owner platform] failed", e);
    }

    /* === END NEW === */

    return res.status(201).json({ ok: true, recommendationId });
  }
);

/* Back-compat alias for clients calling /recommend (singular) */
app.post("/api/projects/:id/recommend", (req, res) => {
  req.url = req.url.replace("/recommend", "/recommendations");
  return app._router.handle(req, res);
});

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

// GET /api/recommendations/:id  -> returns one recommendation with likes/myLike and project info (+ photos)
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
    phone: row.phone || null,
    isAnonymous: row.isAnonymous,
    likes: row.likes,
    myLike,
    rating: row.rating ?? null,
    fromFriend: String(row.source || "magic") === "magic" ? 1 : 0,
    fromCommunity: 0,
    photos,
    project: { id: row.projectId, name: row.projectName },
  };

  res.json({ recommendation });
});

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
