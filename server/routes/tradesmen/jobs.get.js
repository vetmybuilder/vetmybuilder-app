// server/routes/tradesmen/jobs.get.js

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireActiveTradesman } = require("../../lib/roles");
  const { scoreMatch } = require("../../lib/ai/jobMatcher");

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

      // Fetch tradesman's trades + service areas for scoring
      let tradesmanTrades = [];
      let tradesmanAreas = [];
      try {
        const profileRows = await mysqlQuery(
          `SELECT trade_types, service_areas FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [uid],
        );
        if (profileRows.length > 0) {
          tradesmanTrades = String(profileRows[0].trade_types || "").split(",").filter(Boolean);
          tradesmanAreas = String(profileRows[0].service_areas || "").split(",").filter(Boolean);
        }
      } catch (err) {
        log.warn?.(`${TAG} profile lookup failed`, { uid, error: err?.message });
      }

      // Batch-fetch classifications for scoring
      const projectIds = rows.map((r) => r.id);
      let classificationMap = {};
      if (projectIds.length > 0) {
        try {
          const classRows = await mysqlQuery(
            `SELECT project_id, structured
             FROM project_classifications
             WHERE project_id IN (?)
             ORDER BY classified_at DESC`,
            [projectIds],
          );
          for (const cr of classRows) {
            if (!classificationMap[cr.project_id]) {
              const parsed = typeof cr.structured === "string"
                ? JSON.parse(cr.structured)
                : cr.structured;
              classificationMap[cr.project_id] = parsed;
            }
          }
        } catch (err) {
          log.warn?.(`${TAG} classification lookup failed`, { error: err?.message });
        }
      }

      const items = rows.map((r) => {
        const classification = classificationMap[r.id] || {};
        const score = scoreMatch({
          tradesmanTrades,
          tradesmanAreas,
          projectType: r.type || "",
          projectLocation: r.location || "",
          recommendedTrades: classification.recommended_trades || [],
          projectCreatedAt: r.createdAt,
        });
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          location: r.location,
          createdAt: r.createdAt,
          budget: extractBudget(r.description),
          matchScore: score.total,
        };
      });

      // Sort by match score DESC, then createdAt DESC
      items.sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      // Fire-and-forget: log match observations for future re-ranker
      Promise.resolve().then(async () => {
        try {
          for (let i = 0; i < items.length; i++) {
            await mysqlQuery(
              `INSERT IGNORE INTO match_observations
                (project_id, tradesman_user_id, surface_context, rank_position, match_score, surfaced_at)
              VALUES (?, ?, 'jobs_list', ?, ?, NOW())`,
              [items[i].id, uid, i + 1, items[i].matchScore],
            );
          }
        } catch {
          // never block the response
        }
      });

      log.info?.(`${TAG} success`, { uid, total, returned: items.length });

      return res.json({ items, total });
    } catch (e) {
      log.error?.(`${TAG} error`, { error: e?.message });
      return res.status(500).json({ error: "Failed to load jobs" });
    }
  });
};
