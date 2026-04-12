// server/routes/projects/hires.post.js
//
// POST /api/projects/:projectId/hires
//
// Auth: required (project owner only)
// Body: { tradesmanUserId? | recommendationId?, homeownerMessage? }
//
// Creates a hire for a project. Two flavours:
//
//   1. Onboarded tradesman — `tradesmanUserId` provided.
//      Status starts as `pending`. The tradesman gets an in-app notification.
//
//   2. Recommendation case — `recommendationId` provided. The recommendation's
//      company isn't on the platform yet. Status starts as `pending_invite`,
//      contact-resolution decides whether we have an email (mints an invite
//      token) or whether the hire goes into the manual admin queue. The actual
//      email send happens in a later step — this route only persists the row.
//
// Hires expire after 7 days if not responded to.

const { CreateHireSchema } = require("../../lib/validation");
const { resolveHireContact } = require("../../lib/hireContactResolution");
const {
  recordHomeownerAction,
} = require("../../lib/observability/matchObservations");

const HIRE_EXPIRY_DAYS = 7;

// Statuses that count as "active" — block duplicate hires for the same
// (project, tradesman) or (project, recommendation) pair. Terminal statuses
// (declined, cancelled, expired) DO NOT block re-hiring.
const ACTIVE_HIRE_STATUSES = ["pending", "pending_invite", "accepted"];

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, broadcastNotification } = ctx;
  const log = ctx.log || console;
  const TAG = "[projects/hires.post]";
  const ROUTE = "/projects/:projectId/hires";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post(ROUTE, auth, async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid project id" });
    }

    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    /* ---------- Validate payload ---------- */

    const parsed = CreateHireSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const { tradesmanUserId, recommendationId, homeownerMessage } = parsed.data;

    try {
      /* ---------- Project exists & owned by caller ---------- */

      const projRows = await mysqlQuery(
        `SELECT id, ownerUserId, status, name
           FROM projects
          WHERE id = ?
          LIMIT 1`,
        [projectId],
      );
      const project = projRows[0];

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (String(project.ownerUserId) !== String(uid)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const projectStatus = String(project.status || "").toLowerCase();
      if (projectStatus !== "live") {
        return res.status(409).json({
          error: "PROJECT_NOT_HIREABLE",
          status: projectStatus,
        });
      }

      /* ---------- Branch: onboarded tradesman vs recommendation ---------- */

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + HIRE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      );

      if (tradesmanUserId) {
        /* ----- Onboarded tradesman path ----- */

        // Self-hire prevention
        if (String(tradesmanUserId) === String(uid)) {
          return res.status(400).json({ error: "CANNOT_HIRE_SELF" });
        }

        // Tradesman must exist and not be banned
        const tmRows = await mysqlQuery(
          `SELECT user_id, status
             FROM tradesmen
            WHERE user_id = ?
            LIMIT 1`,
          [tradesmanUserId],
        );
        const tradesman = tmRows[0];

        if (!tradesman) {
          return res.status(404).json({ error: "Tradesman not found" });
        }

        if (String(tradesman.status || "").toLowerCase() === "banned") {
          return res.status(409).json({ error: "TRADESMAN_BANNED" });
        }

        // Already actively hired for this project? (terminal statuses don't
        // block — homeowner can re-hire after a decline/cancel/expire)
        const dupRows = await mysqlQuery(
          `SELECT id FROM hires
            WHERE projectId = ? AND tradesmanUserId = ?
              AND status IN (?, ?, ?)
            LIMIT 1`,
          [projectId, tradesmanUserId, ...ACTIVE_HIRE_STATUSES],
        );
        if (dupRows.length > 0) {
          return res.status(409).json({ error: "ALREADY_HIRED" });
        }

        const insertResult = await mysqlQuery(
          `INSERT INTO hires
             (projectId, homeownerUid, tradesmanUserId,
              homeownerMessage, status, hiredAt, expiresAt)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
          [
            projectId,
            uid,
            tradesmanUserId,
            homeownerMessage ?? null,
            now,
            expiresAt,
          ],
        );

        const hireId = insertResult.insertId;

        // In-app notification to the tradesman
        try {
          await mysqlQuery(
            `INSERT INTO notifications
               (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              tradesmanUserId,
              "hire_received",
              `You've been hired for "${project.name}"`,
              projectId,
              `/tradesman/projects`,
              now,
            ],
          );

          broadcastNotification?.(tradesmanUserId, {
            type: "hire_received",
            message: `You've been hired for "${project.name}"`,
            projectId,
            linkPath: `/tradesman/projects`,
          });
        } catch (e) {
          log.warn?.(`${TAG} failed to insert hire_received notification`, {
            error: e?.message || e,
            hireId,
          });
        }

        // Project Lighthouse telemetry — fire-and-forget
        recordHomeownerAction({
          mysqlQuery,
          projectId,
          tradesmanUserId,
          action: "hired",
          log,
        });

        return res.status(201).json({
          ok: true,
          hire: {
            id: hireId,
            projectId,
            tradesmanUserId,
            recommendationId: null,
            status: "pending",
            inviteChannel: null,
            hiredAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        });
      }

      /* ----- Recommendation path ----- */

      // recommendationId is guaranteed by the schema's superRefine at this point
      const recRows = await mysqlQuery(
        `SELECT id, projectId, company, companyEmail
           FROM recommendations
          WHERE id = ?
          LIMIT 1`,
        [recommendationId],
      );
      const recommendation = recRows[0];

      if (!recommendation) {
        return res.status(404).json({ error: "Recommendation not found" });
      }

      if (Number(recommendation.projectId) !== projectId) {
        return res.status(404).json({ error: "Recommendation not found" });
      }

      /* ---------------------------------------------------------------
       * Auto-match: if there's an onboarded tradesman whose company name
       * matches this recommendation, create an onboarded hire (status
       * 'pending', linked to the tradesman) instead of a 'pending_invite'.
       *
       * Match strategy: case-insensitive equality after stripping common
       * legal-form suffixes (limited, ltd, ltd., plc, llc, gmbh, co.). This
       * handles cases like:
       *   "Elegant Building Services Limited" (rec) ↔ "Elegant Building Services" (tradesman)
       *
       * If matched, the rest of the route flows down the onboarded path:
       * we still link the hire to the recommendation (so the rec card UI
       * can show "hired" state) but `tradesmanUserId` is set so the
       * tradesman dashboard receives the request.
       * --------------------------------------------------------------- */
      const matchedTradesmanRows = await mysqlQuery(
        `
        SELECT user_id, status
          FROM tradesmen
         WHERE LOWER(
                 TRIM(
                   REGEXP_REPLACE(
                     company_name,
                     '(?i)\\\\s+(limited|ltd\\\\.?|llc|plc|gmbh|co\\\\.?)$',
                     ''
                   )
                 )
               )
             = LOWER(
                 TRIM(
                   REGEXP_REPLACE(
                     ?,
                     '(?i)\\\\s+(limited|ltd\\\\.?|llc|plc|gmbh|co\\\\.?)$',
                     ''
                   )
                 )
               )
           AND COALESCE(status, 'active') != 'banned'
         ORDER BY (LOWER(status) = 'active') DESC, updated_at DESC
         LIMIT 1
        `,
        [recommendation.company || ""],
      );
      const matchedTradesman = matchedTradesmanRows[0];

      if (matchedTradesman) {
        // Self-hire prevention even via the recommendation path
        if (String(matchedTradesman.user_id) === String(uid)) {
          return res.status(400).json({ error: "CANNOT_HIRE_SELF" });
        }

        // Already actively hired this tradesman for this project?
        const dupTmRows = await mysqlQuery(
          `SELECT id FROM hires
            WHERE projectId = ? AND tradesmanUserId = ?
              AND status IN (?, ?, ?)
            LIMIT 1`,
          [projectId, matchedTradesman.user_id, ...ACTIVE_HIRE_STATUSES],
        );
        if (dupTmRows.length > 0) {
          return res.status(409).json({ error: "ALREADY_HIRED" });
        }

        const insertResult = await mysqlQuery(
          `INSERT INTO hires
             (projectId, homeownerUid, tradesmanUserId, recommendationId,
              homeownerMessage, status, hiredAt, expiresAt)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [
            projectId,
            uid,
            matchedTradesman.user_id,
            recommendationId,
            homeownerMessage ?? null,
            now,
            expiresAt,
          ],
        );

        const hireId = insertResult.insertId;

        // In-app notification to the matched tradesman
        try {
          await mysqlQuery(
            `INSERT INTO notifications
               (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              matchedTradesman.user_id,
              "hire_received",
              `You've been hired for "${project.name}"`,
              projectId,
              `/tradesman/projects`,
              now,
            ],
          );

          broadcastNotification?.(matchedTradesman.user_id, {
            type: "hire_received",
            message: `You've been hired for "${project.name}"`,
            projectId,
            linkPath: `/tradesman/projects`,
          });
        } catch (e) {
          log.warn?.(`${TAG} failed to insert hire_received notification (matched)`, {
            error: e?.message || e,
            hireId,
          });
        }

        // Project Lighthouse telemetry — both ids are known here
        recordHomeownerAction({
          mysqlQuery,
          projectId,
          recommendationId,
          tradesmanUserId: matchedTradesman.user_id,
          action: "hired",
          log,
        });

        return res.status(201).json({
          ok: true,
          hire: {
            id: hireId,
            projectId,
            tradesmanUserId: matchedTradesman.user_id,
            recommendationId,
            status: "pending",
            inviteChannel: null,
            hiredAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        });
      }

      // Already actively hired this recommendation for this project?
      const dupRows = await mysqlQuery(
        `SELECT id FROM hires
          WHERE projectId = ? AND recommendationId = ?
            AND status IN (?, ?, ?)
          LIMIT 1`,
        [projectId, recommendationId, ...ACTIVE_HIRE_STATUSES],
      );
      if (dupRows.length > 0) {
        return res.status(409).json({ error: "ALREADY_HIRED" });
      }

      const contact = resolveHireContact(recommendation);

      const insertResult = await mysqlQuery(
        `INSERT INTO hires
           (projectId, homeownerUid, recommendationId,
            invitedCompanyName, invitedContactEmail, inviteChannel, inviteToken,
            homeownerMessage, status, hiredAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_invite', ?, ?)`,
        [
          projectId,
          uid,
          recommendationId,
          recommendation.company || null,
          contact.email,
          contact.channel,
          contact.token,
          homeownerMessage ?? null,
          now,
          expiresAt,
        ],
      );

      const hireId = insertResult.insertId;

      // No in-app notification — the recommendation isn't a user. Email send
      // and admin queue handling happen in later steps of the build.

      // Project Lighthouse telemetry — pending_invite, recommendation only
      recordHomeownerAction({
        mysqlQuery,
        projectId,
        recommendationId,
        action: "hired",
        log,
      });

      return res.status(201).json({
        ok: true,
        hire: {
          id: hireId,
          projectId,
          tradesmanUserId: null,
          recommendationId,
          status: "pending_invite",
          inviteChannel: contact.channel,
          hiredAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (err) {
      log.error?.(`${TAG} error`, err);
      return res.status(500).json({ error: "Internal error creating hire" });
    }
  });

  if (!ctx.__logged_hires_post) {
    ctx.__logged_hires_post = true;
    log.info?.(`[routes] mounted: POST /api${ROUTE}`);
  }
};
