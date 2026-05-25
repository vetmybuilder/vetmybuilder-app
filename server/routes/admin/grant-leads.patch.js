// server/routes/admin/grant-leads.patch.js
//
// PATCH /admin/grant-leads/:id
//
// Admin-only. Updates a lead's status and/or notes. Every status
// transition appends a row to grant_lead_events so the timeline is
// preserved.
//
// Body: { status?: string, notes?: string }

const ALLOWED_STATUS = new Set([
  "new",
  "emailed",
  "contacted",
  "surveyed",
  "quoted",
  "won",
  "lost",
  "dead",
]);

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.patch(
    "/admin/grant-leads/:id",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid_id" });
      }

      const body = req.body || {};
      const nextStatus = body.status
        ? String(body.status).trim().toLowerCase()
        : null;
      const notes = typeof body.notes === "string" ? body.notes : null;

      if (nextStatus && !ALLOWED_STATUS.has(nextStatus)) {
        return res.status(400).json({ error: "invalid_status" });
      }
      if (!nextStatus && notes === null) {
        return res.status(400).json({ error: "nothing_to_update" });
      }

      try {
        const existing = await mysqlQuery(
          `SELECT id, status FROM grant_leads WHERE id = ? LIMIT 1`,
          [id],
        );
        if (!existing?.length) {
          return res.status(404).json({ error: "not_found" });
        }
        const prev = existing[0].status;

        const sets = [];
        const params = [];
        if (nextStatus) {
          sets.push("status = ?", "last_status_at = NOW()");
          params.push(nextStatus);
        }
        if (notes !== null) {
          sets.push("notes = ?");
          params.push(notes);
        }
        params.push(id);

        await mysqlQuery(
          `UPDATE grant_leads SET ${sets.join(", ")} WHERE id = ?`,
          params,
        );

        if (nextStatus && nextStatus !== prev) {
          await mysqlQuery(
            `INSERT INTO grant_lead_events
               (grant_lead_id, event_type, prev_status, new_status, actor_uid)
             VALUES (?, 'status_change', ?, ?, ?)`,
            [id, prev, nextStatus, req.user?.uid || null],
          );
        }
        if (notes !== null) {
          await mysqlQuery(
            `INSERT INTO grant_lead_events
               (grant_lead_id, event_type, detail, actor_uid)
             VALUES (?, 'note_added', ?, ?)`,
            [id, notes.slice(0, 4000), req.user?.uid || null],
          );
        }

        return res.json({ ok: true });
      } catch (err) {
        ctx.log?.error?.(
          { err: err?.message, id },
          "[PATCH /admin/grant-leads/:id] failed",
        );
        return res.status(500).json({ error: "internal_error" });
      }
    },
  );
};
