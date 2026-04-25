// server/routes/subscriptions/me.get.js
//
// GET /api/subscriptions/me
// Returns the current user's subscription state for the builder billing UI.
//   { subscribed: boolean, tier?: string, status?: string, currentPeriodEnd?: string, canceledAt?: string }

module.exports = function mountSubscriptionsMe(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/subscriptions/me", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const rows = await mysqlQuery(
      `SELECT tier_id, status, current_period_end, canceled_at
         FROM builder_subscriptions
        WHERE user_id = ?
        ORDER BY current_period_end DESC
        LIMIT 1`,
      [uid],
    );
    const row = rows?.[0];
    if (!row) return res.status(200).json({ subscribed: false });

    const end = row.current_period_end
      ? new Date(row.current_period_end)
      : null;
    const subscribed =
      row.status === "active" && !!end && end.getTime() > Date.now();

    return res.status(200).json({
      subscribed,
      tier: row.tier_id,
      status: row.status,
      currentPeriodEnd: end?.toISOString() ?? null,
      canceledAt: row.canceled_at
        ? new Date(row.canceled_at).toISOString()
        : null,
    });
  });
};
