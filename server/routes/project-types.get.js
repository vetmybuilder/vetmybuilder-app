// GET /api/project-types?s=roof&limit=8
// Returns canonical labels for suggestions, using DB if present, else in-code fallback.
// Auth: required
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  const ensureTables = () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS project_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL UNIQUE,
        synonyms_json TEXT NOT NULL DEFAULT '[]',
        buckets TEXT NOT NULL DEFAULT '',
        popularity INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      )
    `).run();
  };

  // --- tiny text utils (match client heuristics) ---
  const normalize = (s) => String(s || "").trim().replace(/\s+/g, " ");
  const stem = (w) => String(w || "")
    .toLowerCase()
    .replace(/(ing|ers?|ed|ly|es|s)$/i, "")
    .replace(/-/g, "");
  const tokenise = (s) =>
    String(s || "")
      .toLowerCase()
      .split(/[\s/()&,+-]+/)
      .filter(Boolean)
      .map(stem);

  const soundex = (s) => {
    const a = String(s || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!a) return "";
    const map = {B:1,F:1,P:1,V:1,C:2,G:2,J:2,K:2,Q:2,S:2,X:2,Z:2,D:3,T:3,L:4,M:5,N:5,R:6};
    const first = a[0];
    const codes = [first];
    for (let i = 1; i < a.length; i++) {
      const c = String(map[a[i]] || 0);
      if (c !== codes[codes.length - 1]) codes.push(c);
    }
    return (codes.join("").replace(/0/g, "") + "000").slice(0, 4);
  };

  const trigramSet = (s) => {
    const t = `  ${String(s || "").toLowerCase()}  `;
    const set = new Set();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const trigramJaccard = (a, b) => {
    const A = trigramSet(a), B = trigramSet(b);
    let inter = 0; A.forEach((x) => { if (B.has(x)) inter++; });
    const union = A.size + B.size - inter;
    return union ? inter / union : 0;
  };

  const editDistance = (a, b, cap = 2) => {
    a = stem(a); b = stem(b);
    const n = a.length, m = b.length;
    if (!n) return Math.min(m, cap + 1);
    if (!m) return Math.min(n, cap + 1);
    if (Math.abs(n - m) > cap) return cap + 1;
    const prev = new Array(m + 1), cur = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      cur[0] = i; let rowMin = cur[0];
      for (let j = 1; j <= m; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > cap) return cap + 1;
      for (let j = 0; j <= m; j++) prev[j] = cur[j];
    }
    return Math.min(cur[m], cap + 1);
  };

  const scoreCandidate = (candidate, q) => {
    if (!q) return 0;
    const qTokens = tokenise(q).join(" ");
    const cTokens = tokenise(candidate).join(" ");
    const includes = cTokens.includes(qTokens) ? 1 : 0;
    const ed  = Math.min(...tokenise(candidate).map((t) => editDistance(t, q, 2)));
    const tri = trigramJaccard(candidate, q);
    const snd = soundex(candidate) === soundex(q) ? 1 : 0;
    return includes * 3 + (2 - Math.min(ed, 2)) + tri * 2 + snd * 1;
  };

  router.get("/project-types", auth, (req, res) => {
    ensureTables();

    const q = normalize(req.query.s || "");
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 8)));

    // Load DB types
    const rows = db.prepare(
      "SELECT label, synonyms_json, popularity, active FROM project_types WHERE active = 1"
    ).all();

    // If DB empty, return a minimal default (aligns with client fallback)
    if (!rows || rows.length === 0) {
      const defaults = [
        "Kitchen remodel","Bathroom refit","Roofing","Driveway / paving",
        "Garden landscaping","Loft conversion","Single-storey extension","Electrical rewire",
      ];
      const items = q
        ? defaults
            .map((s) => ({ label: s, score: scoreCandidate(s, q) }))
            .filter((x) => x.score > 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((x) => x.label)
        : defaults.slice(0, limit);
      return res.json({ items });
    }

    // Build library and canonical map
    const allStrings = [];
    const toCanon = new Map(); // lowercased string -> canonical label
    for (const r of rows) {
      const label = r.label;
      allStrings.push(label);
      toCanon.set(label.toLowerCase(), label);
      const syns = safeParseJson(r.synonyms_json, []);
      for (const s of syns) {
        allStrings.push(String(s));
        toCanon.set(String(s).toLowerCase(), label);
      }
    }

    if (!q) {
      // Popularity-first default list
      const sorted = rows
        .slice()
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .map((r) => r.label)
        .slice(0, limit);
      return res.json({ items: sorted });
    }

    const scored = allStrings
      .map((s) => ({ s, score: scoreCandidate(s, q) }))
      .filter((x) => x.score > 0.5)
      .sort((a, b) => b.score - a.score);

    const seen = new Set();
    const out = [];
    for (const r of scored) {
      const canon = toCanon.get(String(r.s).toLowerCase()) || r.s;
      if (!seen.has(canon)) {
        seen.add(canon);
        out.push(canon);
        if (out.length >= limit) break;
      }
    }

    if (out.length === 0) {
      // strong fallback
      return res.json({
        items: ["Roofing","Driveway / paving","Garden landscaping","Kitchen remodel"].slice(0, limit),
      });
    }

    res.json({ items: out });
  });
};

function safeParseJson(s, fallback) {
  try { return JSON.parse(s ?? "[]"); } catch { return fallback; }
}
