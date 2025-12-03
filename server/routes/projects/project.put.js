// server/routes/projects/project.put.js
/**
 * PUT /api/projects/:id
 * Auth: required (owner only)
 * Body: partial fields; we merge with current then validate
 * Returns: { project }
 *
 * IMPORTANT:
 * - location (which effectively holds the postcode) CANNOT be changed via this endpoint.
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
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

  router.put("/projects/:id", auth, async (req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    let current;
    try {
      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        id,
      ]);
      current = rows[0] || null;
    } catch (err) {
      console.error("Error fetching project for update (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }

    if (!current) return res.status(404).json({ error: "Not found" });
    if (String(current.ownerUserId) !== String(uid)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ---- Location / postcode protection ----
    // If client sends `location` and it's different to what we have stored,
    // we block the update. This endpoint must not be used to change the postcode.
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "location")) {
      const incomingLocation = (req.body.location ?? "").toString().trim();
      const currentLocation = (current.location ?? "").toString().trim();

      if (incomingLocation && incomingLocation !== currentLocation) {
        return res
          .status(400)
          .json({
            error: "Not allowed. Location cannot be updated via this endpoint.",
          });
      }
      // If they send the same value, it's effectively a no-op and we just ignore it.
    }

    // Merge incoming with current values
    // NOTE: for location we always keep the current value to be safe.
    const fields = {
      name: String(req.body?.name ?? current.name),
      type: String(req.body?.type ?? current.type),
      location: String(current.location), // force existing location
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

    try {
      await mysqlQuery(
        `UPDATE projects SET
           name = ?,
           type = ?,
           location = ?,
           description = ?,
           propertyType = ?,
           bedrooms = ?
         WHERE id = ?`,
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
      const updated = rows[0] || null;

      return res.json({ project: updated });
    } catch (err) {
      console.error("Error updating project (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/routes/projects/project.put.js
// /**
//  * PUT /api/projects/:id
//  * Auth: required (owner only)
//  * Body: partial fields; we merge with current then validate
//  * Returns: { project }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;
//   const { z } = require("zod");

//   // Same constraints as create
//   const ProjectSchema = z.object({
//     name: z.string().min(2).max(120),
//     type: z.string().min(2).max(80),
//     location: z.string().min(2).max(120),
//     description: z.string().min(2).max(2000),
//     propertyType: z.string().min(2).max(80),
//     bedrooms: z.coerce.number().int().min(0).max(20),
//   });

//   router.put("/projects/:id", auth, (req, res) => {
//     const uid = req.user.uid;
//     const id = Number(req.params.id);
//     if (!Number.isFinite(id)) {
//       return res.status(400).json({ error: "Invalid id" });
//     }

//     const current = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
//     if (!current) return res.status(404).json({ error: "Not found" });
//     if (String(current.ownerUserId) !== String(uid)) {
//       return res.status(403).json({ error: "Forbidden" });
//     }

//     // Merge incoming with current values
//     const fields = {
//       name: String(req.body?.name ?? current.name),
//       type: String(req.body?.type ?? current.type),
//       location: String(req.body?.location ?? current.location),
//       description: String(req.body?.description ?? current.description),
//       propertyType: String(req.body?.propertyType ?? current.propertyType),
//       bedrooms:
//         req.body?.bedrooms !== undefined
//           ? Number(req.body.bedrooms)
//           : Number(current.bedrooms),
//     };

//     try {
//       ProjectSchema.parse(fields);
//     } catch {
//       return res.status(400).json({ error: "Invalid payload" });
//     }

//     db.prepare(
//       `UPDATE projects SET
//          name=@name,
//          type=@type,
//          location=@location,
//          description=@description,
//          propertyType=@propertyType,
//          bedrooms=@bedrooms
//        WHERE id=@id`
//     ).run({ ...fields, id });

//     const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
//     return res.json({ project: updated });
//   });
// };
