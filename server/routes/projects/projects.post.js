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
const analytics = require("../../lib/analytics");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const { firePublishNotifications } = require("../../lib/publishNotifications");
  const { z } = require("zod");

  // Remove full UK postcode -> keep only outward code
  const stripFullPostcodes = (s) => {
    if (!s) return s;
    const fullPC = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/gi;
    return s.replace(fullPC, (_, outward) => outward.toUpperCase());
  };

  const ProjectSchema = z.object({
    name: z.string().min(2).max(120),
    type: z.string().min(2).max(80),
    location: z.string().min(2).max(120),
    description: z.string().max(500).default(""),
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
        VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?, ?, ?)
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
        return res.status(500).json({
          error: "create_failed",
          message: "We couldn't create your project right now. Please try again.",
        });
      }

      const rows = await mysqlQuery(`SELECT * FROM projects WHERE id = ?`, [
        insertedId,
      ]);

      // Project Lighthouse -- fire-and-forget classification.
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
      }).then(async (classification) => {
        if (classification) {
          // Insert DB notification so it appears in the bell
          try {
            await mysqlQuery(
              `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
               VALUES (?, 'classification_ready', 'Project insights are ready', ?, ?, NOW())`,
              [req.user.uid, insertedId, `/projects/${insertedId}`],
            );
          } catch {}
          if (ctx.broadcastNotification) {
            ctx.broadcastNotification(req.user.uid, {
              type: "classification_ready",
              message: "Project insights are ready",
              projectId: insertedId,
              linkPath: `/projects/${insertedId}`,
            });
          }
        }
      }).catch((e) => {
        log.warn?.("[projects.post] classifyProject threw", {
          insertedId,
          error: e?.message || e,
        });
      });

      res.status(201).json({ project: rows[0] || null });
      analytics.trackProjectCreated(req.user?.uid, { projectId: insertedId, type: body.type, location: body.location });
      ctx.logActivity("project.create", "info", req.user.uid, `Project #${insertedId} "${body.name}"`);

      // Auto-publish: fire notifications for the newly live project
      firePublishNotifications({
        mysqlQuery,
        project: rows[0] || { id: insertedId, name: body.name, type: body.type, location: body.location, ownerUserId: req.user.uid, createdAt: new Date() },
        uid: req.user.uid,
        extractLocationTokens: ctx.extractLocationTokens,
        broadcastNotification: ctx.broadcastNotification,
        broadcastEvent: ctx.broadcastEvent,
        logActivity: ctx.logActivity,
        log,
        notifyMatchedTradesmen: require("../../lib/ai/notifyMatchedTradesmen").notifyMatchedTradesmen,
        surfacePipelineTradespeople: require("../../lib/surfacePipelineTradespeople").surfacePipelineTradespeople,
      }).catch((err) => {
        log.warn?.("[projects.post] publish notifications error", { err: err?.message });
      });

      return;
    } catch (err) {
      log.error?.("[projects.post] error", err);
      return res.status(500).json({
        error: "create_failed",
        message: "We couldn't create your project right now. Please try again or contact support if this keeps happening.",
      });
    }
  });
};
