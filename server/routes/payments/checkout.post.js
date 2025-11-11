// server/routes/payments/checkout.post.js
//
// Creates a checkout session for one_off or subscription purchases.
// Requirements for the mock driver: userId must be provided.

module.exports = (router, ctx) => {
  const log = ctx.log || console;

  // Try to load a server-side plan helper (optional)
  let getPlan;
  try {
    const plansLib = require("../../lib/plans");
    getPlan = plansLib.getPlan || null;
  } catch {
    getPlan = null;
  }

  // Helper to pull a user id off the request in as many formats as possible
  function resolveUserId(req) {
    return (
      req.user?.uid ||
      req.user?.id ||
      req.auth?.uid ||
      req.account?.user_id ||
      req.session?.user?.id ||
      req.headers["x-user-id"] ||
      null
    );
  }

  async function handler(req, res) {
    try {
      if (!ctx.payments || typeof ctx.payments.createSession !== "function") {
        return res
          .status(500)
          .json({ error: "payments instance unavailable (no createSession)" });
      }

      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "mock_payment: userId required" });
      }

      const {
        type, // "one_off" | "subscription"
        planId, // e.g. "unlock_contact" | "spotlight" | "gold"
        amountPence, // client-side computed fallback (from plan config)
        currency = "GBP",
        items, // optional richer items payload
        entity_type,
        entity_id,
        projectId, // alias for entity_id when entity_type === "project"
        metadata = {},
        success_url,
        cancel_url,
        origin,
      } = req.body || {};

      const t = String(type || "").trim();
      if (t !== "one_off" && t !== "subscription") {
        return res
          .status(400)
          .json({ error: "Unsupported type: " + String(type) });
      }

      // Resolve price: prefer server plan if available, else fall back to amountPence/items
      let serverAmount = null;
      if (planId && getPlan) {
        try {
          const plan = getPlan(String(planId));
          if (plan?.billing) {
            if (t === "one_off" && plan.billing.priceOnce != null) {
              serverAmount = Math.round(Number(plan.billing.priceOnce) * 100);
            } else if (
              t === "subscription" &&
              plan.billing.priceMonthly != null
            ) {
              serverAmount = Math.round(
                Number(plan.billing.priceMonthly) * 100
              );
            }
          }
        } catch {
          // ignore and fall back
        }
      }

      let finalAmount =
        (Number.isFinite(serverAmount) && serverAmount) ||
        (Number.isFinite(Number(amountPence)) && Number(amountPence)) ||
        (Array.isArray(items) && Number(items[0]?.price?.amount)) ||
        null;

      if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
        return res.status(400).json({
          error: "Unable to resolve amount",
          hint: "Send amountPence or ensure server plan config contains this planId",
        });
      }

      const eid = entity_id || projectId || null;
      const etype = entity_type || (projectId ? "project" : null);

      const sessionPayload = {
        type: t,
        userId, // ✅ required by mock driver
        currency,
        amount: finalAmount,
        planId: planId || null,
        items:
          Array.isArray(items) && items.length
            ? items
            : [
                {
                  label:
                    t === "one_off"
                      ? planId === "unlock_contact"
                        ? "Unlock homeowner contact"
                        : `One-off: ${planId || "purchase"}`
                      : `Subscription: ${planId || "plan"}`,
                  price: { amount: finalAmount, currency },
                  quantity: 1,
                },
              ],
        metadata: {
          ...metadata,
          planId: planId || metadata.planId,
          entity_type: etype,
          entity_id: eid,
        },
        success_url:
          success_url ||
          (origin
            ? `${origin}/payments/mock/success?session_id={SESSION_ID}`
            : null),
        cancel_url:
          cancel_url ||
          (origin
            ? `${origin}/payments/mock/cancel?session_id={SESSION_ID}`
            : null),
      };

      // Helpful breadcrumb while we stabilise
      log.info?.("[payments][checkout] creating session", {
        userId,
        type: t,
        planId,
        amount: finalAmount,
      });

      const session = await ctx.payments.createSession(sessionPayload);

      return res.json({
        ok: true,
        sessionId: session?.id || session?.session_id || null,
        hosted_url:
          session?.hosted_url ||
          session?.url ||
          (session?.id
            ? `/payments/mock/checkout/${encodeURIComponent(session.id)}`
            : null),
        session,
      });
    } catch (e) {
      log.info?.("[payments][checkout] error", e?.message || e);
      return res
        .status(500)
        .json({ error: "internal_error", details: e?.message || String(e) });
    }
  }

  // Register route + a trailing-slash alias (some proxies normalize differently)
  router.post("/payments/checkout", ctx.auth, handler);
  router.post("/payments/checkout/", ctx.auth, handler);

  // Mount log so you can verify in the console that it’s active
  if (!ctx.__logged_payments_checkout) {
    ctx.__logged_payments_checkout = true;
    const base = ctx.API_PREFIX || "/api";
    console.log(`[routes] mounted: POST ${base}/payments/checkout`);
  }
};
