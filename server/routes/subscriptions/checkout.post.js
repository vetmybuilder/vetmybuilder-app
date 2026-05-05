// server/routes/subscriptions/checkout.post.js
//
// POST /api/subscriptions/checkout
// Body: { tier: "week_1" | "week_2" | "month_1" }
// Returns { ok, hosted_url, sessionId, tier }.

const { isValidTier } = require("../../lib/subscriptions/tiers");

module.exports = function mountSubscriptionCheckout(router, ctx) {
  const { auth, payments } = ctx;
  if (!payments) throw new Error("payments not attached to ctx");

  router.post("/subscriptions/checkout", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const tier = req.body?.tier;
    if (!isValidTier(tier)) {
      return res.status(400).json({ error: "Unknown or missing tier" });
    }

    try {
      const session = await payments.createSubscriptionCheckout({
        userId: uid,
        tier,
        success_url: `${process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000"}/tradesman/billing?subscribed=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000"}/tradesman/billing?canceled=1`,
      });
      return res.status(200).json({
        ok: true,
        sessionId: session.id,
        hosted_url: session.hosted_url,
        tier: session.tier,
      });
    } catch (e) {
      return res
        .status(500)
        .json({ error: e?.message || "Failed to create subscription session" });
    }
  });
};
