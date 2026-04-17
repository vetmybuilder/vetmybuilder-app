// server/routes/push/subscribe.post.js
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, logActivity } = ctx;

  router.post("/push/subscribe", auth, async (req, res) => {
    const log = withRequest(req).child({ route: "push.subscribe" });
    const uid = req.user?.uid;

    try {
      const { endpoint, keys } = req.body || {};

      if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
        return res
          .status(400)
          .json({ error: "Missing subscription data (endpoint, keys.p256dh, keys.auth required)" });
      }

      // Upsert: remove existing for same uid+endpoint, then insert
      await mysqlQuery(
        "DELETE FROM push_subscriptions WHERE uid = ? AND endpoint = ?",
        [uid, endpoint],
      );

      await mysqlQuery(
        `INSERT INTO push_subscriptions (uid, endpoint, p256dh, auth)
         VALUES (?, ?, ?, ?)`,
        [uid, endpoint, keys.p256dh, keys.auth],
      );

      logActivity("push.subscribed", "info", uid);
      log.info("push subscription stored");
      return res.status(201).json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message }, "push subscribe failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
