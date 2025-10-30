// GET /api/project-types/queries
// Returns aggregated "unknown/low-confidence" type queries for an admin inbox.
// Query params:
//   q?          - filter by substring (applied to normalized)
//   minCount?   - minimum occurrences per normalized term (default 1)
//   limit?      - max rows (default 200)
// Auth: required
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  // Ensure table exists (safe no-op if already created by POST route)
  const ensureTable = () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS project_type_queries (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        query TEXT NOT NULL,
        normalized TEXT NOT NULL,
        phonetic TEXT,
        matched_label TEXT,
        confidence REAL,
        suggestions_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  };

  router.get("/project-types/queries", auth, (req, res) => {
    ensureTable();

    const q = String(req.query.q || "").trim().toLowerCase();
    const minCount = Math.max(1, parseInt(String(req.query.minCount || "1"), 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || "200"), 10) || 200));

    // Only show items that were unmatched or had weak confidence
    const baseWhere = `(matched_label IS NULL OR confidence IS NULL OR confidence < 1.2)`;
    const like = q ? `%${q}%` : null;

    const rows = like
      ? db.prepare(
          `
          SELECT normalized,
                 COUNT(*) AS count,
                 MAX(created_at) AS last_seen
          FROM project_type_queries
          WHERE ${baseWhere}
            AND normalized LIKE ?
          GROUP BY normalized
          HAVING COUNT(*) >= ?
          ORDER BY datetime(last_seen) DESC
          LIMIT ?
        `
        ).all(like, minCount, limit)
      : db.prepare(
          `
          SELECT normalized,
                 COUNT(*) AS count,
                 MAX(created_at) AS last_seen
          FROM project_type_queries
          WHERE ${baseWhere}
          GROUP BY normalized
          HAVING COUNT(*) >= ?
          ORDER BY datetime(last_seen) DESC
          LIMIT ?
        `
        ).all(minCount, limit);

    // For each normalized term, fetch a few recent examples & last shown suggestions
    const detailStmt = db.prepare(
      `
      SELECT query, matched_label, confidence, suggestions_json, created_at
      FROM project_type_queries
      WHERE normalized = ?
      ORDER BY datetime(created_at) DESC
      LIMIT 5
    `
    );

    const items = rows.map((r) => {
      const details = detailStmt.all(r.normalized);
      const examples = Array.from(new Set(details.map((d) => d.query))).slice(0, 3);
      const lastSuggestions =
        details[0]?.suggestions_json ? JSON.parse(details[0].suggestions_json || "[]") : [];
      const lastMatched = details[0]?.matched_label || null;

      return {
        normalized: r.normalized,
        count: Number(r.count) || 0,
        lastSeen: r.last_seen,
        examples,
        lastSuggestions,
        lastMatched,
      };
    });

    res.json({ items });
  });
};
