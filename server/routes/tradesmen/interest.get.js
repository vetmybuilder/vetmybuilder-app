/**
 * GET /tradesmen/interest?projectId=123
 * Auth: tradesman
 * → { shared: boolean, recommendationId?: number, linkPath?: string }
 */
module.exports = (router, ctx) => {
  const { db, auth, requireTradesman = null } = ctx;

  ensureInterestsTable(db);

  router.get("/tradesmen/interest", auth, maybe(requireTradesman), (req, res) => {
    const uid = req.user.uid;
    const projectId = Number(req.query.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "projectId is required" });
    }
    const row = db.prepare(
      "SELECT recommendationId FROM tradesman_interests WHERE projectId=? AND fromUid=? LIMIT 1"
    ).get(projectId, uid);

    if (!row) return res.json({ shared: false });

    const recommendationId = Number(row.recommendationId);
    return res.json({
      shared: true,
      recommendationId,
      linkPath: `/builders/${recommendationId}`,
    });
  });
};

/* ---- shared helpers (duplicated locally so file is self-contained) ---- */
function maybe(mw) { if (typeof mw !== "function") return (_req,_res,next)=>next(); return mw; }
function ensureInterestsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tradesman_interests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      fromUid TEXT NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    )
  `).run();
}
