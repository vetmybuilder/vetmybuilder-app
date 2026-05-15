// server/routes/tradesmen/precheck.post.js
/**
 * POST /api/tradesmen/precheck   (PUBLIC)
 * Body: { name: string, postcode?: string }
 * Uses Companies House match-by-name to prefill company number/status.
 */
const { publicWriteLimiter } = require("../../lib/rateLimiters");

module.exports = (router, ctx) => {
  const { matchByName } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/precheck.post]";
  const ROUTE = "/tradesmen/precheck";

  router.post(ROUTE, publicWriteLimiter, async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const postcode = String(body.postcode || "").trim() || undefined;

    log.info(`${TAG} hit`, { name, postcode });

    try {
      if (!name) {
        log.warn(`${TAG} name missing`);
        return res.status(400).json({ ok: false, error: "name_required" });
      }

      if (typeof matchByName !== "function") {
        log.error(`${TAG} matchByName missing on ctx`);
        return res.status(500).json({ ok: false, error: "config_error" });
      }

      const result = await matchByName({ name, locationHint: postcode });

      log.info(`${TAG} CH result`, {
        verdict: result?.verdict,
        best: result?.best || null,
      });

      res.json({ ok: true, ...result });
      ctx.logActivity("tradesman.precheck", "info", "guest", `Precheck for ${name}`);
      return;
    } catch (e) {
      log.error(`${TAG} failed`, { error: e?.message || e });
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  if (!ctx.__logged_tradesmen_precheck) {
    ctx.__logged_tradesmen_precheck = true;
    log.info(`[routes] mounted: POST ${ROUTE}`);
  }
};
