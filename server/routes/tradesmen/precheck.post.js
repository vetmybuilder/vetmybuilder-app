// server/routes/tradesmen/precheck.post.js
/**
 * POST /api/tradesmen/precheck   (PUBLIC)
 * Body: { name: string, postcode?: string }
 * Uses Companies House match by name to pre-fill company number/status before account creation.
 */
module.exports = (router, ctx) => {
  const { matchByName } = ctx;
  const ROUTE = "/tradesmen/precheck";

  router.post(ROUTE, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const postcode = String(req.body?.postcode || "").trim() || undefined;
      if (!name)
        return res.status(400).json({ ok: false, error: "name_required" });

      const result = await matchByName({ name, locationHint: postcode });
      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[precheck] failed", e);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  if (!ctx.__logged_tradesmen_precheck) {
    ctx.__logged_tradesmen_precheck = true;
    console.log(`[routes] mounted: POST ${ROUTE}`);
  }
};
