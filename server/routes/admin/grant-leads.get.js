// server/routes/admin/grant-leads.get.js
//
// GET /admin/grant-leads
//
// Admin-only. Lists every submission from /free-wall-insulation
// with filterable status, qualified verdict, and free-text search
// across name / email / postcode / reference code.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.get(
    "/admin/grant-leads",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const q = String(req.query.q || "").trim().toLowerCase();
        const statusFilter = String(req.query.status || "").trim().toLowerCase();
        const qualifiedFilter = String(req.query.qualified || "")
          .trim()
          .toLowerCase();
        const limit = Math.min(
          200,
          Math.max(1, parseInt(req.query.limit || "100", 10)),
        );
        const offset = Math.max(0, parseInt(req.query.offset || "0", 10));

        const wh = [];
        const params = [];

        if (q) {
          wh.push(
            "(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(postcode) LIKE ? OR LOWER(reference_code) LIKE ?)",
          );
          params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (statusFilter && statusFilter !== "all") {
          wh.push("status = ?");
          params.push(statusFilter);
        }
        if (qualifiedFilter && qualifiedFilter !== "all") {
          wh.push("qualified = ?");
          params.push(qualifiedFilter);
        }

        const whereSql = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS total FROM grant_leads ${whereSql}`,
          params,
        );
        const total = countRows?.[0]?.total ?? 0;

        // LIMIT/OFFSET are inlined (not bound) because the mysql2
        // prepared-statement protocol rejects integer params there with
        // "Incorrect arguments to mysqld_stmt_execute". Same pattern as
        // server/routes/admin/projects.get.js. Both values are clamped
        // to integers above, so this is safe against injection.
        const rows = await mysqlQuery(
          `SELECT id, reference_code, created_at, property_type, tenure,
                  heating_fuel, epc_rating, benefits, postcode, name,
                  email, phone, qualified, assigned_tradesperson_uid,
                  status, source, last_status_at
             FROM grant_leads
             ${whereSql}
             ORDER BY created_at DESC
             LIMIT ${limit} OFFSET ${offset}`,
          params,
        );

        // Status counts so the filter pills can show counts.
        const counts = await mysqlQuery(
          `SELECT status, COUNT(*) AS n FROM grant_leads GROUP BY status`,
        );
        const statusCounts = {};
        for (const row of counts) statusCounts[row.status] = row.n;

        return res.json({
          ok: true,
          total,
          limit,
          offset,
          rows,
          statusCounts,
        });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message },
          "[GET /admin/grant-leads] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );

  // ----- Detail endpoint for the inspector panel. Includes the
  // full event timeline so admin can see what's happened to the lead.
  router.get(
    "/admin/grant-leads/:id",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid_id" });
      }
      try {
        const rows = await mysqlQuery(
          `SELECT * FROM grant_leads WHERE id = ? LIMIT 1`,
          [id],
        );
        if (!rows?.length) return res.status(404).json({ error: "not_found" });
        const events = await mysqlQuery(
          `SELECT id, event_type, prev_status, new_status, detail,
                  actor_uid, created_at
             FROM grant_lead_events
             WHERE grant_lead_id = ?
             ORDER BY created_at ASC`,
          [id],
        );
        return res.json({ ok: true, lead: rows[0], events });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message, id },
          "[GET /admin/grant-leads/:id] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
