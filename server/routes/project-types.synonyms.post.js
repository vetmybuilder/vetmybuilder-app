// POST /api/project-types/synonyms
// Body: { label: string, synonym: string }
// Auth: required
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  const ensureTable = () => {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS project_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL UNIQUE,
        synonyms_json TEXT NOT NULL DEFAULT '[]',
        buckets TEXT NOT NULL DEFAULT '',
        popularity INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      )
    `
    ).run();
  };

  router.post("/project-types/synonyms", auth, (req, res) => {
    ensureTable();

    const label = (req.body?.label || "").trim();
    const synonymRaw = (req.body?.synonym || "").trim();
    if (!label || !synonymRaw) {
      return res.status(400).json({ error: "label and synonym are required" });
    }

    // Find target type
    const row = db
      .prepare(
        "SELECT id, label, synonyms_json FROM project_types WHERE lower(label)=lower(?)"
      )
      .get(label);
    if (!row) return res.status(404).json({ error: "Type not found" });

    const synonyms = safeParseJson(row.synonyms_json, []);
    const norm = synonymRaw.toLowerCase();

    // Prevent duplicates (case-insensitive)
    const hasAlready =
      synonyms.some((s) => String(s).toLowerCase() === norm) ||
      String(row.label).toLowerCase() === norm;

    if (hasAlready)
      return res.json({
        ok: true,
        label: row.label,
        synonym: synonymRaw,
        deduped: true,
      });

    synonyms.push(synonymRaw);

    db.prepare(
      "UPDATE project_types SET synonyms_json = json(?) WHERE id = ?"
    ).run(JSON.stringify(synonyms), row.id);

    res.json({ ok: true, label: row.label, synonym: synonymRaw });
  });
};

function safeParseJson(s, fallback) {
  try {
    return JSON.parse(s ?? "[]");
  } catch {
    return fallback;
  }
}
