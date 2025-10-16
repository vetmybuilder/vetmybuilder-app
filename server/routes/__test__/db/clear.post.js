// server/v2/routes/__test__/db/clear.post.js

/**
 * POST /api/__test__/db/clear
 * Headers: X-Test-Secret
 */
module.exports = (router, ctx) => {
  const { assertTestAccess, wipeAllRows, db } = ctx;

  router.post("/__test__/db/clear", (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    try {
      wipeAllRows(db);
      res.json({ ok: true });
    } catch (e) {
      console.error("[test] clear error", e);
      res.status(500).json({ error: "Failed to clear DB" });
    }
  });
};
