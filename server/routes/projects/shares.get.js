/**
 * GET /api/projects/:id/shares
 * Owner-only: list tradesmen who shared their profile for this project.
 */
module.exports = (router, ctx) => {
  const { db, auth, PUBLIC_API_BASE = "" } = ctx;

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS trade_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      tradesman_uid TEXT NOT NULL,
      photos_json TEXT NOT NULL DEFAULT '[]',
      message TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, tradesman_uid)
    )
  `
  ).run();

  const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, "");
  const normUrl = (u) => String(u || "").replace(/^\/api\/uploads\//, "/uploads/");
  const toAbs = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

  const projectById = (id) =>
    db.prepare(`SELECT * FROM projects WHERE id=?`).get(id);

  const loadTradesmanByUid = (uid) => {
    const cols = new Set(
      db.prepare(`PRAGMA table_info(tradesmen)`).all().map((r) => r.name)
    );
    if (!cols.size) return null;

    const colUser = cols.has("user_id") ? "user_id" : cols.has("uid") ? "uid" : null;
    if (!colUser) return null;

    const pick = (name) => (cols.has(name) ? name : `NULL AS ${name}`);
    const row = db
      .prepare(
        `
      SELECT
        ${pick("id")},
        ${pick("user_id")},
        ${pick("uid")},
        ${pick("name")},
        ${pick("company")},
        ${pick("company_name")},
        ${pick("company_number")},
        ${pick("profile_slug")}
      FROM tradesmen
      WHERE ${colUser} = ?
      LIMIT 1
    `
      )
      .get(uid);

    if (!row) return null;
    return {
      id: row.id ?? null,
      user_id: row.user_id ?? row.uid ?? null,
      uid: row.uid ?? row.user_id ?? null,
      name: row.name ?? null,
      company: row.company ?? row.company_name ?? null,
      company_number: row.company_number ?? null,
      profile_slug: row.profile_slug ?? null,
    };
  };

  router.get("/projects/:id/shares", auth, (req, res) => {
    try {
      const uid = req.user?.uid || req.user?.id || null;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const pid = Number(req.params.id);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid project id" });
      }

      const project = projectById(pid);
      if (!project) return res.status(404).json({ error: "Project not found" });

      if (String(project.ownerUserId || "") !== String(uid)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const rows = db
        .prepare(
          `
          SELECT id, project_id, tradesman_uid, photos_json, message, created_at
          FROM trade_shares
          WHERE project_id = ?
          ORDER BY datetime(created_at) DESC, id DESC
        `
        )
        .all(pid);

      const items = rows.map((r) => {
        let photos = [];
        try {
          photos = JSON.parse(r.photos_json || "[]");
          if (!Array.isArray(photos)) photos = [];
        } catch {
          photos = [];
        }

        // 🔧 Normalize any legacy /api/uploads -> /uploads and add absoluteUrl if missing
        photos = photos.map((p) => {
          const url = normUrl(p.url || (p.filename ? `/uploads/${p.filename}` : ""));
          const absoluteUrl =
            p.absoluteUrl && /^https?:\/\//i.test(p.absoluteUrl)
              ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
              : (url ? `${ABS_BASE}${url}` : "");
          return { ...p, url, absoluteUrl };
        });

        const tm = loadTradesmanByUid(r.tradesman_uid);

        return {
          id: r.id,
          projectId: r.project_id,
          tradesmanUid: r.tradesman_uid,
          photos,
          message: r.message || "",
          createdAt: r.created_at,
          tradesman: tm,
        };
      });

      return res.json({ ok: true, items, total: items.length });
    } catch (e) {
      console.error("[projects.shares.get] error", e);
      return res.status(500).json({ error: "Failed to load shares" });
    }
  });
};