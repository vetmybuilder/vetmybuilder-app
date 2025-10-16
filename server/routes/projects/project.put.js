// server/v2/routes/projects/project.put.js
/**
 * PUT /api/v2/projects/:id   (also /api/projects/:id if v2 is mounted there)
 * Auth: required (owner only)
 * Body: partial fields; we merge with current then validate
 * Returns: { project }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { z } = require("zod");

  // Same constraints as create
  const ProjectSchema = z.object({
    name: z.string().min(2).max(120),
    type: z.string().min(2).max(80),
    location: z.string().min(2).max(120),
    description: z.string().min(2).max(2000),
    propertyType: z.string().min(2).max(80),
    bedrooms: z.coerce.number().int().min(0).max(20),
  });

  router.put("/projects/:id", auth, (req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    if (!current) return res.status(404).json({ error: "Not found" });
    if (String(current.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Merge incoming with current values
    const fields = {
      name: String(req.body?.name ?? current.name),
      type: String(req.body?.type ?? current.type),
      location: String(req.body?.location ?? current.location),
      description: String(req.body?.description ?? current.description),
      propertyType: String(req.body?.propertyType ?? current.propertyType),
      bedrooms:
        req.body?.bedrooms !== undefined
          ? Number(req.body.bedrooms)
          : Number(current.bedrooms),
    };

    try {
      ProjectSchema.parse(fields);
    } catch {
      return res.status(400).json({ error: "Invalid payload" });
    }

    db.prepare(
      `UPDATE projects SET
         name=@name,
         type=@type,
         location=@location,
         description=@description,
         propertyType=@propertyType,
         bedrooms=@bedrooms
       WHERE id=@id`
    ).run({ ...fields, id });

    const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return res.json({ project: updated });
  });
};
