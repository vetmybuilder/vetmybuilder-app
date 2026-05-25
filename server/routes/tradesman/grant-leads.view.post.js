// server/routes/tradesman/grant-leads.view.post.js
//
// POST /api/tradesman/grant-leads/:id/view
//
// Tradesperson-only. Stamps `viewed_at = NOW()` on the lead row if
// the row is assigned to the calling user and hasn't been viewed yet.
// Drives the "NEW" pill on the trade-facing lead card - tapping View
// marks the lead as seen across all devices.
//
// Idempotent: a second call against an already-viewed row is a no-op
// and still returns 200, so the front-end can fire-and-forget without
// needing to track state.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.post(
    "/tradesman/grant-leads/:id/view",
    auth,
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "invalid_id" });
      }
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "unauthorized" });

      try {
        // WHERE guards both ownership AND idempotency. Returns 0
        // affected rows when the lead isn't assigned to the user OR
        // when viewed_at is already set - both fine for the caller.
        await mysqlQuery(
          `UPDATE grant_leads
             SET viewed_at = NOW()
           WHERE id = ?
             AND assigned_tradesperson_uid = ?
             AND viewed_at IS NULL`,
          [id, uid],
        );
        return res.json({ ok: true });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message, id, uid },
          "[POST /tradesman/grant-leads/:id/view] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
