// server/routes/tradesmen/jobs.get.js

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireActiveTradesman } = require("../../lib/roles");

  const log = ctx.log || console;
  const TAG = "[tradesmen/jobs.get]";
  const PATH = "/tradesmen/jobs";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  log.info?.(`${TAG} mounted`);

  const BUDGETS = ["Under £5k", "£5k–£15k", "£15k–£30k", "£30k-£60k", "£60k+"];
  const NORMALIZE_MAP = {
    "£5k-£15k": "£5k–£15k",
    "£15k-£30k": "£15k–£30k",
    "£30k-£60k": "£30k-£60k",
  };

  function extractBudget(desc) {
    let text = String(desc || "");
    for (const [from, to] of Object.entries(NORMALIZE_MAP)) {
      if (text.includes(from)) text = text.replace(from, to);
    }
    for (const b of BUDGETS) if (text.includes(b)) return b;

    const m = text.match(/Budget:\s*([^\.\n\r]+)/i);
    if (m) {
      const candidate = NORMALIZE_MAP[m[1].trim()] || m[1].trim();
      if (BUDGETS.includes(candidate)) return candidate;
    }
    return null;
  }

  router.get(PATH, auth, requireActiveTradesman(ctx), async (req, res) => {
    const uid = req.user.uid;

    log.info?.(`${TAG} request`, { uid, query: req.query });

    try {
      const q = String(req.query.q || "").trim();
      const type = String(req.query.type || "").trim();
      const near = String(req.query.near || "").trim();
      const order =
        String(req.query.order || "newest").toLowerCase() === "oldest"
          ? "ASC"
          : "DESC";

      let limit = parseInt(String(req.query.limit || "50"), 10);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      limit = Math.min(200, Math.max(1, limit));

      const wh = [`p.status='live'`, `p.ownerUserId<>?`];
      const params = [uid];

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

      const whereSql = `WHERE ${wh.join(" AND ")}`;

      const rows = await mysqlQuery(
        `
        SELECT p.id, p.name, p.type, p.location, p.createdAt, p.description
          FROM projects p
          ${whereSql}
         ORDER BY p.createdAt ${order}
         LIMIT ${limit}
      `,
        params
      );

      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM projects p ${whereSql}`,
        params
      );

      const total = Number(countRows[0]?.c || 0);
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        location: r.location,
        createdAt: r.createdAt,
        budget: extractBudget(r.description),
      }));

      log.info?.(`${TAG} success`, { uid, total, returned: items.length });

      return res.json({ items, total });
    } catch (e) {
      log.error?.(`${TAG} error`, { error: e?.message });
      return res.status(500).json({ error: "Failed to load jobs" });
    }
  });
};
