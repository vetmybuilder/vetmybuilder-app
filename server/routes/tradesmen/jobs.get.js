// server/routes/tradesmen/jobs.get.js

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireActiveTradesman } = require("../../lib/roles");
  const { scoreMatch } = require("../../lib/ai/jobMatcher");
  const { extractOutward } = require("../../lib/matching/extractOutward");

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
      const mode = String(req.query.mode || "").trim().toLowerCase();
      const isDeck = mode === "deck";

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

      let offset = parseInt(String(req.query.offset || "0"), 10);
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

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

      // Deck mode: exclude projects the builder has already swiped (any status).
      // List mode: still LEFT JOIN swipe_interest so we can return per-row
      // swipe state for UI status pills.
      let joinSql = `LEFT JOIN swipe_interest si ON si.project_id = p.id AND si.builder_uid = ?`;
      params.unshift(uid); // bind for the JOIN (comes before WHERE params)
      if (isDeck) {
        wh.push(`si.id IS NULL`);
      }

      const whereSql = `WHERE ${wh.join(" AND ")}`;

      // For deck mode the uid appears twice: once for the JOIN bind, once for ownerUserId<>?
      // For list mode same — both modes now use the JOIN; deck mode adds the WHERE.
      const rows = await mysqlQuery(
        `
        SELECT p.id, p.name, p.type, p.location, p.createdAt, p.description,
               p.propertyType, p.bedrooms, p.answers_json AS answersJson,
               u.firstName AS ownerFirstName,
               si.id AS matchId,
               si.status AS swipeStatus,
               si.homeowner_swiped_at AS homeownerSwipedAt,
               si.builder_swiped_at AS builderSwipedAt
          FROM projects p
          ${joinSql}
          LEFT JOIN users u ON u.uid = p.ownerUserId
          ${whereSql}
         ORDER BY p.createdAt ${order}
         LIMIT ${limit} OFFSET ${offset}
      `,
        params
      );

      // For count query: same params apply
      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM projects p ${joinSql} LEFT JOIN users u ON u.uid = p.ownerUserId ${whereSql}`,
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

      // Batch-fetch classifications for scoring. mysqlQuery uses prepared
      // statements which don't auto-expand arrays in `IN (?)` — expand the
      // placeholders ourselves.
      const projectIds = rows.map((r) => r.id);
      let classificationMap = {};
      if (projectIds.length > 0) {
        try {
          const placeholders = projectIds.map(() => "?").join(",");
          const classRows = await mysqlQuery(
            `SELECT project_id, structured
             FROM project_classifications
             WHERE project_id IN (${placeholders})
             ORDER BY classified_at DESC`,
            projectIds,
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

        // Parse answers_json safely
        let answersJson = null;
        if (r.answersJson) {
          try {
            answersJson = typeof r.answersJson === "string"
              ? JSON.parse(r.answersJson)
              : r.answersJson;
          } catch {
            answersJson = null;
          }
        }

        // Derive a UI label from the per-builder swipe state. null = the
        // builder hasn't engaged with this project yet → list row keeps the
        // "Open in deck →" affordance.
        let swipeStateLabel = null;
        switch (r.swipeStatus) {
          case "matched":
            swipeStateLabel = "Matched";
            break;
          case "declined_by_builder":
            swipeStateLabel = "You declined";
            break;
          case "declined_by_homeowner":
            swipeStateLabel = "Homeowner passed";
            break;
          case "expired":
            swipeStateLabel = "Expired";
            break;
          case "pending":
            // Pending is bidirectional — split by who hasn't moved yet.
            if (r.homeownerSwipedAt && !r.builderSwipedAt) {
              swipeStateLabel = "Pending your match";
            } else if (!r.homeownerSwipedAt && r.builderSwipedAt) {
              swipeStateLabel = "Awaiting homeowner";
            } else {
              swipeStateLabel = "Pending";
            }
            break;
          default:
            swipeStateLabel = null;
        }

        // Privacy: never leak the full postcode or the homeowner's name to
        // a tradesman browsing the deck. Strip the location to its outward
        // code (e.g. "E4 6AA" -> "E4") and drop ownerFirstName entirely.
        // Doing this in the response shaper means a UI bug can't
        // accidentally re-expose either field.
        const safeLocation = extractOutward(r.location) || "";

        return {
          id: r.id,
          name: r.name,
          type: r.type,
          location: safeLocation,
          description: r.description ?? "",
          createdAt: r.createdAt,
          postedAt: r.createdAt,
          budget: extractBudget(r.description),
          propertyType: r.propertyType ?? null,
          bedrooms: r.bedrooms ?? null,
          ownerFirstName: null,
          aiScore: score.total,
          matchScore: score.total,
          priceBandEstimate: classification.price_band_estimate
            ? String(classification.price_band_estimate).trim() || null
            : null,
          // AI-generated plain-English summary of the job, written to be
          // useful to a tradesman scanning the back face of a deck card.
          // Falls back to the description on the client if absent.
          aiSummary: classification.summary
            ? String(classification.summary).trim() || null
            : null,
          aiKeyConcerns: Array.isArray(classification.key_concerns)
            ? classification.key_concerns
                .map((s) => String(s || "").trim())
                .filter(Boolean)
            : [],
          answersJson,
          swipeStateLabel,
          matchId: r.matchId ?? null,
        };
      });

      // Sort by AI score DESC, then createdAt DESC as tiebreaker
      items.sort((a, b) => {
        if (b.aiScore !== a.aiScore) return b.aiScore - a.aiScore;
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

      // Differentiate "no live projects in the system at all" from
      // "you've swiped through every available job". Empty state copy
      // depends on which one is true.
      let totalLive = 0;
      try {
        const liveRows = await mysqlQuery(
          `SELECT COUNT(*) AS c FROM projects p WHERE p.status='live' AND p.ownerUserId<>?`,
          [uid],
        );
        totalLive = Number(liveRows[0]?.c || 0);
      } catch {
        totalLive = total;
      }

      log.info?.(`${TAG} success`, { uid, total, totalLive, returned: items.length });

      return res.json({ items, total, totalLive });
    } catch (e) {
      log.error?.(`${TAG} error`, { error: e?.message });
      return res.status(500).json({ error: "Failed to load jobs" });
    }
  });
};
