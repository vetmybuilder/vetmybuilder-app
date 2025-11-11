/**
 * GET /api/tradesmen/jobs
 * Auth: ACTIVE tradesman only
 * Query: q, type, near, order=newest|oldest (default newest), limit (default 50)
 * Response: { items: [{id,name,type,location,createdAt,budget}], total }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { requireActiveTradesman } = require("../../lib/roles");

  const BASE = (ctx.API_PREFIX || "/api").replace(/\/+$/, "");
  const at = (p) => `${BASE}${p.startsWith("/") ? p : `/${p}`}`;
  // IMPORTANT: no "/api" here — the app mounts the router at /api already.
  const PATH = "/tradesmen/jobs";

  // Log when the file mounts so you can see it in the server boot
  console.log(`[routes] mounted: GET ${PATH}`);

  // --- Budget extraction helpers ---
  const BUDGETS = ["Under £5k", "£5k–£15k", "£15k–£30k", "£30k–£60k", "£60k+"];

  // Handle both en dash (–) and hyphen (-) variants that might appear in text
  const NORMALIZE_MAP = {
    "£5k-£15k": "£5k–£15k",
    "£15k-£30k": "£15k–£30k",
    "£30k-£60k": "£30k–£60k",
  };

  function extractBudget(desc) {
    const raw = String(desc || "");
    let text = raw;

    // Normalize common variants so matching is reliable
    for (const [from, to] of Object.entries(NORMALIZE_MAP)) {
      if (text.includes(from)) text = text.replace(from, to);
    }

    // Quick exact match against the known buckets
    for (const b of BUDGETS) {
      if (text.includes(b)) return b;
    }

    // Fallback: look for "Budget: <value>" pattern (just in case)
    const m = text.match(/Budget:\s*([^\.\n\r]+)/i);
    if (m) {
      const candidate = m[1].trim();
      // Normalize the candidate and try to map to one of our buckets
      const normalized = NORMALIZE_MAP[candidate] || candidate;
      if (BUDGETS.includes(normalized)) return normalized;
    }

    return null;
  }

  router.get(PATH, auth, requireActiveTradesman(ctx), (req, res) => {
    const uid = req.user.uid;
    // Log each hit to help you diagnose path / auth issues
    console.log(`[jobs] hit by uid=${uid} q=%j`, req.query);
    console.log(
      `[trades/jobs] uid=${uid} role=${
        req.userRole
      } hasProfile=${!!req.tradesman} status=${req.tradesman?.status}`
    );

    // --- filters / sorting ---
    const q = String(req.query.q || "").trim();
    const type = String(req.query.type || "").trim();
    const near = String(req.query.near || "").trim();
    const order =
      String(req.query.order || "newest").toLowerCase() === "oldest"
        ? "ASC"
        : "DESC";

    let limit = parseInt(String(req.query.limit || "50"), 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.max(1, Math.min(200, limit));

    const wh = [`p.status = 'live'`];
    const params = [];

    if (q) {
      wh.push(`(p.name LIKE ? OR p.description LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }
    if (type) {
      wh.push(`p.type LIKE ?`);
      params.push(`%${type}%`);
    }
    if (near) {
      wh.push(`p.location LIKE ?`);
      params.push(`%${near}%`);
    }

    // Tradesman shouldn’t see their *own* projects (defensive, usually none)
    wh.push(`p.ownerUserId <> ?`);
    params.push(uid);

    const whereSql = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    try {
      // Pull description so we can parse out the budget, but don't return it raw
      const rows = db
        .prepare(
          `
            SELECT p.id, p.name, p.type, p.location, p.createdAt, p.description
            FROM projects p
            ${whereSql}
            ORDER BY p.createdAt ${order}
            LIMIT ?
          `
        )
        .all(...params, limit);

      const total = db
        .prepare(
          `
            SELECT COUNT(*) AS c
            FROM projects p
            ${whereSql}
          `
        )
        .get(...params).c;

      const items = rows.map(({ description, ...r }) => ({
        ...r,
        budget: extractBudget(description),
      }));

      console.log(`[jobs] ok uid=${uid} items=${items.length} total=${total}`);
      return res.json({ items, total });
    } catch (e) {
      console.error("[jobs] error", e);
      return res.status(500).json({ error: "Failed to load jobs" });
    }
  });
};
