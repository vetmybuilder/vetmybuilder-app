// POST /api/project-types
// Body: { label: string, synonyms?: string[], buckets?: string[] }
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

  router.post("/project-types", auth, (req, res) => {
    ensureTable();

    const labelRaw = (req.body?.label || "").trim();
    if (!labelRaw) return res.status(400).json({ error: "label is required" });

    const label = titleCase(labelRaw);
    const synonyms = Array.isArray(req.body?.synonyms) ? req.body.synonyms : [];
    const bucketsArr = Array.isArray(req.body?.buckets) ? req.body.buckets : [];
    const buckets = bucketsArr.join(",");

    // conflict?
    const exists = db
      .prepare("SELECT id FROM project_types WHERE lower(label)=lower(?)")
      .get(label);
    if (exists) return res.status(409).json({ error: "Type already exists" });

    db.prepare(
      `INSERT INTO project_types (label, synonyms_json, buckets) VALUES (?, json(?), ?)`
    ).run(label, JSON.stringify(synonyms), buckets);

    res.json({ ok: true, label });
  });
};

function titleCase(s) {
  return String(s)
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
