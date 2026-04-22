// server/routes/projects/unlock-contact.checkout.post.js
//
// POST /api/projects/:id/unlock-contact/checkout
// Auth: tradesman required
// Creates a mock checkout session to unlock THIS project's owner contact.
// Returns { ok, sessionId, url }

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

      try {
        if (!uid) {
          log.warn?.(`${TAG} unauthorized (no uid)`);
          return res.status(401).json({ error: "Unauthorized" });
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
          return res.json({
            ok: true,
            alreadyUnlocked: true,
            message: "Contact already unlocked for this project",
          });
        }

        // --- Determine price ---
        const unitAmount =
          Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE) > 0
            ? Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE)
            : 299; // default £2.99

        const productName =
          process.env.ONEOFF_UNLOCK_PRODUCT_NAME || "Unlock homeowner contact";

        // --- Create mock checkout session ---
        const session = await payments.createSession({
          userId: uid,
          items: [
            {
              label: `${productName} · Project #${pid}`,
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
          },
          ttlSeconds: 15 * 60,
        });

        log.info?.(`${TAG} session created`, {
          uid,
          pid,
          sessionId: session.id,
        });

        res.json({
          ok: true,
          sessionId: session.id,
          url: `/payments/mock/checkout/${session.id}`,
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
