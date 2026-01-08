//
// PUT /api/projects/:id
// Auth: owner only
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { z } = require("zod");
  const { logger, withRequest } = require("../../lib/logger");

  // Remove full UK postcode → keep only outward code
  const stripFullPostcodes = (s) => {
    if (!s) return s;
    const fullPC = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/gi;
    return s.replace(fullPC, (_, outward) => outward.toUpperCase());
  };

  const ProjectSchema = z.object({
    name: z.string().min(2).max(120),
    type: z.string().min(2).max(80),
    location: z.string().min(2).max(120),
    description: z.string().min(2).max(2000),
    propertyType: z.string().min(2).max(80),
    bedrooms: z.coerce.number().int().min(0).max(20),
  });

  router.put("/projects/:id", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "/projects/:id [PUT]",
    });

    const uid = req.user.uid;
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      log.warn("Invalid project ID");
      return res.status(400).json({ error: "invalid_project_id" });
    }

    // Load current
    let current;
    try {
      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
      current = rows[0] || null;
    } catch (err) {
      log.error({ err }, "MySQL error loading project");
      return res.status(500).json({ error: "internal_error" });
    }

    if (!current) return res.status(404).json({ error: "not_found" });

    if (String(current.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "forbidden" });
    }

    // Reject location change
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "location")) {
      const incoming = String(req.body.location ?? "").trim();
      const stored = String(current.location ?? "").trim();
      if (incoming && incoming !== stored) {
        return res.status(400).json({
          error: "location_update_not_allowed",
          message: "Location cannot be updated via this endpoint.",
        });
      }
    }

    // Merge update
    const fields = {
      name: stripFullPostcodes(String(req.body?.name ?? current.name)),
      type: stripFullPostcodes(String(req.body?.type ?? current.type)),
      location: String(current.location),
      description: String(req.body?.description ?? current.description),
      propertyType: String(req.body?.propertyType ?? current.propertyType),
      bedrooms:
        req.body?.bedrooms !== undefined
          ? Number(req.body.bedrooms)
          : Number(current.bedrooms),
    };

    try {
      ProjectSchema.parse(fields);
    } catch (err) {
      log.warn({ err }, "Validation failed");
      return res.status(400).json({ error: "invalid_payload" });
    }

    // Apply update
    try {
      await mysqlQuery(
        `
        UPDATE projects SET
          name = ?, type = ?, location = ?, description = ?, propertyType = ?, bedrooms = ?
        WHERE id = ?
      `,
        [
          fields.name,
          fields.type,
          fields.location,
          fields.description,
          fields.propertyType,
          fields.bedrooms,
          id,
        ]
      );

      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
      return res.json({ project: rows[0] || null });
    } catch (err) {
      log.error({ err }, "MySQL error updating project");
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
