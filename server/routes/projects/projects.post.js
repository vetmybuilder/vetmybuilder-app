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
const { extractOutward } = require("../../lib/matching/extractOutward");
const { getEnabledBoroughs, getEnabledBoroughNameSet } = require("../../lib/pilotAreas");
const { resolveOutwardDistricts } = require("../../lib/postcodesIo");
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

  // "Waltham Forest" -> "Waltham Forest"
  // ["Waltham Forest", "Hackney"] -> "Waltham Forest and Hackney"
  // [a, b, c] -> "a, b and c"
  const formatBoroughList = (names) => {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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

    // Pilot-area gate. The project's location must resolve (via
    // postcodes.io's admin_district lookup) to a borough that's currently
    // enabled in admin. The frontend already validates against the same
    // set on selection, so this is defence in depth against direct API
    // calls / stale clients.
    //
    // E2E + unit tests bypass via PILOT_AREAS_BYPASS=1 so test scenes can
    // use postcodes outside the pilot (e.g. "N1" Islington to verify
    // far-location scoring) without their POSTs being rejected as
    // "location_not_in_pilot". Prod/staging never set this flag.
    if (process.env.PILOT_AREAS_BYPASS !== "1") {
    try {
      const enabledNames = await getEnabledBoroughNameSet(mysqlQuery);
      const outward = extractOutward(body.location);
      const districts = outward
        ? await resolveOutwardDistricts(outward)
        : [];
      const matched = districts.some((d) => enabledNames.has(d));

      if (!matched) {
        const enabledBoroughs = await getEnabledBoroughs(mysqlQuery);
        const boroughNames = enabledBoroughs.map((b) => b.name);
        log.warn?.(
          { uid, outward, districts, location: body.location },
          "[projects.post] location outside pilot",
        );
        return res.status(400).json({
          error: "location_not_in_pilot",
          message: boroughNames.length
            ? `We're piloting in ${formatBoroughList(boroughNames)}. We'll be opening up more areas soon.`
            : "We're not yet accepting jobs in any area. Check back soon.",
          fieldErrors: {
            location: "Not in our pilot area yet.",
          },
          pilotBoroughs: boroughNames,
        });
      }
    } catch (err) {
      // Don't block project creation if the pilot lookup itself fails -
      // log loudly and let the post through. Better to take the job and
      // investigate than refuse a real user (e.g. postcodes.io outage).
      log.error?.(
        { err: err?.message },
        "[projects.post] pilot-area check failed, allowing post",
      );
    }
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
      }).then(async (_classification) => {
        // Classification result is stored on the project row server-side.
        // No homeowner-facing notification (deprecated 2026-05 - the
        // ready-state ping was noise in the activity feed; see
        // tests/server/notificationsDeprecated.spec.ts for the guard).
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
