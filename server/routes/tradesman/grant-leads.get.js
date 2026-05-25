// server/routes/tradesman/grant-leads.get.js
//
// GET /api/tradesman/grant-leads
//
// Tradesperson-only. Returns every grant_leads row assigned to the
// authenticated user (matched on assigned_tradesperson_uid). Powers
// the /tradesman/grant-leads dashboard (variant E - earnings-led).
//
// Response shape mirrors the admin endpoint so the page can share the
// same render code if we ever pull that out into a shared component:
//   {
//     ok: true,
//     total: number,
//     rows: Lead[],
//     statusCounts: { [status]: number },
//     statsThisMonth: { total, full, partial, none, won, valueAtStake }
//   }

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;

  router.get("/tradesman/grant-leads", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    try {
      const rows = await mysqlQuery(
        `SELECT id, reference_code, created_at, property_type, tenure,
                heating_fuel, epc_rating, benefits, postcode, name,
                email, phone, qualified, assigned_tradesperson_uid,
                status, source, last_status_at, viewed_at
           FROM grant_leads
           WHERE assigned_tradesperson_uid = ?
           ORDER BY created_at DESC
           LIMIT 200`,
        [uid],
      );

      const statusCounts = {};
      for (const r of rows) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      }

      // This-month stats power the dashboard stat strip. We treat
      // "GBP 14k per fully-qualified lead" as the upper-bound value
      // at stake - matches the homeowner-facing copy on the funnel.
      const now = new Date();
      const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const thisMonth = rows.filter((r) =>
        String(r.created_at).startsWith(ym),
      );
      const countBy = (level) =>
        thisMonth.filter((r) => r.qualified === level).length;
      const wonThisMonth = thisMonth.filter((r) => r.status === "won").length;
      const fullThisMonth = countBy("full");

      return res.json({
        ok: true,
        total: rows.length,
        rows,
        statusCounts,
        statsThisMonth: {
          total: thisMonth.length,
          full: fullThisMonth,
          partial: countBy("partial"),
          none: countBy("none"),
          won: wonThisMonth,
          valueAtStake: fullThisMonth * 14000,
        },
      });
    } catch (err) {
      ctx.log?.error?.(
        { err: err?.message, uid },
        "[GET /tradesman/grant-leads] failed",
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
