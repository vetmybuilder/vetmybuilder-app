// server/v2/routes/projects/projects.post.js
/**
 * POST /api/v2/projects  (also /api/projects if v2 is mounted there)
 * Auth: required (owner = current user)
 * Body: { name, type, location, description, propertyType, bedrooms }
 * Returns: 201 { project }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const { z } = require("zod");

  const ProjectSchema = z.object({
    name: z.string().min(2).max(120),
    type: z.string().min(2).max(80),
    location: z.string().min(2).max(120),
    description: z.string().min(2).max(2000),
    propertyType: z.string().min(2).max(80),
    bedrooms: z.coerce.number().int().min(0).max(20),
  });

  router.post("/projects", auth, (req, res) => {
    const uid = req.user.uid;

    let body;
    try {
      body = ProjectSchema.parse({
        name: req.body?.name,
        type: req.body?.type,
        location: req.body?.location,
        description: req.body?.description,
        propertyType: req.body?.propertyType,
        bedrooms: req.body?.bedrooms,
      });
    } catch {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const now = new Date().toISOString();

    const info = db
      .prepare(
        `INSERT INTO projects
          (name, type, location, description, propertyType, bedrooms, status, createdAt, ownerUserId)
         VALUES
          (@name, @type, @location, @description, @propertyType, @bedrooms, 'pending', @createdAt, @owner)`
      )
      .run({ ...body, createdAt: now, owner: uid });

    const project = db
      .prepare(`SELECT * FROM projects WHERE id = ?`)
      .get(info.lastInsertRowid);

    return res.status(201).json({ project });
  });
};
