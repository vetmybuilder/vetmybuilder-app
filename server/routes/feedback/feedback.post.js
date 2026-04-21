/**
 * POST /api/feedback
 * Body: { userType?, featuresUsed?, rating, easeOfUse?, positives?, improvements?, recommend? }
 * Auth: optional (attaches userId if logged in)
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, optionalAuth } = ctx;
  const log = ctx.log || console;

  router.post("/feedback", optionalAuth, async (req, res) => {
    const { userType, featuresUsed, rating, easeOfUse, positives, improvements, recommend } = req.body || {};

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, error: "Rating (1-5) is required" });
    }

    const validRecommend = ["yes", "maybe", "no"];
    const rec = recommend && validRecommend.includes(recommend) ? recommend : null;
    const features = Array.isArray(featuresUsed) ? featuresUsed.join(",") : null;

    try {
      await mysqlQuery(
        `INSERT INTO feedback (user_id, user_type, features_used, rating, ease_of_use, positives, improvements, recommend, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          req.user?.uid || null,
          (userType || "").trim() || null,
          features,
          Number(rating),
          easeOfUse && easeOfUse >= 1 && easeOfUse <= 5 ? Number(easeOfUse) : null,
          (positives || "").trim() || null,
          (improvements || "").trim() || null,
          rec,
        ]
      );

      log.info?.({ userId: req.user?.uid, rating }, "[feedback] submitted");
      ctx.logActivity("feedback.submit", "info", req.user?.uid || "guest", `Feedback submitted (rating: ${rating})`);
      res.json({ ok: true });
    } catch (err) {
      log.error?.({ err: err?.message }, "[feedback] insert failed");
      res.status(500).json({ ok: false, error: "Failed to save feedback" });
    }
  });
};
