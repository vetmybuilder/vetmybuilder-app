// POST /api/project-types/queries
// Body: { query: string, matchedLabel?: string|null, confidence?: number|null, suggestions?: string[] }
// Auth: required
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { randomUUID } = require("crypto");

  const ensureTable = () => {
    db.prepare(
      `
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
    `
    ).run();
  };

  const soundex = (s) => {
    const a = (s || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!a) return "";
    const map = {
      B: 1,
      F: 1,
      P: 1,
      V: 1,
      C: 2,
      G: 2,
      J: 2,
      K: 2,
      Q: 2,
      S: 2,
      X: 2,
      Z: 2,
      D: 3,
      T: 3,
      L: 4,
      M: 5,
      N: 5,
      R: 6,
    };
    const first = a[0];
    const codes = [first];
    for (let i = 1; i < a.length; i++) {
      const c = String(map[a[i]] || 0);
      if (c !== codes[codes.length - 1]) codes.push(c);
    }
    return (codes.join("").replace(/0/g, "") + "000").slice(0, 4);
  };

  router.post("/project-types/queries", auth, (req, res) => {
    ensureTable();
    const uid = req.user?.uid || null;
    const {
      query,
      matchedLabel = null,
      confidence = null,
      suggestions = [],
    } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query required" });
    }
    const id =
      typeof randomUUID === "function" ? randomUUID() : String(Date.now());
    const normalized = query.trim().toLowerCase();
    const phonetic = soundex(normalized);

    db.prepare(
      `
      INSERT INTO project_type_queries
      (id, user_id, query, normalized, phonetic, matched_label, confidence, suggestions_json)
      VALUES (?,  ?,     ?,     ?,         ?,       ?,             ?,          ?)
    `
    ).run(
      id,
      uid,
      query,
      normalized,
      phonetic,
      matchedLabel,
      confidence,
      JSON.stringify(suggestions || [])
    );

    res.json({ ok: true, id });
  });
};
