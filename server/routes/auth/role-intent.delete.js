// server/routes/auth/role-intent.delete.js
//
// DELETE /api/auth/role-intent
//
// Clears the trade-intent stamp written by POST /api/auth/role-intent
// when the trader bails out of /tradesman/signup/complete before
// saving any profile data.
//
// Safety rules:
//   - Only deletes the row if role === 'tradesman'. Admin rows are
//     never touched.
//   - Only deletes if the user has NO tradesmen profile row. Once a
//     wizard save has created the profile, the role becomes
//     irreversible from the client - admin would need to clean up.
//
// Without this endpoint, every cancelled email or OAuth signup leaves
// a permanent "tradesman (pending)" row in user_roles cluttering the
// admin user list.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[auth/role-intent.delete]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.delete("/auth/role-intent", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

    try {
      const profile = await mysqlQuery(
        `SELECT 1 FROM tradesmen WHERE user_id = ? LIMIT 1`,
        [uid],
      );
      if (profile && profile.length > 0) {
        // They have a real profile - this isn't a mid-signup cancel.
        return res.json({ ok: true, cleared: false, reason: "has_profile" });
      }

      // Two-stage delete: drop the role stamp, then drop the users
      // row if it's a "ghost" account (no tradesmen profile, no
      // projects). Without this second delete the admin user list
      // still shows the bailed user as "Homeowner" by default - the
      // fallback when no role row exists. touchUserMw will recreate
      // the users row if they ever sign in again.
      await mysqlQuery(
        `DELETE FROM user_roles WHERE uid = ? AND role = 'tradesman'`,
        [uid],
      );

      // Has any project? Use COUNT for portability across schemas
      // that may or may not have ON DELETE constraints.
      let hasProjects = false;
      try {
        const rows = await mysqlQuery(
          `SELECT 1 FROM projects WHERE ownerUserId = ? LIMIT 1`,
          [uid],
        );
        hasProjects = (rows || []).length > 0;
      } catch {
        // Non-fatal - treat as "no projects".
      }

      let userRowDeleted = false;
      if (!hasProjects) {
        try {
          const result = await mysqlQuery(
            `DELETE FROM users WHERE uid = ?`,
            [uid],
          );
          userRowDeleted = Number(result?.affectedRows || 0) > 0;
        } catch (e) {
          // FK constraint or other - non-fatal; just leaves a ghost
          // users row that admin will need to clean up manually.
          log.warn?.(`${TAG} users delete failed`, { error: e?.message });
        }
      }

      log.info?.(`${TAG} cleared trade intent`, {
        uid,
        userRowDeleted,
        hasProjects,
      });
      return res.json({
        ok: true,
        cleared: true,
        userRowDeleted,
        hasProjects,
      });
    } catch (e) {
      log.error?.({ error: e?.message }, `${TAG} failed`);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
};
