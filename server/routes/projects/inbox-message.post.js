// server/routes/projects/inbox-message.post.js
//
// POST /api/projects/:id/inbox-message
// Builder-initiated. After a builder has paid to unlock contact on a project,
// this endpoint stores / updates the builder's intro message body on the
// inbox_messages row that was created at unlock time (see payments/*.js).
//
// Schema notes (see mysql_schema.sql):
//   - project_contact_unlocks: keyed on (project_id, buyer_uid). The column
//     is `buyer_uid`, not `builder_uid`.
//   - inbox_messages: message body lives in `intro_message`. There is no
//     `status`, `sent_at`, or `unlock_id` column — the row is uniquely
//     identified by (project_id, builder_uid).

module.exports = function mountInboxMessage(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(
    "/projects/:id/inbox-message",
    auth,
    async (req, res) => {
      const builderUid = req.user?.uid;
      if (!builderUid) return res.status(401).json({ error: "Unauthorized" });

      const pid = Number(req.params.id);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid project id" });
      }

      const body = String(req.body?.body ?? "").trim();
      if (!body) {
        return res.status(400).json({ error: "body required" });
      }

      // Verify the builder has a paid unlock for this project.
      const unlockRows = await mysqlQuery(
        `SELECT id FROM project_contact_unlocks
          WHERE project_id = ? AND buyer_uid = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [pid, builderUid],
      );
      if (!unlockRows || unlockRows.length === 0) {
        return res.status(403).json({ error: "no unlock for this project" });
      }

      // Update the intro_message on the existing inbox_messages row that
      // was inserted when the unlock was activated. The row is keyed by
      // (project_id, builder_uid).
      await mysqlQuery(
        `UPDATE inbox_messages
            SET intro_message = ?,
                updated_at = NOW()
          WHERE project_id = ? AND builder_uid = ?`,
        [body, pid, builderUid],
      );

      return res.status(200).json({ status: "sent" });
    },
  );
};
