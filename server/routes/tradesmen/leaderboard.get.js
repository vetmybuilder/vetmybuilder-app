// server/routes/tradesmen/leaderboard.get.js
module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens } = ctx;

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/tradesmen/leaderboard";

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
    if (!tblCols(tbl).has(name))
      db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${def}`).run();
  };

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

  addColIfMissing("tradesmen", "vmb_score REAL DEFAULT 0", "vmb_score");
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
  addColIfMissing("tradesmen", "status TEXT DEFAULT 'draft'", "status");
  addColIfMissing("tradesmen", "plan TEXT DEFAULT 'free'", "plan");
  addColIfMissing("tradesmen", "purchased_plan TEXT", "purchased_plan");
  addColIfMissing("tradesmen", "plan_updated_at TEXT", "plan_updated_at");
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

      const minScore = Number(req.query.minScore || 0);
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
        where.push(
          `(LOWER(t.company_name) LIKE @q OR REPLACE(LOWER(COALESCE(t.company_number,'')),' ','') LIKE @qnn)`
        );
        params.q = `%${q.toLowerCase()}%`;
        params.qnn = `%${q.toLowerCase().replace(/\s+/g, "")}%`;
      }

      if (trade) {
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

      const flagsSelect = tblExists("tradesmen_flags")
        ? `(SELECT COUNT(*) FROM tradesmen_flags f WHERE f.user_id = t.user_id AND COALESCE(f.resolved_at,'')='') AS open_flags`
        : `0 AS open_flags`;

      // NEW: also return CSV of pending project_ids so UI can auto-approve without prompting.
      const unlocksSelect = tblExists("project_contact_unlocks")
        ? `
          (SELECT COUNT(*) FROM project_contact_unlocks u
             WHERE u.buyer_uid = t.user_id AND LOWER(COALESCE(u.status,''))='approved') AS approved_unlocks,
          (SELECT COUNT(*) FROM project_contact_unlocks u
             WHERE u.buyer_uid = t.user_id AND LOWER(COALESCE(u.status,''))='pending')  AS pending_unlocks,
          (SELECT GROUP_CONCAT(u.project_id)
             FROM project_contact_unlocks u
            WHERE u.buyer_uid = t.user_id AND LOWER(COALESCE(u.status,''))='pending')  AS pending_unlocks_csv
        `
        : `0 AS approved_unlocks, 0 AS pending_unlocks, '' AS pending_unlocks_csv`;

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
          t.likes_count, t.wins_count,
          COALESCE(t.status, t.subscription_status, 'draft') AS status,
          COALESCE(t.plan, 'free') AS plan,
          t.purchased_plan AS purchased_plan,
          ${flagsSelect},
          ${unlocksSelect},
          t.created_at,
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

        // parse csv -> number[]
        const pendingCsv = typeof r.pending_unlocks_csv === "string" ? r.pending_unlocks_csv : "";
        const pendingIds = pendingCsv
          ? pendingCsv
              .split(",")
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];

        return {
          userId: r.user_id,
          company: r.company_name,
          status: String(r.status || "draft"),
          plan: r.plan ?? "free",
          purchasedPlan: r.purchased_plan ?? null,
          openFlags: Number(r.open_flags || 0),
          urls,
          score: Number(r.vmb_score || 0),
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
          likes: Number(r.likes_count || 0),
          wins: Number(r.wins_count || 0),
          createdAt: r.created_at,
          updatedAt: r.updated_at,

          // existing counts
          oneOffUnlocks: Number(r.approved_unlocks || 0),
          oneOffUnlocksPending: Number(r.pending_unlocks || 0),

          // NEW: the actual project IDs the UI can use
          pendingUnlockProjectIds: pendingIds,
        };
      });

      return res.json({ items, total, offset, limit });
    } catch (e) {
      console.error("[tradesmen/leaderboard.get] error", e);
      return res.status(500).json({ error: "server_error" });
    }
  };

  router.get(PATH, auth, handler);
  if (!ctx.__logged_tradesmen_leaderboard_get) {
    ctx.__logged_tradesmen_leaderboard_get = true;
    console.log(`[routes] mounted: GET ${API_BASE}${PATH}`);
  }
};