// server/routes/recommendations/nudge.post.js
//
// POST /api/recommendations/:id/nudge
// Owner-only. Re-sends the invite email for an off-platform recommendation.
// Rate-limited to once per 24 hours per recommendation.

const { extractLocationTokens } = require("../../lib/location");

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Accept sendBuilderInviteEmail from ctx for testability; fall back to real impl.
  const sendBuilderInviteEmail =
    ctx.sendBuilderInviteEmail ||
    require("../../lib/sendBuilderInviteEmail").sendBuilderInviteEmail;

  router.post("/recommendations/:id/nudge", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const recId = Number(req.params.id);
    if (!Number.isFinite(recId) || recId <= 0) {
      return res.status(400).json({ error: "Invalid recommendation id" });
    }

    try {
      const rows = await mysqlQuery(
        `SELECT r.id AS recId, r.company, r.companyEmail, r.recommenderUserId,
                r.isAnonymous, r.name AS recommenderName,
                p.ownerUserId, p.location
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
          WHERE r.id = ?
            AND r.linked_tradesman_uid IS NULL
          LIMIT 1`,
        [recId],
      );
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Recommendation not found or already linked" });
      if (String(row.ownerUserId) !== String(uid)) {
        return res.status(403).json({ error: "Not your project" });
      }
      if (!row.companyEmail) {
        return res.status(400).json({ error: "No email on file for this builder" });
      }

      const inviteRows = await mysqlQuery(
        `SELECT lastNudgedAt, nudgeCount FROM recommendation_invites WHERE recommendationId = ? LIMIT 1`,
        [recId],
      );
      const lastNudgedAt = inviteRows?.[0]?.lastNudgedAt;
      if (lastNudgedAt) {
        const ageMs = Date.now() - new Date(lastNudgedAt).getTime();
        if (ageMs < NUDGE_COOLDOWN_MS) {
          const retryAfterSec = Math.ceil((NUDGE_COOLDOWN_MS - ageMs) / 1000);
          res.set("Retry-After", String(retryAfterSec));
          return res.status(429).json({ error: "Try again tomorrow", retryAfterSec });
        }
      }

      let recommenderFirstName = "Someone";
      if (row.recommenderUserId && !row.isAnonymous) {
        const userRows = await mysqlQuery(
          `SELECT firstName FROM users WHERE uid = ? LIMIT 1`,
          [row.recommenderUserId],
        );
        recommenderFirstName = userRows?.[0]?.firstName || row.recommenderName || "Someone";
      }

      const tokens = extractLocationTokens(row.location || "");
      const projectArea = tokens?.outward || tokens?.city || "their area";

      const sent = await sendBuilderInviteEmail({
        mysqlQuery,
        recommendationId: recId,
        recipientEmail: row.companyEmail,
        builderCompanyName: row.company,
        recommenderFirstName,
        projectArea,
      });

      if (!sent) return res.status(502).json({ error: "Failed to send invite" });

      await mysqlQuery(
        `UPDATE recommendation_invites
            SET nudgeCount = nudgeCount + 1,
                lastNudgedAt = ?
          WHERE recommendationId = ?`,
        [new Date(), recId],
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error("[recommendations.nudge] error:", e?.message);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
