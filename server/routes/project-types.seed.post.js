// POST /api/project-types/seed
// Seeds DB project_types from the in-code library (idempotent; upserts by label).
// Auth: required.
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

  router.post("/project-types/seed", auth, (req, res) => {
    ensureTable();

    // Try to load from web/lib or web/types at runtime. If that fails, use a built-in fallback.
    let PROJECT_TYPES;
    try {
      const mod = requireFromWebTypes();
      PROJECT_TYPES = mod && (mod.PROJECT_TYPES || mod.default?.PROJECT_TYPES);
      if (!Array.isArray(PROJECT_TYPES))
        throw new Error("No PROJECT_TYPES export");
    } catch {
      PROJECT_TYPES = [
        {
          label: "Kitchen remodel",
          synonyms: [
            "kitchen renovation",
            "kitchen fitting",
            "kitchen installation",
            "kitchen install",
            "kitchen refit",
          ],
          buckets: ["kitchen"],
        },
        {
          label: "Bathroom refit",
          synonyms: ["bathroom renovation", "bathroom remodel", "new bathroom"],
          buckets: ["bathroom"],
        },
        {
          label: "Roofing",
          synonyms: [
            "roof repair",
            "roof replacement",
            "re-roof",
            "reroof",
            "roof leak",
          ],
          buckets: ["roofing"],
        },
        {
          label: "Driveway / paving",
          synonyms: [
            "driveway",
            "paving",
            "block paving",
            "resin driveway",
            "tarmac driveway",
            "patio paving",
            "path paving",
          ],
          buckets: ["groundworks", "driveways"],
        },
        {
          label: "Garden landscaping",
          synonyms: [
            "landscaping",
            "garden design",
            "soft landscaping",
            "hard landscaping",
          ],
          buckets: ["gardens"],
        },
        {
          label: "Loft conversion",
          synonyms: ["attic conversion", "loft"],
          buckets: ["general", "structural"],
        },
        {
          label: "Single-storey extension",
          synonyms: ["rear extension", "side return", "extension"],
          buckets: ["general", "structural"],
        },
        {
          label: "Electrical rewire",
          synonyms: ["rewire"],
          buckets: ["general", "electrical"],
        },
      ];
    }

    const upsert = db.prepare(`
      INSERT INTO project_types (label, synonyms_json, buckets, popularity, active)
      VALUES (?, json(?), ?, COALESCE(?,0), COALESCE(?,1))
      ON CONFLICT(label) DO UPDATE SET
        synonyms_json = excluded.synonyms_json,
        buckets       = excluded.buckets
    `);

    let inserted = 0,
      updated = 0;
    const getExisting = db.prepare(
      "SELECT label, synonyms_json, buckets FROM project_types WHERE label = ?"
    );

    for (const t of PROJECT_TYPES) {
      const label = String(t.label).trim();
      if (!label) continue;
      const synonyms = JSON.stringify(t.synonyms || []);
      const buckets = (t.buckets || []).join(",");
      const row = getExisting.get(label);

      if (!row) {
        upsert.run(
          label,
          synonyms,
          buckets,
          t.popularity || 0,
          t.active ? 1 : 1
        );
        inserted++;
      } else {
        const sameSyn = safeEqJson(row.synonyms_json, synonyms);
        const sameBuckets = String(row.buckets || "") === buckets;
        if (!sameSyn || !sameBuckets) {
          upsert.run(
            label,
            synonyms,
            buckets,
            t.popularity || 0,
            t.active ? 1 : 1
          );
          updated++;
        }
      }
    }

    res.json({ ok: true, inserted, updated, total: PROJECT_TYPES.length });
  });
};

function safeEqJson(a, b) {
  try {
    const A = JSON.parse(a ?? "[]");
    const B = JSON.parse(b ?? "[]");
    return JSON.stringify(A) === JSON.stringify(B);
  } catch {
    return false;
  }
}

// Resolve PROJECT_TYPES from web/{lib,types}/projectTypes.{js,ts} when the endpoint is called.
function requireFromWebTypes() {
  const path = require("path");
  const fs = require("fs");

  const candidates = [
    // current location (lib)
    path.resolve(__dirname, "..", "..", "web", "lib", "projectTypes.js"),
    path.resolve(__dirname, "..", "..", "web", "lib", "projectTypes.ts"),
    // alternative folder (types)
    path.resolve(__dirname, "..", "..", "web", "types", "projectTypes.js"),
    path.resolve(__dirname, "..", "..", "web", "types", "projectTypes.ts"),
    // also try from CWD
    path.resolve(process.cwd(), "web", "lib", "projectTypes.js"),
    path.resolve(process.cwd(), "web", "lib", "projectTypes.ts"),
    path.resolve(process.cwd(), "web", "types", "projectTypes.js"),
    path.resolve(process.cwd(), "web", "types", "projectTypes.ts"),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    if (p.endsWith(".ts")) {
      try {
        require("ts-node/register/transpile-only");
      } catch {
        continue; // ts-node not installed; try next candidate
      }
    }
    const mod = require(p);
    // Support both `module.exports = { PROJECT_TYPES }` and `export default { PROJECT_TYPES }`
    if (mod && (mod.PROJECT_TYPES || mod.default?.PROJECT_TYPES)) return mod;
  }

  // Nothing found
  throw new Error(
    "Unable to load PROJECT_TYPES. Checked:\n" +
      candidates.map((p) => ` - ${p}`).join("\n") +
      "\nInstall ts-node or build a JS copy at web/lib/projectTypes.js."
  );
}
