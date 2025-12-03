// server/routes/meta/plans.get.js
//
// GET /api/meta/plans
// Serves the plans from /shared/config/plans.ts to the frontend modal

module.exports = (router, ctx) => {
  const { PLANS } = require("../../../shared/config/plans");
  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/meta/plans";

  /** Sort by planOrder inside config (Free → Unlock → Gold → Spotlight) */
  function sortPlans(list) {
    return list
      .slice()
      .sort((a, b) => {
        const aOrder = typeof a.planOrder === "number" ? a.planOrder : 999;
        const bOrder = typeof b.planOrder === "number" ? b.planOrder : 999;
        return aOrder - bOrder;
      })
      .filter((p) => p.showInPlanModal !== false);
  }

  router.get(PATH, async (req, res) => {
    try {
      const response = {
        currency: PLANS.currency,
        version: PLANS.version,
        plans: sortPlans(PLANS.plans),
      };

      return res.json(response);
    } catch (e) {
      console.error("[meta/plans] error:", e);
      return res.status(500).json({ error: "server_error" });
    }
  });

  if (!ctx.__logged_meta_plans) {
    ctx.__logged_meta_plans = true;
    console.log(`[routes] mounted: GET ${API_BASE}${PATH}`);
  }
};
