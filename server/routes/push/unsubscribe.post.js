// server/routes/push/unsubscribe.post.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, logActivity } = ctx;

  router.post("/push/unsubscribe", auth, async (req, res) => {
    const log = withRequest(req).child({ route: "push.unsubscribe" });
    const uid = req.user?.uid;

    try {
      const { endpoint } = req.body || {};

      if (!endpoint) {
        return res.status(400).json({ error: "Missing endpoint" });
      }

      await mysqlQuery(
        "DELETE FROM push_subscriptions WHERE uid = ? AND endpoint = ?",
        [uid, endpoint],
      );

      logActivity("push.unsubscribed", "info", uid);
      log.info("push subscription removed");
      return res.status(200).json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message }, "push unsubscribe failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
