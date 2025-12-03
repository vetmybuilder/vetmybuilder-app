//
// POST /api/payments/checkout
//
// Generates a mock “Stripe-like” checkout session for:
//   • Unlock Contact (one_off)
//   • Spotlight (one_off)
//   • Gold (subscription)
//   • Free → no payment (handled client-side)
//
// This route ONLY CREATES SESSIONS.
// Actual activation happens later via admin approval + mock webhook flow.
//

module.exports = (router, ctx) => {
  const { auth, payments } = ctx;
  const { PLANS } = require("../../../shared/config/plans");

  if (!payments) throw new Error("payments not attached to ctx");

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/payments/checkout";

  // Utility: lookup plan from config
  function getPlan(planId) {
    return PLANS.plans.find((p) => p.id === planId) || null;
  }

  // Utility: calculate real amount in pence
  function resolveAmount(plan, type) {
    if (!plan) return 0;

    if (type === "one_off") {
      const pounds = Number(plan.priceOnce || 0);
      return Math.round(pounds * 100);
    }
    if (type === "subscription") {
      const pounds = Number(plan.priceMonthly || 0);
      return Math.round(pounds * 100);
    }
    return 0;
  }

  router.post(PATH, auth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "unauthorized" });

      const {
        planId,
        type, // "one_off" | "subscription"
        projectId,
        currency,
        origin,
        metadata,
      } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "planId_required" });
      }

      const plan = getPlan(planId);
      if (!plan) {
        return res.status(400).json({ error: "invalid_plan" });
      }

      const billingType = plan.type; // one_off | subscription
      const finalType = type || billingType;

      // --------- FREE PLAN → skip checkout ---------
      if (plan.id === "free") {
        return res.json({
          ok: true,
          free: true,
          planId: "free",
          note: "Free plan does not require checkout",
        });
      }

      // --------- Validate required parameters ---------
      if (!currency) {
        return res.status(400).json({ error: "currency_missing" });
      }
      if (!origin) {
        return res.status(400).json({ error: "origin_missing" });
      }

      // Unlock Contact → MUST include projectId
      if (plan.id === "unlock_contact" && !projectId) {
        return res
          .status(400)
          .json({ error: "projectId_required_for_unlock_contact" });
      }

      // --------- Amount calculation ---------
      const amountPence = resolveAmount(plan, finalType);
      if (!Number.isFinite(amountPence) || amountPence <= 0) {
        return res.status(400).json({
          error: "invalid_amount",
          detail: `Plan ${planId} has invalid pricing.`,
        });
      }

      // --------- Build session metadata ---------
      const sessionMeta = {
        planId,
        vmb_type: finalType,
        ...(projectId ? { projectId } : {}),
        ...(metadata || {}),
      };

      // --------- Create mock checkout session ---------
      const session = payments.createSession({
        userId: uid,
        type: finalType, // one_off / subscription
        items: [
          {
            price: {
              amount: amountPence,
              currency,
            },
            quantity: 1,
          },
        ],
        metadata: sessionMeta,
        success_url: req.body.success_url || `${origin}/payments/mock/success`,
        cancel_url: req.body.cancel_url || `${origin}/payments/mock/cancel`,
      });

      if (!session) {
        return res.status(500).json({ error: "could_not_create_session" });
      }

      return res.json({
        ok: true,
        sessionId: session.id,
        session,
        hosted_url: `${origin}/payments/mock/checkout/${session.id}`,
      });
    } catch (e) {
      console.error("[checkout.post] error:", e);
      return res.status(500).json({ error: "server_error", detail: e.message });
    }
  });

  if (!ctx.__logged_payments_checkout) {
    ctx.__logged_payments_checkout = true;
    console.log(`[routes] mounted: POST ${API_BASE}${PATH}`);
  }
};
