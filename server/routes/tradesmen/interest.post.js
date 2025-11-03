/**
 * POST /tradesmen/interest
 * Body: { projectId: number, note?: string }
 * Auth: required (tradesman)
 *
 * Behaviour
 * - Resolves a recommendation id to anchor /builders/:id (via CH number → company name).
 * - If none exists, auto-creates a minimal anonymous recommendation for *this* project.
 * - Persists a one-time share in `tradesman_interests` (UNIQUE projectId+fromUid).
 * - Sends a notification to the project owner with linkPath: `/builders/:recommendationId`.
 */
module.exports = (router, ctx) => {
  const { db, auth, requireTradesman = null, sseSend = null } = ctx;

  ensureInterestsTable(db);
  ensureNotificationsTable(db);

  router.post(
    "/tradesmen/interest",
    auth,
    maybe(requireTradesman),
    (req, res) => {
      try {
        const uid = req.user?.uid;
        const raw = req.body || {};
        const projectId = Number(raw.projectId);
        const note = raw.note ? String(raw.note) : null;

        if (!uid) return res.status(401).json({ error: "Not authenticated" });
        if (!Number.isFinite(projectId))
          return res.status(400).json({ error: "projectId is required" });

        // --- Load project + owner
        const proj = db
          .prepare(
            "SELECT id, ownerUserId AS owner_uid, name, status FROM projects WHERE id=? LIMIT 1"
          )
          .get(projectId);
        if (!proj) return res.status(404).json({ error: "Project not found" });
        if (String(proj.owner_uid) === String(uid))
          return res
            .status(400)
            .json({ error: "You cannot share on your own project" });

        // --- Idempotence: already shared?
        const existing = db
          .prepare(
            "SELECT recommendationId FROM tradesman_interests WHERE projectId=? AND fromUid=? LIMIT 1"
          )
          .get(projectId, uid);
        if (existing) {
          const recommendationId = Number(existing.recommendationId);
          return res.json({
            ok: true,
            alreadyShared: true,
            recommendationId,
            linkPath: `/builders/${recommendationId}`,
          });
        }

        // --- Resolve tradesman info
        let tr =
          (req.tradesman &&
            typeof req.tradesman === "object" &&
            req.tradesman) ||
          getTradesmanByUser(db, uid) ||
          null;

        const companyName =
          (tr && (tr.company_name || tr.companyName || tr.name)) || null;
        const companyNumber = pickFirst(tr, [
          "company_number",
          "companyNumber",
          "ch_number",
          "chNumber",
        ]);

        if (!companyName && !companyNumber) {
          return res
            .status(400)
            .json({
              error: "Tradesman profile needs a company name or number.",
            });
        }

        // --- Resolve an existing recommendation id
        let rec = resolveRecommendation(db, { companyNumber, companyName });

        // --- If none, create a minimal anonymous recommendation for THIS project
        if (!rec) {
          const createdAtIso = new Date().toISOString();
          const label =
            (companyName && String(companyName).trim()) ||
            (companyNumber && String(companyNumber).trim()) ||
            "Shared company";
          const comment =
            (note && String(note).trim()) ||
            "Profile shared by the tradesman via VetMyBuilder";

          const ins = db
            .prepare(
              `INSERT INTO recommendations (
              projectId, recommenderUserId, createdAt,
              name, email, company, rating, comment, isAnonymous
            ) VALUES (?, NULL, ?, NULL, NULL, ?, NULL, ?, 1)`
            )
            .run(projectId, createdAtIso, label, comment);

          rec = { id: Number(ins.lastInsertRowid) };
        }

        const recommendationId = Number(rec.id);
        const linkPath = `/builders/${recommendationId}`;

        // --- Persist one-time share (UNIQUE)
        const createdAt = new Date().toISOString();
        try {
          db.prepare(
            `INSERT INTO tradesman_interests (projectId, fromUid, recommendationId, note, createdAt)
           VALUES (?, ?, ?, ?, ?)`
          ).run(projectId, uid, recommendationId, note, createdAt);
        } catch (e) {
          // Race on UNIQUE(projectId, fromUid) — treat as already shared
          return res.json({
            ok: true,
            alreadyShared: true,
            recommendationId,
            linkPath,
          });
        }

        // --- Notify owner
        const msg =
          `${
            companyName || "A local tradesperson"
          } is interested in your project and has shared their profile. Click to view.` +
          (note && String(note).trim()
            ? `\n\nMessage: ${String(note).trim()}`
            : "");

        db.prepare(
          `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
         VALUES (?, 'tradesman_interest', ?, ?, ?, ?)`
        ).run(String(proj.owner_uid), msg, projectId, linkPath, createdAt);

        try {
          if (typeof sseSend === "function") {
            sseSend(String(proj.owner_uid), {
              type: "notification",
              kind: "tradesman_interest",
              payload: {
                projectId,
                fromUid: uid,
                companyName: companyName || "",
                linkPath,
                createdAt,
              },
            });
          }
        } catch {}

        return res.json({ ok: true, recommendationId, linkPath });
      } catch (e) {
        console.error("[tradesmen/interest] error", e);
        return res.status(500).json({ error: "Failed to share interest" });
      }
    }
  );
};

/* ---------------- helpers ---------------- */

function maybe(mw) {
  if (typeof mw !== "function") return (_req, _res, next) => next();
  return mw;
}

function ensureInterestsTable(db) {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tradesman_interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      fromUid TEXT NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    )
  `
  ).run();
}

function ensureNotificationsTable(db) {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      projectId INTEGER,
      linkPath TEXT,
      createdAt TEXT NOT NULL
    )
  `
  ).run();
}

function tblExists(db, name) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
    )
    .get(String(name));
  return !!row;
}

function getCols(db, table) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set();
  }
}

function resolveRecommendation(db, { companyNumber, companyName }) {
  // 1) by CH number via company_verifications
  if (companyNumber && tblExists(db, "company_verifications")) {
    const cols = getCols(db, "company_verifications");
    const recCol = cols.has("recommendation_id")
      ? "recommendation_id"
      : cols.has("recommendationId")
      ? "recommendationId"
      : null;
    const numCol = cols.has("company_number")
      ? "company_number"
      : cols.has("companyNumber")
      ? "companyNumber"
      : null;
    if (recCol && numCol) {
      const row = db
        .prepare(
          `SELECT ${recCol} AS id
           FROM company_verifications
           WHERE ${numCol} = ?
           ORDER BY IFNULL(checked_at, ''), id DESC
           LIMIT 1`
        )
        .get(String(companyNumber));
      if (row) return row;
    }
  }

  // 2) by exact normalized company name in recommendations
  if (companyName && tblExists(db, "recommendations")) {
    const row = db
      .prepare(
        `SELECT id
         FROM recommendations
         WHERE lower(trim(company)) = lower(trim(?))
         ORDER BY IFNULL(createdAt, ''), id DESC
         LIMIT 1`
      )
      .get(String(companyName));
    if (row) return row;
  }

  return null;
}

function getTradesmanByUser(db, uid) {
  if (!tblExists(db, "tradesmen")) return null;
  const cols = getCols(db, "tradesmen");
  const key = ["user_uid", "userId", "uid", "user_id"].find((k) => cols.has(k));
  if (!key) return null;
  try {
    return (
      db.prepare(`SELECT * FROM tradesmen WHERE ${key}=? LIMIT 1`).get(uid) ||
      null
    );
  } catch {
    return null;
  }
}

function pickFirst(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}
