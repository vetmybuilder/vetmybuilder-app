// server/routes/tradesmen/spotlight.get.js

/**
 * GET /api/tradesmen/spotlight
 * Auth: required
 *
 * Query:
 *   projectId=123
 *   limit?=999  (server caps to 200)
 *
 * Selection rules (fixed):
 *   - payments_oneoff: type='spotlight' AND status='active' AND expires_at > NOW()
 *   - join to tradesmen by user_id (exclude banned)
 *   - Project budget upper >= £15,000 (derived safely; parses description if needed)
 *
 * Rotation:
 *   - tradesmen_spotlight_views: views ASC, last_viewed_at ASC, then random tiebreak
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const TAG = "[tradesmen/spotlight.get]";

  async function tableExists(name) {
    try {
      const pattern = String(name)
        .replace(/\\/g, "\\\\")
        .replace(/_/g, "\\_")
        .replace(/%/g, "\\%")
        .replace(/'/g, "\\'");
      const sql = `SHOW TABLES LIKE '${pattern}'`;
      const rows = await mysqlQuery(sql);
      return rows.length > 0;
    } catch (e) {
      console.warn(`${TAG} tableExists(${name}) failed:`, e?.message || e);
      return false;
    }
  }

  // ---- Budget helpers (same logic as before) ----
  const NUM_KEYS_UPPER = [
    "budget_max",
    "maxBudget",
    "budgetMax",
    "expected_max",
    "expectedMax",
    "price_max",
    "priceMax",
    "estimated_budget_max",
    "estimatedBudgetMax",
    "estimatedBudgetUpper",
    "totalBudget",
    "value",
    "expectedCost",
    "expected_cost",
  ];
  const NUM_KEYS_LOWER = [
    "budget_min",
    "minBudget",
    "budgetMin",
    "price_min",
    "priceMin",
    "estimated_budget_min",
    "estimatedBudgetMin",
    "estimatedBudgetLower",
    "budget",
  ];

  const parseMoneyUpperFromText = (text) => {
    if (!text || typeof text !== "string") return 0;

    let scope = text;
    const idx = text.toLowerCase().indexOf("budget");
    if (idx !== -1) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + 120);
      scope = text.slice(start, end);
    }

    scope = scope.replace(/–|—/g, "-").replace(/\bto\b/gi, "-");

    const re =
      /£?\s*([0-9]{1,3}(?:,[0-9]{3})*|\d+(?:\.\d+)?)\s*(k|m)?\s*(\+)?/gi;
    let m;
    const vals = [];
    while ((m = re.exec(scope)) !== null) {
      let v = parseFloat(m[1].replace(/,/g, ""));
      const unit = (m[2] || "").toLowerCase();
      if (unit === "k") v *= 1000;
      if (unit === "m") v *= 1000000;
      if (Number.isFinite(v)) vals.push(v);
    }
    return vals.length ? Math.max(...vals) : 0;
  };

  async function getProjectUpperBudget(projectId) {
    if (!(await tableExists("projects"))) return 0;

    const rows = await mysqlQuery(
      `SELECT * FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );
    const row = rows[0];
    if (!row) return 0;

    const pickNum = (keys) => {
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(row, k)) {
          const v = Number(row[k]);
          if (Number.isFinite(v) && v > 0) return v;
        }
      }
      return null;
    };

    const explicitUpper = pickNum(NUM_KEYS_UPPER);
    const explicitLower = pickNum(NUM_KEYS_LOWER);
    const upper =
      explicitUpper != null
        ? explicitUpper
        : explicitLower != null
        ? explicitLower
        : 0;
    if (upper > 0) return upper;

    const text =
      row.description ||
      row.details ||
      row.desc ||
      row.summary ||
      row.notes ||
      "";
    return parseMoneyUpperFromText(String(text));
  }

  // ---- Image helpers ----
  const makeAbsolute = (p) => {
    if (!p) return null;
    const s = String(p);
    if (/^https?:\/\//i.test(s)) return s;
    const base =
      process.env.MEDIA_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "";
    if (!base) return s.startsWith("/") ? s : `/${s}`;
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanPath = s.startsWith("/") ? s : `/${s}`;
    return `${cleanBase}${cleanPath}`;
  };

  async function ensureViewsTable() {
    try {
      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS tradesmen_spotlight_views (
          tradesman_user_id VARCHAR(255) NOT NULL PRIMARY KEY,
          views INT NOT NULL DEFAULT 0,
          last_viewed_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) {
      console.warn(`${TAG} ensureViewsTable failed:`, e?.message || e);
    }
  }

  router.get("/tradesmen/spotlight", auth, async (req, res) => {
    try {
      const projectIdStr = String(req.query.projectId || "");
      if (!projectIdStr) {
        return res.status(400).json({
          error: "SPOTLIGHT_TRADESMEN_FAILED",
          message: "projectId is required",
        });
      }
      const projectId = Number(projectIdStr);

      // If core tables are missing, just respond with an empty list
      const hasTradesmen = await tableExists("tradesmen");
      const hasOneOff = await tableExists("payments_oneoff");
      if (!hasTradesmen || !hasOneOff) {
        const projectUpper = await getProjectUpperBudget(projectId);
        return res.json({
          items: [],
          total: 0,
          page: 1,
          limit: 0,
          projectBudgetUpper: projectUpper,
          threshold: 15000,
        });
      }

      const THRESHOLD = 15000;
      const projectUpper = await getProjectUpperBudget(projectId);
      if (!(projectUpper >= THRESHOLD)) {
        return res.json({
          items: [],
          total: 0,
          page: 1,
          limit: 0,
          projectBudgetUpper: projectUpper,
          threshold: THRESHOLD,
        });
      }

      const limitReq = parseInt(String(req.query.limit ?? "999"), 10);
      const limit = Math.min(
        200,
        Math.max(1, Number.isFinite(limitReq) ? limitReq : 999)
      );

      const nowIso = new Date().toISOString();

      // --- FIXED SELECTION (MySQL, via mysqlQuery) ---
      const rows = await mysqlQuery(
        `
        SELECT
          t.user_id      AS userId,
          t.company_name AS companyName,
          t.contact_name AS contactName,
          t.status       AS tStatus,
          o.expires_at   AS expiresAt
        FROM payments_oneoff o
        JOIN tradesmen t
          ON t.user_id = o.user_id
        WHERE LOWER(COALESCE(o.type, ''))   = 'spotlight'
          AND LOWER(COALESCE(o.status, '')) = 'active'
          AND (o.expires_at IS NULL OR o.expires_at > ?)
          AND COALESCE(t.status, 'active')  != 'banned'
        ORDER BY o.expires_at ASC
        `,
        [nowIso]
      );

      if (!rows.length) {
        return res.json({
          items: [],
          total: 0,
          page: 1,
          limit,
          projectBudgetUpper: projectUpper,
          threshold: THRESHOLD,
        });
      }

      // --- Photo table detection (MySQL) ---
      const hasTradesmanPhotos = await tableExists("tradesman_photos");
      const hasTradesmenPhotos = await tableExists("tradesmen_photos");
      const PHOTO_TABLE = hasTradesmanPhotos
        ? "tradesman_photos"
        : hasTradesmenPhotos
        ? "tradesmen_photos"
        : null;

      async function loadPhotosFor(uid) {
        if (!PHOTO_TABLE) return [];
        const photos = await mysqlQuery(
          `
          SELECT url, sort_order, created_at
            FROM ${PHOTO_TABLE}
           WHERE tradesman_user_id = ?
           ORDER BY COALESCE(sort_order, 999999) ASC, created_at ASC
          `,
          [uid]
        );
        return photos.map((p) => makeAbsolute(p.url));
      }

      // Fair rotation bookkeeping
      await ensureViewsTable();
      const viewRows = await mysqlQuery(
        `SELECT tradesman_user_id, views, last_viewed_at FROM tradesmen_spotlight_views`
      );
      const viewMap = new Map(
        viewRows.map((v) => [String(v.tradesman_user_id), v])
      );

      const sorted = rows
        .map((r) => {
          const key = String(r.userId);
          const v = viewMap.get(key);
          return {
            ...r,
            __views: v ? Number(v.views || 0) : 0,
            __last: v?.last_viewed_at || null,
          };
        })
        .sort((a, b) => {
          if (a.__views !== b.__views) return a.__views - b.__views;
          if (a.__last && b.__last) return a.__last.localeCompare(b.__last);
          if (a.__last && !b.__last) return 1;
          if (!a.__last && b.__last) return -1;
          return Math.random() - 0.5;
        });

      const pick = sorted.slice(0, limit);

      const items = [];
      for (const r of pick) {
        const builderId = String(r.userId);
        const gallery = await loadPhotosFor(builderId);

        items.push({
          builderId,
          companyName: r.companyName || null,
          displayName: r.companyName || r.contactName || "Tradesman",
          tierActiveUntil: r.expiresAt || null,
          gallery,
        });
      }

      // increment views
      for (const i of items) {
        await mysqlQuery(
          `
          INSERT INTO tradesmen_spotlight_views (tradesman_user_id, views, last_viewed_at)
          VALUES (?, 1, NOW())
          ON DUPLICATE KEY UPDATE
            views = views + 1,
            last_viewed_at = NOW()
        `,
          [i.builderId]
        );
      }

      return res.json({
        items,
        total: rows.length,
        page: 1,
        limit,
        projectBudgetUpper: projectUpper,
        threshold: THRESHOLD,
      });
    } catch (err) {
      console.error(`${TAG} error:`, err);
      return res.status(500).json({
        error: "SPOTLIGHT_TRADESMEN_FAILED",
        message: err?.message || String(err),
      });
    }
  });
};