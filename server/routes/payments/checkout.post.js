// server/routes/payments/checkout.post.js
//
// POST /api/payments/checkout
//
// Creates a mock “Stripe-like” checkout session for:
//   • Unlock Contact (one_off)
//   • Spotlight (one_off)
//   • Gold (subscription)
//   • Free → no payment needed
//
// This route CREATES checkout sessions only.
// Activation occurs later through the admin approval + mock webhook pipeline.
//

module.exports = (router, ctx) => {
  const { auth, payments } = ctx;
  const { logger, withRequest } = require("../../lib/logger");
  const { PLANS } = require("../../../shared/config/plans");

  if (!payments) throw new Error("payments not attached to ctx");

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/payments/checkout";

  /** Lookup a plan by ID */
  function getPlan(planId) {
    return PLANS.plans.find((p) => p.id === planId) || null;
  }

  /** Calculate price (in pence) */
  function resolveAmount(plan, type) {
    if (!plan) return 0;

    const toPence = (pounds) => Math.round(Number(pounds) * 100);

    if (type === "one_off") {
      return toPence(plan.priceOnce ?? 0);
    }
    if (type === "subscription") {
      return toPence(plan.priceMonthly ?? 0);
    }
    return 0;
  }

  router.post(PATH, auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "POST /api/payments/checkout",
    });

    try {
      const uid = req.user?.uid;
      if (!uid) {
        log.warn("Unauthorized attempt to access checkout");
        return res.status(401).json({ error: "unauthorized" });
      }

      const {
        planId,
        type, // overrides plan.type
        projectId,
        currency,
        origin,
        metadata,
      } = req.body;

      log.debug({ uid, planId, type, projectId }, "Checkout request received");

      if (!planId) {
        log.warn("Missing planId in request");
        return res.status(400).json({ error: "planId_required" });
      }

      const plan = getPlan(planId);
      if (!plan) {
        log.warn({ uid, planId }, "Invalid plan requested");
        return res.status(400).json({ error: "invalid_plan" });
      }

      const billingType = plan.type; // one_off | subscription
      const finalType = type || billingType;

      // FREE PLAN → no checkout
      if (plan.id === "free") {
        log.info({ uid }, "Free plan selected → no checkout session needed");
        return res.json({
          ok: true,
          free: true,
          planId: "free",
          note: "Free plan does not require checkout",
        });
      }

      // Validate parameters
      if (!currency) {
        log.warn({ uid }, "currency missing");
        return res.status(400).json({ error: "currency_missing" });
      }
      if (!origin) {
        log.warn({ uid }, "origin missing");
        return res.status(400).json({ error: "origin_missing" });
      }

      // Unlock contact must specify projectId
      if (plan.id === "unlock_contact" && !projectId) {
        log.warn({ uid }, "Missing projectId for unlock_contact");
        return res
          .status(400)
          .json({ error: "projectId_required_for_unlock_contact" });
      }

      // Price calculation
      const amountPence = resolveAmount(plan, finalType);
      if (!Number.isFinite(amountPence) || amountPence <= 0) {
        log.error(
          { uid, planId, finalType, amountPence },
          "Computed invalid amount"
        );
        return res.status(400).json({
          error: "invalid_amount",
          detail: `Plan ${planId} has invalid pricing.`,
        });
      }

      // Build session metadata
      const sessionMeta = {
        planId,
        vmb_type: finalType,
        ...(projectId ? { projectId } : {}),
        ...(metadata || {}),
      };

      // Create mock checkout session
      const session = await payments.createSession({
        userId: uid,
        type: finalType,
        items: [
          {
            price: { amount: amountPence, currency },
            quantity: 1,
          },
        ],
        metadata: sessionMeta,
        success_url: req.body.success_url || `${origin}/payments/mock/success`,
        cancel_url: req.body.cancel_url || `${origin}/payments/mock/cancel`,
      });

      if (!session) {
        log.error({ uid, planId }, "payments.createSession returned null");
        return res.status(500).json({ error: "could_not_create_session" });
      }

      log.info(
        { uid, sessionId: session.id, planId, finalType, amountPence },
        "Checkout session created"
      );

      res.json({
        ok: true,
        sessionId: session.id,
        session,
        hosted_url: `${origin}/payments/mock/checkout/${session.id}`,
      });
      ctx.logActivity("payment.checkout", "info", req.user.uid, "Checkout session created");
      return;
    } catch (e) {
      log.error(
        { errMsg: e?.message, stack: e?.stack },
        "Unhandled error in checkout"
      );
      return res
        .status(500)
        .json({ error: "server_error", detail: e?.message });
    }
  });

  if (!ctx.__logged_payments_checkout) {
    ctx.__logged_payments_checkout = true;
    logger.info(`[routes] mounted: POST ${API_BASE}${PATH}`);
  }
};
