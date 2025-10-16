// server/v2/routes/__test__/auth/custom-token.post.js

/**
 * POST /api/__test__/auth/custom-token
 * Headers: X-Test-Secret
 * Body: { uid }
 */
module.exports = (router, ctx) => {
  const { assertTestAccess, admin } = ctx;

  router.post("/__test__/auth/custom-token", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const uid = String(req.body?.uid || "").trim();
    if (!uid) return res.status(400).json({ error: "uid required" });

    if (!admin?.apps?.length) {
      return res.status(503).json({ error: "firebase admin not initialised" });
    }

    try {
      const token = await admin.auth().createCustomToken(uid);
      res.json({ ok: true, token });
    } catch (e) {
      console.error("[test] custom-token error", e);
      res.status(500).json({ error: "failed to mint token" });
    }
  });
};
