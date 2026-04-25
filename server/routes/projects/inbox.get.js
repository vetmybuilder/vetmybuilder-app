// server/routes/projects/inbox.get.js
//
// GET /api/projects/:id/inbox
// Homeowner-only. Returns paid-unlock intro messages for this project.
//
// Returns pitches shaped for the ProjectInbox UI. Dismissed messages are
// INCLUDED (the UI has a "Dismissed" tab) with status derived server-side.

module.exports = function mountInboxGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get("/projects/:id/inbox", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const pid = Number(req.params.id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const proj = await mysqlQuery(
      `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
      [pid],
    );
    if (!proj?.[0]) return res.status(404).json({ error: "Project not found" });
    if (String(proj[0].ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Not your project" });
    }

    const rows = await mysqlQuery(
      `SELECT im.id,
              im.builder_uid,
              im.intro_message,
              im.homeowner_replied_at,
              im.dismissed_at,
              im.created_at,
              im.updated_at,
              TIMESTAMPDIFF(HOUR, im.created_at, NOW()) AS hours_ago,
              t.company_name,
              t.created_at AS tradesman_created_at,
              t.service_areas,
              u.firstName AS builder_first_name,
              u.postcodeOutward AS builder_outward
         FROM inbox_messages im
         LEFT JOIN tradesmen t ON t.user_id = im.builder_uid
         LEFT JOIN users u ON u.uid = im.builder_uid
        WHERE im.project_id = ?
          AND im.homeowner_uid = ?
        ORDER BY im.created_at DESC`,
      [pid, uid],
    );

    const pitches = (rows || []).map((r) => {
      let status = "new";
      if (r.dismissed_at) status = "dismissed";
      else if (r.homeowner_replied_at) status = "replied";

      // Derive yearsTrading from tradesman created_at as a best-effort
      // approximation (schema has no explicit years_trading column).
      let yearsTrading = 0;
      if (r.tradesman_created_at) {
        const ms = Date.now() - new Date(r.tradesman_created_at).getTime();
        const yrs = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
        if (Number.isFinite(yrs) && yrs > 0) yearsTrading = yrs;
      }

      // Prefer the builder's own outward postcode; fall back to the first
      // entry in service_areas if set.
      let outward = r.builder_outward || "";
      if (!outward && typeof r.service_areas === "string") {
        const first = r.service_areas.split(",")[0]?.trim() || "";
        outward = first;
      }

      const hoursAgo = Number.isFinite(Number(r.hours_ago))
        ? Number(r.hours_ago)
        : 0;

      return {
        messageId: String(r.id),
        builderFirstName: r.builder_first_name || "Builder",
        companyName: r.company_name || "",
        yearsTrading,
        outward,
        body: r.intro_message || "",
        hoursAgo,
        status,
      };
    });

    return res.status(200).json({ pitches });
  });
};
