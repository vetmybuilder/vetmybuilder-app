// server/routes/admin/users.delete.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, admin: firebaseAdmin } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.delete("/admin/users/:uid", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.users.delete" });
    const uid = req.params.uid;

    try {
      if (uid === req.user.uid) {
        return res.status(400).json({ error: "cannot_delete_self" });
      }

      try {
        await firebaseAdmin.auth().deleteUser(uid);
      } catch (err) {
        if (err?.code !== "auth/user-not-found") {
          log.warn({ err: err?.message, uid }, "Firebase delete failed");
        }
      }

      await mysqlQuery(`DELETE FROM user_roles WHERE uid = ?`, [uid]);
      await mysqlQuery(`DELETE FROM tradesmen WHERE user_id = ?`, [uid]);
      await mysqlQuery(`DELETE FROM users WHERE uid = ?`, [uid]);

      log.info({ uid }, "admin deleted user");
      res.json({ ok: true });
      ctx.logActivity("admin.user.delete", "info", req.user.uid, `User deleted: ${uid}`);
      return;
    } catch (err) {
      log.error({ err: err?.message, uid }, "admin delete user failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
