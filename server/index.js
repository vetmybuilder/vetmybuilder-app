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

const app = express();
const PORT = process.env.PORT || 8787;

app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
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
    stmt.run(
      uid,
      payload.type,
      payload.message,
      payload.projectId,
      payload.linkPath,
      now
    );
    const bucket = clientsByUser.get(uid);
    if (bucket) {
      for (const res of bucket)
        sseSend(res, "notification", { ...payload, createdAt: now });
    }
  }
}

/* -------------------- Location helpers -------------------- */
// Tiny UK postcode / city tokeniser used for “local” notifications.
function extractLocationTokens(raw) {
  const s = String(raw || "").trim();
  if (!s)
    return { full: null, sector: null, outward: null, city: null, raw: "" };

  const m = s.toUpperCase().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})$/);
  if (m) {
    const outward = m[1];
    const inward = m[2];
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward[0]}`; // e.g., "E4 6"
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

app.get("/health", (_req, res) =>
  res.json({ ok: true, now: new Date().toISOString() })
);

/* -------------------- Public stats (for homepage) -------------------- */

// cache user count for 5 minutes to avoid hammering Admin API
let __userCountCache = { value: 0, fetchedAt: 0 };

async function countAllFirebaseUsers(admin) {
  // Return cached value if it's fresh
  const now = Date.now();
  if (
    now - __userCountCache.fetchedAt < 5 * 60 * 1000 &&
    __userCountCache.fetchedAt
  ) {
    return __userCountCache.value;
  }

  let nextPageToken = undefined;
  let total = 0;
  do {
    const res = await admin.auth().listUsers(1000, nextPageToken);
    total += res.users.length;
    nextPageToken = res.pageToken;
  } while (nextPageToken);

  __userCountCache = { value: total, fetchedAt: Date.now() };
  return total;
}

// Returns: { communityMembers, recommendations, shortlists }
app.get("/api/stats/public", async (_req, res) => {
  try {
    // 1) total Firebase users (community members)
    const communityMembers = admin.apps.length
      ? await countAllFirebaseUsers(admin)
      : 0;

    // 2) total recommendations (from DB)
    const recommendations =
      db.prepare(`SELECT COUNT(*) AS c FROM recommendations`).get().c || 0;

    // 3) "shortlists created" = number of distinct projects that have at least 1 recommendation
    const shortlists =
      db
        .prepare(`SELECT COUNT(DISTINCT projectId) AS c FROM recommendations`)
        .get().c || 0;

    res.json({ communityMembers, recommendations, shortlists });
  } catch (e) {
    console.error("stats error", e);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

/* -------------------- Validation -------------------- */

const ProjectSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.string().min(2).max(80),
  location: z.string().min(2).max(120),
  description: z.string().min(2).max(2000),
  propertyType: z.string().min(2).max(80),
  bedrooms: z.number().int().min(0).max(20),
});

const RecSchema = z.object({
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
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(2000),
});

// --- phone helper (very light) ---
function cleanPhone(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // keep + and digits; strip spaces/dashes/brackets
  const compact = s.replace(/[^\d+]/g, "");
  return compact || null;
}

/* -------------------- Projects CRUD -------------------- */

// Create (default pending)
app.post("/api/projects", authMiddleware(admin), (req, res) => {
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
});

// List (filters + pagination consolidated)
app.get("/api/projects", authMiddleware(admin), (req, res) => {
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
});

app.get("/api/me", authMiddleware(admin), (req, res) => {
  res.json({ uid: req.user.uid, email: req.user.email || null });
});

/* -------------------- Profile (location) -------------------- */

// Get my profile
app.get("/api/profile", authMiddleware(admin), (req, res) => {
  const uid = req.user.uid;
  const row = db
    .prepare(
      `SELECT userId, locationRaw, postcode, postcodeSector, postcodeOutward, city, updatedAt
       FROM user_profiles WHERE userId=?`
    )
    .get(uid);
  res.json({ profile: row || null });
});

// Update my location (body: { location: string })
app.post("/api/profile", authMiddleware(admin), (req, res) => {
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
});

/* -------------------- Publish + local notifications -------------------- */

app.post("/api/projects/:id/publish", authMiddleware(admin), (req, res) => {
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

  // Target local users (profile area match) + logged-in recommenders in the same area (exclude owner)
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
});

/* -------------------- Read / Update / Archive -------------------- */

// IMPORTANT: optionalAuth here so LIVE projects can be read without a token.
// If no/invalid token and the project is not live, you’ll get 401.
app.get("/api/projects/:id", optionalAuth(admin), (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  if (!project) return res.status(404).json({ error: "Not found" });

  if (!req.user) {
    // no token — allow read only if live
    if ((project.status || "").toLowerCase() !== "live") {
      return res.status(401).json({ error: "Missing bearer token" });
    }
  }
  res.json({ project });
});

app.put("/api/projects/:id", authMiddleware(admin), (req, res) => {
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
});

app.post("/api/projects/:id/close", authMiddleware(admin), (req, res) => {
  req.url = req.url.replace("/close", "/archive");
  return app._router.handle(req, res);
});

app.post("/api/projects/:id/archive", authMiddleware(admin), (req, res) => {
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
});

app.post("/api/projects/:id/unarchive", authMiddleware(admin), (req, res) => {
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
});

/* -------------------- Magic links & recommendations -------------------- */

// Magic link (owner only; LIVE only)
app.post("/api/projects/:id/magic-link", authMiddleware(admin), (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  if (!project) return res.status(404).json({ error: "Not found" });
  if (project.ownerUserId !== req.user.uid)
    return res.status(403).json({ error: "Forbidden" });

  if ((project.status || "").toLowerCase() !== "live") {
    return res
      .status(400)
      .json({ error: "Project must be live before inviting recommendations." });
  }

  let link = db
    .prepare(`SELECT * FROM recommendation_links WHERE projectId = ?`)
    .get(id);
  if (!link) {
    const token = crypto.randomBytes(24).toString("base64url");
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO recommendation_links (projectId, token, createdAt) VALUES (?, ?, ?)`
      )
      .run(id, token, now);
    link = db
      .prepare(`SELECT * FROM recommendation_links WHERE id = ?`)
      .get(info.lastInsertRowid);
  }

  const base = process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000";
  res.json({
    url: `${base}/r/${link.token}`,
    token: link.token,
    projectId: id,
  });
});

// Resolve magic link (public; LIVE only)
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

// Submit recommendation (public; LIVE only)
app.post(
  "/api/recommendations/magic/:token",
  optionalAuth(admin),
  (req, res) => {
    const { token } = req.params;
    const link = db
      .prepare(`SELECT * FROM recommendation_links WHERE token = ?`)
      .get(token);
    if (!link) return res.status(404).json({ error: "Invalid link" });

    const proj = db
      .prepare(`SELECT status FROM projects WHERE id = ?`)
      .get(link.projectId);
    if (!proj || (proj.status || "").toLowerCase() !== "live") {
      return res
        .status(400)
        .json({ error: "This project is not accepting recommendations yet." });
    }

    const parsed = RecSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const { name, email, phone, company, rating, comment } = parsed.data;
    const now = new Date().toISOString();
    const uid = req.user?.uid ?? null;
    const isAnonymous = uid ? 0 : 1;

    db.prepare(
      `INSERT INTO recommendations
      (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
     VALUES
      (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, @isAnonymous, 'magic')`
    ).run({
      projectId: link.projectId,
      uid,
      createdAt: now,
      name,
      email: email ?? null,
      phone: cleanPhone(phone),
      company,
      rating,
      comment,
      isAnonymous,
    });

    return res.status(201).json({ ok: true });
  }
);

// Shortlist access
app.get(
  "/api/projects/:id/recommendations",
  authMiddleware(admin),
  (req, res) => {
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

    const raw = db
      .prepare(
        `SELECT r.id, r.name, r.email, r.company, r.rating, r.comment, r.isAnonymous, r.createdAt, r.source,
            r.recommenderUserId,
            up.postcode AS up_postcode,
            up.postcodeSector AS up_sector,
            up.postcodeOutward AS up_outward,
            up.city AS up_city
       FROM recommendations r
  LEFT JOIN user_profiles up ON up.userId = r.recommenderUserId
      WHERE r.projectId = ?
   ORDER BY r.createdAt DESC
      LIMIT ? OFFSET ?`
      )
      .all(id, pageSize, offset);

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
      company: r.company,
      rating: r.rating,
      comment: r.comment,
      isAnonymous: r.isAnonymous,
      createdAt: r.createdAt,
      fromFriend: String(r.source || "magic") === "magic" ? 1 : 0,
      fromCommunity: communityMatch(r),
    }));

    res.json({ items, total: totalRow.c || 0, page, pageSize });
  }
);

// Logged-in platform submission (no magic link) – location must match
app.post(
  "/api/projects/:id/recommendations",
  authMiddleware(admin),
  (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const proj = db
      .prepare(`SELECT id, name, location, status FROM projects WHERE id=?`)
      .get(id);
    if (!proj) return res.status(404).json({ error: "Not found" });
    if ((proj.status || "").toLowerCase() !== "live") {
      return res.status(400).json({ error: "Project is not live." });
    }

    const parsed = RecSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const me = db
      .prepare(`SELECT * FROM user_profiles WHERE userId=?`)
      .get(req.user.uid);
    const pTok = extractLocationTokens(proj.location);
    const match =
      (pTok.full && me?.postcode === pTok.full) ||
      (pTok.sector && me?.postcodeSector === pTok.sector) ||
      (pTok.outward && me?.postcodeOutward === pTok.outward) ||
      (pTok.city &&
        me?.city &&
        me.city.toLowerCase() === pTok.city.toLowerCase());

    if (!match) {
      return res.status(403).json({
        error: "You can only recommend builders for projects in your area.",
      });
    }

    const { name, email, phone, company, rating, comment } = parsed.data;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO recommendations
      (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
     VALUES
      (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, 0, 'platform')`
    ).run({
      projectId: id,
      uid: req.user.uid,
      createdAt: now,
      name,
      email: email ?? null,
      phone: cleanPhone(phone),
      company,
      rating,
      comment,
    });

    res.status(201).json({ ok: true });
  }
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
app.get("/api/notifications", authMiddleware(admin), (req, res) => {
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
});

app.post("/api/notifications/:id/read", authMiddleware(admin), (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const row = db.prepare(`SELECT userId FROM notifications WHERE id=?`).get(id);
  if (!row || row.userId !== req.user.uid)
    return res.status(404).json({ error: "Not found" });
  db.prepare(`UPDATE notifications SET readAt=? WHERE id=?`).run(
    new Date().toISOString(),
    id
  );
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", authMiddleware(admin), (req, res) => {
  db.prepare(
    `UPDATE notifications SET readAt=? WHERE userId=? AND readAt IS NULL`
  ).run(new Date().toISOString(), req.user.uid);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
