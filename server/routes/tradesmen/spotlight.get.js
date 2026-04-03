// server/routes/tradesmen/spotlight.get.js
/**
 * GET /api/tradesmen/spotlight
 * Auth: required
 *
 * Query:
 *   projectId=123
 *   limit?=999  (server caps 200)
 *
 * Rules:
 *   - One-off payment type='spotlight', status='active', expires_at > NOW()
 *   - Tradesman must not be banned
 *   - Project’s upper budget must be >= £15,000
 *   - Fair rotation using tradesmen_spotlight_views
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/spotlight.get]";
  const ROUTE = "/tradesmen/spotlight";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  /* -------------------------------------------------------------------------- */
  /*                               HELPERS                                      */
  /* -------------------------------------------------------------------------- */

  async function tableExists(name) {
    try {
      const safe = name.replace(/[`]/g, "");
      const rows = await mysqlQuery(`SHOW TABLES LIKE '${safe}'`);
      return rows.length > 0;
    } catch (e) {
      log.warn(`${TAG} tableExists(${name}) failed`, {
        error: e?.message || e,
      });
      return false;
    }
  }

  /* ----- Budget helpers ----------------------------------------------------- */

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

  const parseMoneyUpperFromText = (txt = "") => {
    txt = String(txt)
      .replace(/–|—/g, "-")
      .replace(/\bto\b/gi, "-");

    const regex = /£?\s*([0-9]{1,3}(?:,[0-9]{3})*|\d+(?:\.\d+)?)(k|m)?/gi;
    const values = [];
    let m;

    while ((m = regex.exec(txt))) {
      let v = parseFloat(m[1].replace(/,/g, ""));
      if ((m[2] || "").toLowerCase() === "k") v *= 1000;
      if ((m[2] || "").toLowerCase() === "m") v *= 1_000_000;
      if (Number.isFinite(v)) values.push(v);
    }

    return values.length ? Math.max(...values) : 0;
  };

  async function getProjectUpperBudget(projectId) {
    if (!(await tableExists("projects"))) return 0;

    const rows = await mysqlQuery(
      `SELECT * FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );
    const row = rows[0];
    if (!row) return 0;

    const pick = (keys) => {
      for (const k of keys) {
        if (row[k] != null && Number(row[k]) > 0) return Number(row[k]);
      }
      return null;
    };

    const upper = pick(NUM_KEYS_UPPER);
    if (upper != null) return upper;

    const lower = pick(NUM_KEYS_LOWER);
    if (lower != null) return lower;

    return parseMoneyUpperFromText(
      row.description || row.details || row.summary || row.notes || ""
    );
  }

  /* ----- Photo URL helper -------------------------------------------------- */

  const makeAbsolute = (url) => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;

    const base =
      process.env.MEDIA_BASE_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "";

    if (!base) return url.startsWith("/") ? url : `/${url}`;
    return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  };

  async function ensureViewsTable() {
    try {
      await mysqlQuery(`
        CREATE TABLE IF NOT EXISTS tradesmen_spotlight_views (
          tradesman_user_id VARCHAR(255) NOT NULL PRIMARY KEY,
          views INT NOT NULL DEFAULT 0,
          last_viewed_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } catch (e) {
      log.error(`${TAG} failed to ensure views table`, {
        error: e?.message || e,
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                 ROUTE                                      */
  /* -------------------------------------------------------------------------- */

  router.get(ROUTE, auth, async (req, res) => {
    const projectId = Number(req.query.projectId || "");
    const limitReq = parseInt(req.query.limit ?? "999", 10);
    const limit = Math.min(200, Math.max(1, limitReq));

    log.info(`${TAG} hit`, { projectId, limit });

    if (!projectId) {
      log.warn(`${TAG} missing projectId`);
      return res.status(400).json({
        error: "SPOTLIGHT_TRADESMEN_FAILED",
        message: "projectId is required",
      });
    }

    try {
      const hasTradesmen = await tableExists("tradesmen");
      const hasOneoff = await tableExists("payments_oneoff");

      if (!hasTradesmen || !hasOneoff) {
        log.warn(`${TAG} required tables missing`, { hasTradesmen, hasOneoff });
        const projectUpper = await getProjectUpperBudget(projectId);

        return res.json({
          items: [],
          total: 0,
          page: 1,
          limit: 0,
          projectUpper,
          threshold: 15000,
        });
      }

      const projectUpper = await getProjectUpperBudget(projectId);
      const THRESHOLD = 15000;

      log.info(`${TAG} budget check`, { projectUpper, threshold: THRESHOLD });

      if (projectUpper < THRESHOLD) {
        return res.json({
          items: [],
          total: 0,
          page: 1,
          limit: 0,
          projectUpper,
          threshold: THRESHOLD,
        });
      }

      const nowIso = new Date().toISOString();

      const rows = await mysqlQuery(
        `
        SELECT
          t.user_id AS userId,
          t.public_id AS publicId,
          t.company_name AS companyName,
          t.contact_name AS contactName,
          t.status AS tStatus,
          o.expires_at AS expiresAt
        FROM payments_oneoff o
        JOIN tradesmen t ON t.user_id = o.user_id
        WHERE LOWER(o.type) = 'spotlight'
          AND LOWER(o.status) = 'active'
          AND (o.expires_at IS NULL OR o.expires_at > ?)
          AND COALESCE(t.status, 'active') != 'banned'
        ORDER BY o.expires_at ASC
        `,
        [nowIso]
      );

      log.info(`${TAG} spotlight count`, { count: rows.length });

      if (!rows.length) {
        return res.json({
          items: [],
          total: 0,
          page: 1,
          limit,
          projectUpper,
          threshold: THRESHOLD,
        });
      }

      const hasTP1 = await tableExists("tradesman_photos");
      const hasTP2 = await tableExists("tradesmen_photos");
      const PHOTO_TABLE = hasTP1
        ? "tradesman_photos"
        : hasTP2
        ? "tradesmen_photos"
        : null;

      log.info(`${TAG} photo table`, { PHOTO_TABLE });

      async function loadPhotos(userId) {
        if (!PHOTO_TABLE) return [];
        const rows = await mysqlQuery(
          `
          SELECT url
          FROM ${PHOTO_TABLE}
          WHERE tradesman_user_id = ?
          ORDER BY COALESCE(sort_order, 9999), created_at
          `,
          [userId]
        );
        return rows.map((x) => makeAbsolute(x.url));
      }

      await ensureViewsTable();

      const viewRows = await mysqlQuery(
        `SELECT tradesman_user_id, views, last_viewed_at FROM tradesmen_spotlight_views`
      );

      const viewMap = new Map(
        viewRows.map((v) => [String(v.tradesman_user_id), v])
      );

      const sorted = rows
        .map((r) => {
          const v = viewMap.get(String(r.userId));
          return {
            ...r,
            __views: Number(v?.views || 0),
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
        const gallery = await loadPhotos(r.userId);

        items.push({
          builderId: String(r.userId),
          publicId: r.publicId || null,
          companyName: r.companyName || null,
          displayName: r.companyName || r.contactName || "Tradesman",
          tierActiveUntil: r.expiresAt || null,
          gallery,
        });
      }

      log.info(`${TAG} returning spotlight items`, {
        count: items.length,
      });

      for (const item of items) {
        await mysqlQuery(
          `
          INSERT INTO tradesmen_spotlight_views (tradesman_user_id, views, last_viewed_at)
          VALUES (?, 1, NOW())
          ON DUPLICATE KEY UPDATE views = views + 1, last_viewed_at = NOW()
          `,
          [item.builderId]
        );
      }

      return res.json({
        items,
        total: rows.length,
        page: 1,
        limit,
        projectUpper,
        threshold: THRESHOLD,
      });
    } catch (e) {
      log.error(`${TAG} failed`, { error: e?.message || e });
      return res.status(500).json({
        error: "SPOTLIGHT_TRADESMEN_FAILED",
        message: e?.message || String(e),
      });
    }
  });

  if (!ctx.__logged_spotlight_get) {
    ctx.__logged_spotlight_get = true;
    log.info(`[routes] mounted: GET ${ROUTE}`);
  }
};
