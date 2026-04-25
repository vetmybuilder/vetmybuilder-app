// server/routes/projects/inbox-reply.post.js
//
// POST /api/projects/:id/inbox/:messageId/reply
// Homeowner-initiated. Marks the intro message as replied, which reveals
// the homeowner's email (+ firstName) to the builder via subsequent
// calls to getMatchContact-equivalent on the builder side.

module.exports = function mountInboxReply(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/projects/:id/inbox/:messageId/reply",
    auth,
    async (req, res) => {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const pid = Number(req.params.id);
      const mid = Number(req.params.messageId);
      if (!Number.isFinite(pid) || !Number.isFinite(mid)) {
        return res.status(400).json({ error: "Invalid ids" });
      }

      const rows = await mysqlQuery(
        `SELECT id, project_id, homeowner_uid, builder_uid, homeowner_replied_at
           FROM inbox_messages
          WHERE id = ? AND project_id = ? AND homeowner_uid = ?
          LIMIT 1`,
        [mid, pid, uid],
      );
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Message not found" });

      await mysqlQuery(
        `UPDATE inbox_messages
            SET homeowner_replied_at = COALESCE(homeowner_replied_at, NOW())
          WHERE id = ?`,
        [mid],
      );

      return res.status(200).json({ ok: true });
    },
  );
};
