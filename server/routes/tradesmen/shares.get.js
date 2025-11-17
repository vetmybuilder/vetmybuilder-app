/**
 * GET /api/tradesmen/shares
 * Auth: required (homeowner or tradesman).
 *
 * Query (all optional, but at least one filter is recommended):
 *   projectId?   - numeric project id
 *   shareId?     - numeric trade_shares.id
 *   tradesmanUid?/tradesmanId?/builderId? - the tradesman_uid (e.g. user_id)
 *   limit?       - max rows (default 50, capped at 200)
 *
 * Security:
 *   - Homeowner: can see shares for projects they own (projects.ownerUserId = current uid)
 *   - Tradesman: can see shares they themselves sent (trade_shares.tradesman_uid = current uid)
 */

module.exports = (router, ctx) => {
  const { db, auth, PUBLIC_API_BASE = "" } = ctx;

  // Ensure table exists (same as in POST route)
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

  // Helper: check table existence
  const hasTable = (name) =>
    !!db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`
      )
      .get(name);

  // Build correct URLs: existing app serves files at /uploads/*
  const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, ""); // no trailing slash
  const toRelUrl = (filename) => (filename ? `/uploads/${filename}` : "");
  const toAbsUrl = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

  const normalisePhotos = (photosJson) => {
    if (!photosJson) return [];
    let raw;
    try {
      raw = JSON.parse(photosJson);
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];

    return raw
      .map((p) => {
        const filename = p.filename || "";
        // Prefer existing url/absoluteUrl if present
        let rel = p.url || (filename ? toRelUrl(filename) : "");
        // Normalise any old /api/uploads
        rel = rel.replace(/^\/api\/uploads\//, "/uploads/");
        const abs = p.absoluteUrl
          ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
          : toAbsUrl(rel);

        return {
          ...p,
          filename,
          url: rel,
          absoluteUrl: abs,
        };
      })
      .filter((p) => p.url || p.absoluteUrl);
  };

  router.get("/tradesmen/shares", auth, (req, res) => {
    try {
      const uid = req.user?.uid || req.user?.id;
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!hasTable("trade_shares") || !hasTable("projects")) {
        // Graceful empty response instead of 500
        return res.json({ shares: [], total: 0 });
      }

      // Parse filters
      const rawProjectId =
        req.query.projectId || req.query.pid || req.query.project_id || null;
      const rawShareId = req.query.shareId || req.query.id || null;
      const rawTradesman =
        req.query.tradesmanUid ||
        req.query.tradesmanId ||
        req.query.builderId ||
        null;

      const projectId = rawProjectId
        ? Number(String(rawProjectId).trim())
        : NaN;
      const shareId = rawShareId ? Number(String(rawShareId).trim()) : NaN;
      const tradesmanUid =
        rawTradesman && String(rawTradesman).trim().length > 0
          ? String(rawTradesman).trim()
          : null;

      const limitReq = parseInt(String(req.query.limit ?? "50"), 10);
      const limit = Math.min(
        200,
        Math.max(1, Number.isFinite(limitReq) ? limitReq : 50)
      );

      // Base query: join projects for owner check
      const where = [
        // Allow either: project owner OR tradesman who sent the share
        "(CAST(p.ownerUserId AS TEXT) = CAST(? AS TEXT) OR CAST(ts.tradesman_uid AS TEXT) = CAST(? AS TEXT))",
      ];
      const params = [String(uid), String(uid)];

      if (Number.isFinite(projectId)) {
        where.push("ts.project_id = ?");
        params.push(projectId);
      }

      if (Number.isFinite(shareId)) {
        where.push("ts.id = ?");
        params.push(shareId);
      }

      if (tradesmanUid) {
        where.push("CAST(ts.tradesman_uid AS TEXT) = CAST(? AS TEXT)");
        params.push(tradesmanUid);
      }

      const rows = db
        .prepare(
          `
          SELECT
            ts.id,
            ts.project_id,
            ts.tradesman_uid,
            ts.photos_json,
            ts.message,
            ts.created_at,
            p.name AS project_name
          FROM trade_shares ts
          JOIN projects p
            ON p.id = ts.project_id
          WHERE ${where.join(" AND ")}
          ORDER BY ts.created_at DESC
          LIMIT ?
        `
        )
        .all(...params, limit);

      const shares = rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name || null,
        tradesmanUid: r.tradesman_uid,
        photos: normalisePhotos(r.photos_json),
        message: r.message || "",
        createdAt: r.created_at,
      }));

      return res.json({
        shares,
        total: shares.length,
      });
    } catch (e) {
      console.error("[tradesmen/shares.get] error", e);
      return res.status(500).json({
        error: "TRADESMAN_SHARES_FETCH_FAILED",
        message: e?.message || String(e),
      });
    }
  });
};
