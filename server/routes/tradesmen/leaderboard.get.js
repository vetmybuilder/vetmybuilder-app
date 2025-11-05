// GET /api/tradesmen/leaderboard   (router is mounted under /api by the server)
// Auth: requires sign-in & admin.
//
// Query params (all optional):
//   q, trade, near, minScore (0.0–10.0), webVerifiedOnly=1, chVerifiedOnly=1,
//   hasPhotos=1, hasDocs=1, hasDiscount=1, hasWebsites=1, limit, offset
//
// Response: { items: [...], total, offset, limit }

module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens } = ctx;

  const API_BASE = ctx.API_PREFIX || "/api"; // for logging only
  const PATH = "/tradesmen/leaderboard"; // actual Express path (no /api here)

  // ---- admin gate ----
  function isAdmin(req) {
    const uid = req.user?.uid;
    if (!uid) return false;

    const roleRow =
      db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid) || null;
    const role = String(roleRow?.role || "user").toLowerCase();

    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = String(req.user?.email || "")
      .trim()
      .toLowerCase();

    return role === "admin" || (email && allowlist.includes(email));
  }

  // Helpers
  const tblExists = (name) => {
    try {
      return !!db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
    } catch {
      return false;
    }
  };
  const tblCols = (name) =>
    new Set(
      db
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map((r) => r.name)
    );
  const addColIfMissing = (tbl, def, name) => {
    const cols = tblCols(tbl);
    if (!cols.has(name))
      db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${def}`).run();
  };

  // Ensure table + needed columns (kept from your original)
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tradesmen (
      user_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT, phone TEXT, email TEXT,
      trade_types TEXT DEFAULT '', service_areas TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      subscription_status TEXT DEFAULT 'free',
      contact_credits INTEGER DEFAULT 0
    )
  `
  ).run();

  // Keep in sync with join/me routes
  addColIfMissing("tradesmen", "vmb_score REAL DEFAULT 0", "vmb_score"); // 0.0–10.0
  addColIfMissing(
    "tradesmen",
    "web_verified INTEGER DEFAULT 0",
    "web_verified"
  );
  addColIfMissing("tradesmen", "company_number TEXT", "company_number");
  addColIfMissing("tradesmen", "ch_status TEXT", "ch_status");
  addColIfMissing("tradesmen", "photo_count INTEGER DEFAULT 0", "photo_count");
  addColIfMissing(
    "tradesmen",
    "discount_min_percent INTEGER DEFAULT 0",
    "discount_min_percent"
  );
  addColIfMissing(
    "tradesmen",
    "discount_max_percent INTEGER DEFAULT 0",
    "discount_max_percent"
  );
  addColIfMissing(
    "tradesmen",
    "warranty_months INTEGER DEFAULT 0",
    "warranty_months"
  );
  addColIfMissing(
    "tradesmen",
    "supporting_doc_count INTEGER DEFAULT 0",
    "supporting_doc_count"
  );
  addColIfMissing("tradesmen", "web_url TEXT", "web_url");
  addColIfMissing(
    "tradesmen",
    "social_links_json TEXT DEFAULT '[]'",
    "social_links_json"
  );
  addColIfMissing("tradesmen", "status TEXT DEFAULT 'draft'", "status"); // explicit status

  // NEW: signals used by scoring/leaderboard
  addColIfMissing("tradesmen", "likes_count INTEGER DEFAULT 0", "likes_count");
  addColIfMissing("tradesmen", "wins_count INTEGER DEFAULT 0", "wins_count");

  const int = (v, d = 0) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : d;
  };
  const truthy = (v) =>
    v === 1 ||
    v === true ||
    String(v).toLowerCase() === "1" ||
    String(v).toLowerCase() === "true";

  const handler = (req, res) => {
    try {
      if (!isAdmin(req)) {
        return res
          .status(403)
          .json({ error: "forbidden", details: "admin role required" });
      }

      const q = String(req.query.q || "").trim();
      const trade = String(req.query.trade || "").trim();
      const near = String(req.query.near || "").trim();

      const minScore = Number(req.query.minScore || 0); // 0.0–10.0
      const webVerifiedOnly = truthy(req.query.webVerifiedOnly);
      const chVerifiedOnly = truthy(req.query.chVerifiedOnly);
      const hasPhotos = truthy(req.query.hasPhotos);
      const hasDocs = truthy(req.query.hasDocs);
      const hasDiscount = truthy(req.query.hasDiscount);
      const hasWebsites = truthy(req.query.hasWebsites);

      const limit = Math.max(1, Math.min(200, int(req.query.limit, 50)));
      const offset = Math.max(0, int(req.query.offset, 0));

      const where = [];
      const params = {};

      if (minScore > 0) {
        where.push(`t.vmb_score >= @minScore`);
        params.minScore = minScore;
      }
      if (q) {
        where.push(`LOWER(t.company_name) LIKE @q`);
        params.q = `%${q.toLowerCase()}%`;
      }
      if (trade) {
        // naive CSV containment
        where.push(
          `(',' || LOWER(REPLACE(REPLACE(REPLACE(t.trade_types, ';', ','), '|', ','), ' ', '')) || ',') LIKE @tradeCsv`
        );
        params.tradeCsv = `%,${trade.toLowerCase()},%`;
      }
      if (webVerifiedOnly) where.push(`COALESCE(t.web_verified,0)=1`);
      if (chVerifiedOnly)
        where.push(`LOWER(COALESCE(t.ch_status,''))='verified'`);
      if (hasPhotos) where.push(`COALESCE(t.photo_count,0) >= 3`);
      if (hasDocs) where.push(`COALESCE(t.supporting_doc_count,0) >= 2`);
      if (hasDiscount)
        where.push(
          `(COALESCE(t.discount_min_percent,0) > 0 OR COALESCE(t.discount_max_percent,0) > 0)`
        );
      if (hasWebsites)
        where.push(
          `COALESCE(t.web_url,'') <> '' OR INSTR(COALESCE(t.social_links_json,''),'http') > 0`
        );

      // near=
      if (near) {
        let tok = null;
        try {
          tok = extractLocationTokens?.(near) || null;
        } catch {}
        if (tok && (tok.full || tok.sector || tok.outward || tok.city)) {
          const ors = [];
          if (tok.full) {
            ors.push(`INSTR(',' || t.service_areas || ',', @nearFullCsv) > 0`);
            params.nearFullCsv = `,${tok.full},`;
          }
          if (tok.sector) {
            ors.push(
              `INSTR(',' || t.service_areas || ',', @nearSectorCsv) > 0`
            );
            params.nearSectorCsv = `,${tok.sector},`;
          }
          if (tok.outward) {
            ors.push(`INSTR(',' || t.service_areas || ',', @nearOutCsv) > 0`);
            params.nearOutCsv = `,${tok.outward},`;
          }
          if (tok.city) {
            ors.push(`LOWER(t.service_areas) LIKE @nearCity`);
            params.nearCity = `%${String(tok.city).toLowerCase()}%`;
          }
          if (ors.length) where.push(`(${ors.join(" OR ")})`);
        } else {
          where.push(`LOWER(t.service_areas) LIKE @nearLike`);
          params.nearLike = `%${near.toLowerCase()}%`;
        }
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // flags subselect if table exists
      const hasFlags = tblExists("tradesmen_flags");
      const flagsSelect = hasFlags
        ? `(SELECT COUNT(*) FROM tradesmen_flags f WHERE f.user_id = t.user_id AND COALESCE(f.resolved_at,'')='') AS open_flags`
        : `0 AS open_flags`;

      const totalRow = db
        .prepare(`SELECT COUNT(*) AS c FROM tradesmen t ${whereSql}`)
        .get(params);
      const total = Number(totalRow?.c || 0);

      const rows = db
        .prepare(
          `
          SELECT
            t.user_id, t.company_name, t.contact_name, t.phone, t.email,
            t.trade_types, t.service_areas,
            t.vmb_score,
            t.company_number, t.ch_status,
            t.web_verified, t.web_url, t.social_links_json,
            t.photo_count, t.discount_min_percent, t.discount_max_percent,
            t.warranty_months, t.supporting_doc_count,
            t.likes_count, t.wins_count,            -- NEW
            COALESCE(t.status, t.subscription_status, 'draft') AS status,
            ${flagsSelect},
            t.created_at,                            -- NEW
            t.updated_at
          FROM tradesmen t
          ${whereSql}
          ORDER BY t.vmb_score DESC, t.updated_at DESC, t.company_name ASC
          LIMIT @limit OFFSET @offset
        `
        )
        .all({ ...params, limit, offset });

      const items = rows.map((r) => {
        let social = [];
        try {
          const parsed = JSON.parse(r.social_links_json || "[]");
          if (Array.isArray(parsed)) social = parsed.filter(Boolean);
        } catch {}
        const urls = [];
        if (r.web_url) urls.push(r.web_url);
        urls.push(...social);

        return {
          userId: r.user_id,
          company: r.company_name,
          status: String(r.status || "draft"),
          openFlags: Number(r.open_flags || 0),
          urls,
          score: Number(r.vmb_score || 0), // 0.0–10.0 (fraction)
          companyNumber: r.company_number || null,
          chStatus: r.ch_status || null,
          webVerified: Number(r.web_verified || 0) === 1,
          website: r.web_url || null,
          trades: r.trade_types || "",
          areas: r.service_areas || "",
          photos: Number(r.photo_count || 0),
          discountMin: Number(r.discount_min_percent || 0),
          discountMax: Number(r.discount_max_percent || 0),
          warrantyMonths: Number(r.warranty_months || 0),
          docs: Number(r.supporting_doc_count || 0),
          likes: Number(r.likes_count || 0),       // NEW
          wins: Number(r.wins_count || 0),         // NEW
          createdAt: r.created_at,                 // NEW
          updatedAt: r.updated_at,
        };
      });

      return res.json({ items, total, offset, limit });
    } catch (e) {
      console.error("[tradesmen/leaderboard.get] error", e);
      return res.status(500).json({ error: "server_error" });
    }
  };

  // IMPORTANT: mount WITHOUT the /api prefix (the app mounts the router under /api)
  router.get(PATH, auth, handler);

  if (!ctx.__logged_tradesmen_leaderboard_get) {
    ctx.__logged_tradesmen_leaderboard_get = true;
    console.log(`[routes] mounted: GET ${API_BASE}${PATH}`);
  }
};
