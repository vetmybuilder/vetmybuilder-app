// server/routes/projects/unlock-contact.checkout.post.js
//
// POST /api/projects/:id/unlock-contact/checkout
// Auth: tradesman required
// Creates a mock checkout session to unlock THIS project's owner contact.
// Returns { ok, sessionId, url }

const {
  isBuilderSubscribed,
} = require("../../lib/subscriptions/isBuilderSubscribed");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, payments } = ctx;
  const log = ctx.log || console;
  const TAG = "[unlock-contact.checkout.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  if (!payments) throw new Error("payments not attached to ctx");

  router.post(
    "/projects/:id/unlock-contact/checkout",
    auth,
    async (req, res) => {
      const uid = req.user?.uid;

      log.info?.(`${TAG} start`, { uid, projectId: req.params.id });

      const introMessage =
        typeof req.body?.introMessage === "string"
          ? req.body.introMessage.trim().slice(0, 1000)
          : "";

      try {
        if (!uid) {
          log.warn?.(`${TAG} unauthorized (no uid)`);
          return res.status(401).json({ error: "Unauthorized" });
        }

        // CCR 2013: refuse to create the checkout session without an
        // explicit immediate-supply waiver. The client must surface a
        // checkbox and pass waiverAccepted: true with the request body.
        if (req.body?.waiverAccepted !== true) {
          log.warn?.(`${TAG} rejected: waiver_required`, { uid });
          return res.status(400).json({ error: "waiver_required" });
        }

        // --- Verify tradesman ---
        const actorRows = await mysqlQuery(
          `SELECT user_id
             FROM tradesmen
            WHERE user_id = ?
            LIMIT 1`,
          [uid]
        );
        const actor = actorRows[0] || null;
        if (!actor) {
          log.warn?.(`${TAG} not a tradesman`, { uid });
          return res.status(403).json({
            error: "Only registered tradesmen can purchase unlocks",
          });
        }

        // --- Validate project ---
        const pid = Number(req.params.id);
        if (!Number.isFinite(pid) || pid <= 0) {
          log.warn?.(`${TAG} invalid project id`, { pid });
          return res.status(400).json({ error: "Invalid project ID" });
        }

        const projectRows = await mysqlQuery(
          `SELECT id, status
             FROM projects
            WHERE id = ?
            LIMIT 1`,
          [pid]
        );
        const project = projectRows[0] || null;
        if (!project) {
          log.warn?.(`${TAG} project not found`, { pid });
          return res.status(404).json({ error: "Project not found" });
        }

        const status = String(project.status || "").toLowerCase();
        if (status !== "live") {
          log.warn?.(`${TAG} project not live`, { pid, status });
          return res
            .status(400)
            .json({ error: "Only live projects can be unlocked" });
        }

        // --- Already-declined guard ---
        // Paid-unlock buys a boosted slot in the homeowner's swipe deck.
        // If the homeowner has already left-swiped this trade for this
        // project, they're not getting a second look - block at checkout
        // so the trade doesn't burn a payment. Terminal swipe states
        // ('declined_by_homeowner') are sticky in matches.get.js too.
        const declinedRows = await mysqlQuery(
          `SELECT 1 AS ok
             FROM swipe_interest
            WHERE project_id = ?
              AND builder_uid = ?
              AND status = 'declined_by_homeowner'
            LIMIT 1`,
          [pid, uid]
        );
        if (declinedRows.length > 0) {
          log.info?.(`${TAG} blocked: homeowner already declined`, {
            uid,
            pid,
          });
          return res.status(409).json({
            error: "homeowner_already_declined",
            message:
              "This homeowner has already passed on your card for this project. You can't unlock again.",
          });
        }

        // --- Subscription supersedes paid-unlock ---
        // Subscribers already have unlimited swipe / chat access via the
        // bilateral match flow, so charging them again per project would
        // be double-billing. Reject before creating the checkout session
        // and tell the client where to send the user instead. The UI
        // gates the CTA on the same condition; this is the API safety
        // net for direct calls.
        const subscribed = await isBuilderSubscribed(uid, mysqlQuery);
        if (subscribed) {
          log.info?.(`${TAG} blocked: subscriber attempted paid unlock`, {
            uid,
            pid,
          });
          return res.status(409).json({
            error: "already_subscribed",
            alreadySubscribed: true,
            message:
              "You're already subscribed - swipe right to chat free once the homeowner picks you back.",
          });
        }

        // --- Already unlocked? ---
        const existingRows = await mysqlQuery(
          `SELECT 1 AS ok
             FROM project_contact_unlocks
            WHERE project_id = ?
              AND buyer_uid = ?
              AND status IN ('paid', 'active')
            LIMIT 1`,
          [pid, uid]
        );
        if (existingRows.length > 0) {
          log.info?.(`${TAG} already unlocked`, { uid, pid });
          // Surface the matched swipe_interest row created at activation so
          // the client can route directly to /chat/:matchId.
          const m = await mysqlQuery(
            `SELECT id FROM swipe_interest
              WHERE project_id = ? AND builder_uid = ? AND source = 'paid_unlock'
              LIMIT 1`,
            [pid, uid]
          );
          const matchId = m?.[0]?.id || null;
          return res.json({
            ok: true,
            alreadyUnlocked: true,
            matchId,
            message: "Contact already unlocked for this project",
          });
        }

        // --- Determine unlock price based on project value ---
        let unitAmount = 999; // default £9.99

        if (Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE) > 0) {
          unitAmount = Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE);
        } else {
          try {
            const { parsePriceBand } = require("../../lib/pricingLookup");
            const classRows = await mysqlQuery(
              "SELECT structured FROM project_classifications WHERE project_id = ? ORDER BY id DESC LIMIT 1",
              [pid]
            );
            if (classRows.length > 0 && classRows[0].structured) {
              const parsed = typeof classRows[0].structured === "string"
                ? JSON.parse(classRows[0].structured)
                : classRows[0].structured;
              const band = parsePriceBand(parsed?.price_band_estimate);
              if (band) {
                const maxPounds = band.max / 100;
                if (maxPounds <= 1000) unitAmount = 299;
                else if (maxPounds <= 5000) unitAmount = 499;
                else if (maxPounds <= 15000) unitAmount = 999;
                else unitAmount = 1499;
              }
            }
          } catch {}
        }

        const productName =
          process.env.ONEOFF_UNLOCK_PRODUCT_NAME || "Unlock job details";

        // --- Create checkout session (Stripe or mock) ---
        const isStripe = !!payments.isStripe;
        const successUrl = isStripe
          ? `${process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000"}/payments/success?sessionId={CHECKOUT_SESSION_ID}&projectId=${pid}`
          : undefined;
        const cancelUrl = isStripe
          ? `${process.env.NEXT_PUBLIC_WEB_BASE || "http://localhost:3000"}/tradesman/jobs`
          : undefined;

        const session = await payments.createSession({
          userId: uid,
          items: [
            {
              label: `${productName} - Project #${pid}`,
              price: { amount: unitAmount, currency: "GBP" },
              quantity: 1,
            },
          ],
          metadata: {
            type: "unlock_contact",
            vmb_type: "unlock_contact",
            projectId: String(pid),
            vmb_project_id: String(pid),
            buyerUid: uid,
            introMessage,
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
          ttlSeconds: 15 * 60,
        });

        log.info?.(`${TAG} session created`, {
          uid,
          pid,
          sessionId: session.id,
          isStripe,
        });

        const checkoutUrl = isStripe
          ? session.hosted_url
          : `/payments/mock/checkout/${session.id}`;

        res.json({
          ok: true,
          sessionId: session.id,
          url: checkoutUrl,
        });
        ctx.logActivity("contact.unlock", "info", req.user?.uid, `Contact unlock for project #${pid}`);
        return;
      } catch (e) {
        log.error?.(`${TAG} error`, e);
        return res.status(500).json({
          error: e?.message || "Failed to create checkout session",
        });
      }
    }
  );
};
