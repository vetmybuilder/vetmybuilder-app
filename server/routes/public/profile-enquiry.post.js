const { logger } = require("../../lib/logger");
const { notifyProfileEnquiry } = require("../../lib/notifyProfileEnquiry");

const RATE_LIMIT = new Map();
const MAX_PER_HOUR = 5;

module.exports = (router, ctx) => {
  const { mysqlQuery, broadcastNotification } = ctx;

  router.post("/t/:slug/enquiry", async (req, res) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim().slice(0, 120);
    const phone = String(req.body?.phone || "").trim().slice(0, 40);
    const email = String(req.body?.email || "").trim().slice(0, 190);
    const message = String(req.body?.message || "").trim().slice(0, 2000);

    if (!slug || !name || !phone) {
      return res.status(400).json({ error: "name and phone required" });
    }

    const ip = req.headers["x-real-ip"] || req.ip;
    const now = Date.now();
    const key = `${ip}:${slug}`;
    const history = RATE_LIMIT.get(key) || [];
    const recent = history.filter((t) => now - t < 3600000);
    if (recent.length >= MAX_PER_HOUR) {
      return res.status(429).json({ error: "too_many_requests" });
    }
    recent.push(now);
    RATE_LIMIT.set(key, recent);

    try {
      const rows = await mysqlQuery(
        `SELECT user_id FROM tradesmen WHERE slug = ? AND status = 'active' AND profile_public = 1 LIMIT 1`,
        [slug],
      );
      if (!rows.length) return res.status(404).json({ error: "not_found" });

      const uid = rows[0].user_id;

      await mysqlQuery(
        `INSERT INTO profile_enquiries (tradesperson_uid, visitor_name, visitor_phone, visitor_email, message)
         VALUES (?, ?, ?, ?, ?)`,
        [uid, name, phone, email || null, message || null],
      );

      notifyProfileEnquiry({
        mysqlQuery,
        tradespersonUid: uid,
        visitorName: name,
        visitorPhone: phone,
        message,
        broadcastNotification,
      });

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: err?.message }, "Profile enquiry failed");
      res.status(500).json({ error: "internal_error" });
    }
  });
};
