// server/routes/projects/inbox-dismiss.post.js
//
// POST /api/projects/:id/inbox/:messageId/dismiss
// Homeowner-initiated. Marks an intro message as dismissed so it no longer
// appears in the "New" tab of the project inbox. Soft-delete via the
// `dismissed_at` column on `inbox_messages`.

module.exports = function mountInboxDismiss(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/projects/:id/inbox/:messageId/dismiss",
    auth,
    async (req, res) => {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const pid = Number(req.params.id);
      const mid = Number(req.params.messageId);
      if (!Number.isFinite(pid) || !Number.isFinite(mid)) {
        return res.status(400).json({ error: "Invalid ids" });
      }

      // Ownership: confirm the message belongs to this homeowner on this project.
      const rows = await mysqlQuery(
        `SELECT id
           FROM inbox_messages
          WHERE id = ? AND project_id = ? AND homeowner_uid = ?
          LIMIT 1`,
        [mid, pid, uid],
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "Message not found" });
      }

      await mysqlQuery(
        `UPDATE inbox_messages
            SET dismissed_at = COALESCE(dismissed_at, NOW())
          WHERE id = ?`,
        [mid],
      );

      return res.status(200).json({ status: "dismissed" });
    },
  );
};
