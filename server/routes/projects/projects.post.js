/**
 * POST /api/projects
 * Auth: required (owner = current user)
 * Body: { name, type, location, description, propertyType, bedrooms }
 * Returns: 201 { project }
 */
const {
  classifyProject,
} = require("../../lib/ai/projectClassifier");
const { validateAnswers } = require("../../lib/jobFields");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const { z } = require("zod");

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
    answers: z.record(z.any()).optional(),
  });

  router.post("/projects", auth, async (req, res) => {
    log.info?.("[projects.post] start");

    const uid = req.user.uid;

    let body;
    try {
      body = ProjectSchema.parse({
        name: stripFullPostcodes(req.body?.name),
        type: stripFullPostcodes(req.body?.type),
        location: stripFullPostcodes(req.body?.location),
        description: req.body?.description,
        propertyType: req.body?.propertyType,
        bedrooms: req.body?.bedrooms,
        answers: req.body?.answers,
      });
    } catch {
      log.warn?.("[projects.post] invalid payload");
      return res.status(400).json({ error: "Invalid payload" });
    }

    const answersCheck = validateAnswers(body.answers);
    if (!answersCheck.ok) {
      log.warn?.({ errors: answersCheck.errors }, "[projects.post] invalid answers");
      return res.status(400).json({ error: "invalid_answers", details: answersCheck.errors });
    }

    // MySQL-friendly timestamp
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
      const answersJson = body.answers ? JSON.stringify(body.answers) : null;

      const result = await mysqlQuery(
        `
        INSERT INTO projects
          (name, type, location, description, answers_json, propertyType, bedrooms, status, createdAt, updatedAt, ownerUserId)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `,
        [
          body.name,
          body.type,
          body.location,
          body.description,
          answersJson,
          body.propertyType,
          body.bedrooms,
          now,
          now,
          uid,
        ],
      );

      const insertedId = result.insertId;
      if (!insertedId) {
        log.error?.("[projects.post] insert failed: no insertId");
        return res.status(500).json({ error: "internal_error" });
      }

      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        insertedId,
      ]);

      // Project Lighthouse — fire-and-forget classification.
      // Runs the LLM (or stub) and stores the structured form in
      // project_classifications. Never blocks the response.
      // On completion, broadcasts an SSE event so the frontend can
      // auto-update the insights card without a page reload.
      classifyProject({
        mysqlQuery,
        projectId: insertedId,
        description: body.description,
        type: body.type,
        location: body.location,
        propertyType: body.propertyType,
        bedrooms: body.bedrooms,
        answers: body.answers,
        log,
      }).then((classification) => {
        if (classification && ctx.broadcastNotification) {
          ctx.broadcastNotification(req.user.uid, {
            type: "classification_ready",
            message: "Project insights are ready",
            projectId: insertedId,
          });
        }
      }).catch((e) => {
        log.warn?.("[projects.post] classifyProject threw", {
          insertedId,
          error: e?.message || e,
        });
      });

      res.status(201).json({ project: rows[0] || null });
      ctx.logActivity("project.create", "info", req.user.uid, `Project #${insertedId} "${body.name}"`);
      return;
    } catch (err) {
      log.error?.("[projects.post] error", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
