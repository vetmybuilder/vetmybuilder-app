// server/routes/projects/recommendations.post.js

const { optional } = require("zod");
const { uploadToR2, isR2Configured } = require("../../lib/r2");
const { sendPushToUser } = require("../../lib/pushSender");
const analytics = require("../../lib/analytics");
const {
  processBuffer,
  processFile,
} = require("../../lib/imageSanitiser");

/**
 * POST /api/projects/:id/recommendations
 * Auth: required
 * Body: JSON or multipart/form-data ("photos", up to 8)
 * Response: 201 {
 *   ok: true,
 *   recommendationId,
 *   resolvedCompany,
 *   resolvedBy,
 *   recommender: {
 *     relation: "friend" | "neighbour" | "owner",
 *     source: "platform" | "magic"
 *   }
 * }
 */

module.exports = (router, ctx) => {
  const {
    db,
    mysqlQuery,
    auth,
    optionalAuth, // ⭐ ADD THIS
    upload,
    RecSchema,
    cleanPhone,
    queueCompanyVerification,
    notifyUsers,
    broadcastNotification,
    path: nodePath,
    UPLOAD_DIR,
    matchByName: ctxMatchByName,
    searchCompanies: ctxSearchCompanies,
    getCompanyProfile: ctxGetCompanyProfile,
  } = ctx;

  const { computeRecommendationSignals } = require("../../lib/ai/recommendationSignaller");
  const { matchAndNotifyTradesman } = require("../../lib/matchRecommendationToTradesman");
  const { sendBuilderInviteEmail } = require("../../lib/sendBuilderInviteEmail");
  const { extractLocationTokens } = require("../../lib/location");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const path = nodePath || require("node:path");

  const { _roughNameScore } = (() => {
    try {
      // path from server/routes/projects -> server/lib
      return require("../../lib/companyVerifyHelpers");
    } catch {
      return { _roughNameScore: () => 0 };
    }
  })();

  // --- Companies House helpers: ctx OR direct require fallback ---
  let matchByName = ctxMatchByName;
  let searchCompanies = ctxSearchCompanies;
  let getCompanyProfile = ctxGetCompanyProfile;

  if (!matchByName && !searchCompanies && !getCompanyProfile) {
    try {
      const ch = require("../../lib/companiesHouse");
      matchByName = ch.matchByName || matchByName;
      searchCompanies = ch.searchCompanies || searchCompanies;
      getCompanyProfile = ch.getCompanyProfile || getCompanyProfile;
    } catch (e) {
      (ctx.log || console).warn(
        { err: e?.message || e },
        "[recommendations.post] Companies House helpers not available"
      );
    }
  }

  // Conditionally parse multipart — use memory storage for R2, disk for local
  const multer = require("multer");
  const r2Upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 8 } });
  const multipartGate = (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      const handler = isR2Configured ? r2Upload.array("photos", 8) : upload.array("photos", 8);
      handler(req, res, (err) => {
        if (err) {
          return res
            .status(400)
            .json({ error: err.message || "Upload failed" });
        }
        next();
      });
    } else {
      next();
    }
  };

  router.post(
    "/projects/:id/recommendations",
    optionalAuth,
    multipartGate,
    /** @type {import('express').RequestHandler} */
    async (req, res) => {
      try {
        const projectId = Number(req.params.id);
        if (!Number.isFinite(projectId)) {
          return res.status(400).json({ error: "Invalid id" });
        }

        const asNumber = (v) =>
          v === undefined || v === null || v === "" ? undefined : Number(v);

        // Build payload (works for multipart & json)
        const payload = {
          name: String(req.body?.name ?? "").trim(),
          email: String(req.body?.email ?? "").trim() || undefined,
          phone: String(req.body?.phone ?? "").trim() || undefined,
          company: String(req.body?.company ?? "").trim(),
          companyEmail:
            String(req.body?.companyEmail ?? "").trim() || undefined,
          rating: asNumber(req.body?.rating) ?? 5,
          // Per-category star ratings from the mobile wizard
          qualityRating: asNumber(req.body?.qualityRating),
          reliabilityRating: asNumber(req.body?.reliabilityRating),
          communicationRating: asNumber(req.body?.communicationRating),
          trustRating: asNumber(req.body?.trustRating),
          valueRating: asNumber(req.body?.valueRating),
          comment: String(req.body?.comment ?? "").trim(),
        };

        const parsed = RecSchema.safeParse(payload);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Invalid payload", issues: parsed.error.issues });
        }

        const {
          name,
          email,
          phone,
          company,
          companyEmail,
          rating,
          comment,
          qualityRating,
          reliabilityRating,
          communicationRating,
          trustRating,
          valueRating,
        } = parsed.data;
        const now = new Date(); // ✅ use Date object so mysql2 formats correctly
        const uid = req.user?.uid ?? null;

        const rawSource = String(req.body?.source ?? "")
          .trim()
          .toLowerCase();
        const source = rawSource === "magic" ? "magic" : "platform";

        /* ---------- Figure out owner vs other user ---------- */

        let isOwner = false;
        let projectLocationHint = "";

        try {
          const projRows = await mysqlQuery(
            `SELECT ownerUserId, location
               FROM projects
              WHERE id = ?
              LIMIT 1`,
            [projectId]
          );
          const proj = projRows[0] || null;
          if (proj) {
            isOwner = uid && String(uid) === String(proj.ownerUserId);
            if (isOwner && proj.location) {
              projectLocationHint = String(proj.location);
            }
          }
        } catch (e) {
          (ctx.log || console).warn(
            { err: e?.message || e },
            "[recommendations.post] failed to load project for owner/location hint"
          );
        }

        // 0) Any explicit hint from the client? (postcode/city)
        const explicitHint = String(
          (
            req.body?.locationHint ||
            req.body?.companyPostcode ||
            req.body?.companyCity ||
            ""
          ).toString()
        ).trim();

        const locationHint = explicitHint || projectLocationHint || undefined;

        /* ---------- Resolve company name BEFORE insert ---------- */

        let resolvedCompany = company;
        let resolvedBy = "input"; // 'db' | 'ch' | 'input'
        let resolvedCompanyNumber = null;

        // 1) Try local DB exact match first (case-insensitive) via MySQL
        try {
          const localRows = await mysqlQuery(
            `SELECT company
               FROM recommendations
              WHERE LOWER(company) = LOWER(?)
              ORDER BY id DESC
              LIMIT 1`,
            [company]
          );
          const local = localRows[0] || null;
          if (local?.company) {
            resolvedCompany = String(local.company).trim();
            resolvedBy = "db";
          }
        } catch (e) {
          (ctx.log || console).warn(
            { err: e?.message || e },
            "[recommendations.post] local company lookup failed"
          );
        }

        // 2) If not found locally AND CH helpers are available, try to match by name
        if (
          resolvedBy === "input" &&
          (typeof matchByName === "function" ||
            (typeof searchCompanies === "function" &&
              typeof getCompanyProfile === "function"))
        ) {
          try {
            if (typeof matchByName === "function") {
              const result = await matchByName({
                name: company,
                locationHint,
              });

              if (result && result.ok) {
                if (result.company?.name) {
                  resolvedCompany = String(result.company.name).trim();
                  resolvedBy = "ch";
                }
                if (result.best) {
                  resolvedCompanyNumber = result.best.number || null;
                }
              }
            } else {
              // Fallback: search -> rough rank -> profile
              const search = await searchCompanies({
                name: company,
                itemsPerPage: 50,
              });
              const items = Array.isArray(search?.items) ? search.items : [];
              const ranked = items
                .filter((i) => i?.title && i?.company_number)
                .map((i) => ({
                  ...i,
                  _score: _roughNameScore(i.title, company),
                }))
                .sort((a, b) => b._score - a._score);
              const best = ranked[0];
              if (best && best._score >= 70) {
                const profile = await getCompanyProfile(best.company_number);
                const chName = profile?.company_name || best.title;
                if (chName) {
                  resolvedCompany = String(chName).trim();
                  resolvedBy = "ch";
                }
                resolvedCompanyNumber =
                  (profile && profile.company_number) ||
                  best.company_number ||
                  null;
              }
            }
          } catch (e) {
            (ctx.log || console).warn(
              { err: e?.message || e },
              "[recommendations.post] CH resolve failed"
            );
          }
        }

        /* ---------- Insert recommendation (MySQL) ---------- */

        const insertResult = await mysqlQuery(
          `INSERT INTO recommendations
             (projectId,
              recommenderUserId,
              createdAt,
              name,
              email,
              phone,
              company,
              companyEmail,
              rating,
              comment,
              isAnonymous,
              source,
              quality_rating,
              reliability_rating,
              communication_rating,
              trust_rating,
              value_rating)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            uid,
            now, // ✅ Date object instead of ISO string
            name,
            email ?? null,
            cleanPhone(phone),
            resolvedCompany, // canonical name
            companyEmail ?? null,
            rating,
            comment ?? null,
            source,
            qualityRating ?? null,
            reliabilityRating ?? null,
            communicationRating ?? null,
            trustRating ?? null,
            valueRating ?? null,
          ]
        );

        const recommendationId = insertResult.insertId;

        /* ---------- Derive recommender relation for UI labels ---------- */

        let recommenderRelation = "neighbour";

        if (source === "magic" && !uid) {
          recommenderRelation = "friend";
        } else if (isOwner) {
          recommenderRelation = "owner";
        } else {
          recommenderRelation = "neighbour";
        }

        /* ---------- Queue Companies House verification ---------- */

        try {
          queueCompanyVerification({
            recId: recommendationId,
            name: String(resolvedCompany || company),
            locationHint: locationHint || undefined,
            companyNumber:
              resolvedCompanyNumber && String(resolvedCompanyNumber).trim()
                ? String(resolvedCompanyNumber).trim()
                : undefined,
          });
        } catch (e) {
          (ctx.log || console).warn(
            { err: e?.message || e },
            "[recommendations.post] queueCompanyVerification failed"
          );
        }

        /* ---------- Fire-and-forget: compute recommendation signals ---------- */
        computeRecommendationSignals({
          mysqlQuery,
          recommendationId,
          comment,
          log: console,
        }).catch(() => {});

        /* ---------- Auto-like by recommender (unless owner) ---------- */

        try {
          if (uid) {
            const ownerRows = await mysqlQuery(
              `SELECT ownerUserId
                 FROM projects
                WHERE id = ?
                LIMIT 1`,
              [projectId]
            );
            const ownerRow = ownerRows[0] || null;

            if (!ownerRow || String(ownerRow.ownerUserId) !== String(uid)) {
              // Expect a UNIQUE(recommendationId,userId) index so INSERT IGNORE is idempotent.
              await mysqlQuery(
                `INSERT IGNORE INTO recommendation_votes
                   (recommendationId, userId, value)
                 VALUES (?, ?, 1)`,
                [recommendationId, uid]
              );
            }
          }
        } catch (e) {
          (ctx.log || console).warn({ err: e?.message || e }, "[recommendation auto-like] failed");
        }

        /* ---------- Photos (R2 or local disk) ---------- */

        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length) {
          const values = [];
          const params = [];

          for (const f of files) {
            let filePath;
            let storedMime = f.mimetype;
            let storedSize = f.size ?? f.buffer?.length ?? 0;

            if (isR2Configured) {
              try {
                // HEIC -> JPEG + EXIF strip before upload.
                const p = await processBuffer({
                  buffer: f.buffer,
                  mimetype: f.mimetype,
                  originalname: f.originalname,
                });
                const upload = await uploadToR2({
                  buffer: p.buffer,
                  mimetype: p.mimetype,
                  originalname: p.originalname,
                  folder: "recommendations",
                });
                filePath = upload.publicUrl;
                storedMime = p.mimetype;
                storedSize = p.buffer?.length ?? storedSize;
              } catch (e) {
                (ctx.log || console).warn({ err: e?.message || e }, "[recommendations.post] R2 upload failed");
                continue;
              }
            } else {
              let fPath = f.path;
              if (fPath) {
                try {
                  const p = await processFile({
                    filePath: fPath,
                    mimetype: f.mimetype,
                    originalname: f.originalname,
                    filename: f.filename,
                  });
                  fPath = p.filePath;
                  storedMime = p.mimetype;
                } catch (e) {
                  (ctx.log || console).warn(
                    { err: e?.message || e },
                    "[recommendations.post] processFile failed",
                  );
                }
              }
              const rel = path
                .relative(UPLOAD_DIR, fPath)
                .split(path.sep)
                .join("/");
              filePath = `/uploads/${rel}`;
            }

            values.push("(?, ?, ?, ?, ?)");
            params.push(
              recommendationId,
              filePath,
              storedMime,
              storedSize,
              now
            );
          }

          if (values.length) {
            const sql = `
              INSERT INTO recommendation_photos
                (recommendationId, filePath, mime, sizeBytes, createdAt)
              VALUES ${values.join(", ")}
            `;
            try {
              await mysqlQuery(sql, params);
            } catch (e) {
              (ctx.log || console).warn(
                { err: e?.message || e },
                "[recommendations.post] inserting recommendation_photos failed"
              );
            }
          }
        }

        /* ---------- Notify project owner (MySQL + legacy notifyUsers) ---------- */

        try {
          const ownerRows = await mysqlQuery(
            `SELECT ownerUserId, name
               FROM projects
              WHERE id = ?
              LIMIT 1`,
            [projectId]
          );
          const ownerRow = ownerRows[0] || null;

          if (
            ownerRow &&
            ownerRow.ownerUserId &&
            String(ownerRow.ownerUserId) !== String(uid)
          ) {
            const ownerUid = ownerRow.ownerUserId;
            const message = `Someone has recommended a tradesperson to your project “${ownerRow.name}”`;
            const linkPath = `/projects/${projectId}`;

            try {
              await mysqlQuery(
                `INSERT INTO notifications
                   (userId, type, message, projectId, linkPath, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  ownerUid,
                  "recommendation_new",
                  message,
                  projectId,
                  linkPath,
                  new Date(), // separate timestamp for the notification
                ]
              );
              broadcastNotification?.(ownerUid, { type: "recommendation_new", message, projectId, linkPath });

              sendPushToUser({
                uid: ownerUid,
                type: "recommendation_new",
                title: "VetMyBuilder",
                body: message,
                linkPath,
                mysqlQuery,
                logActivity: ctx.logActivity,
              });
            } catch (e) {
              (ctx.log || console).warn(
                { err: e?.message || e },
                "[recommendations.post] failed to insert notification into MySQL"
              );
            }

            // Legacy: still fan out via notifyUsers (SQLite/SSE/email etc.)
            try {
              notifyUsers?.(db, [ownerUid], {
                type: "recommendation_new",
                message,
                projectId,
                linkPath,
              });
            } catch (e) {
              (ctx.log || console).warn({ err: e?.message || e }, "[notify-owner platform] failed");
            }
          }
        } catch (e) {
          (ctx.log || console).warn(
            { err: e?.message || e },
            "[recommendations.post] owner lookup/notify failed"
          );
        }

        /* ---------- Fire-and-forget: notify matched tradesman, then
                        (only if still off-platform) fire the invite ---------- */

        // matchAndNotifyTradesman may flip linked_tradesman_uid from NULL
        // to the matched tradesperson's uid. The off-platform invite below
        // MUST run AFTER it settles, otherwise it races against the link
        // and incorrectly emails an already-on-platform builder. Result of
        // that race: a recommendation_invites row gets created for an
        // on-platform rec, and matches.get.js's `recommended` query then
        // hides the rec from the swipe deck (its NOT EXISTS invites filter).
        matchAndNotifyTradesman({
          mysqlQuery,
          broadcastNotification,
          logActivity: ctx.logActivity,
          companyName: resolvedCompany || company,
          projectId,
          projectLocation: projectLocationHint || undefined,
          recommendationId,
        })
          .catch(() => {})
          .then(async () => {
            try {
              if (!companyEmail) return;

              const linkedRows = await mysqlQuery(
                `SELECT linked_tradesman_uid FROM recommendations WHERE id = ?`,
                [recommendationId],
              );
              const isOffPlatform = !linkedRows?.[0]?.linked_tradesman_uid;
              if (!isOffPlatform) return;

              let recommenderFirstName = "Someone";
              if (uid) {
                const userRows = await mysqlQuery(
                  `SELECT firstName FROM users WHERE uid = ? LIMIT 1`,
                  [uid],
                );
                recommenderFirstName = userRows?.[0]?.firstName || (name ? String(name).split(" ")[0] : "Someone");
              } else if (name) {
                recommenderFirstName = String(name).split(" ")[0] || "Someone";
              }

              // Always look up project location for the email — projectLocationHint
              // is only set when the recommender is the project owner.
              let projectArea = "their area";
              try {
                const projRows = await mysqlQuery(
                  `SELECT location FROM projects WHERE id = ? LIMIT 1`,
                  [projectId],
                );
                const loc = projRows?.[0]?.location;
                if (loc) {
                  const tokens = extractLocationTokens(loc);
                  projectArea = tokens?.outward || tokens?.city || "their area";
                }
              } catch {
                // fall through with default "their area"
              }

              await sendBuilderInviteEmail({
                mysqlQuery,
                recommendationId,
                recipientEmail: companyEmail,
                builderCompanyName: resolvedCompany || company,
                recommenderFirstName,
                projectArea,
              });
            } catch (e) {
              (ctx.log || console).warn(
                { err: e?.message || e },
                "[recommendations.post] off-platform invite failed",
              );
            }
          });

        // IMPORTANT: we DO NOT return name/email/phone of the recommender here.
        res.status(201).json({
          ok: true,
          recommendationId,
          resolvedCompany: resolvedCompany || company,
          resolvedBy, // 'db' | 'ch' | 'input'
          recommender: {
            relation: recommenderRelation, // "friend" | "neighbour" | "owner"
            source, // "platform" | "magic"
          },
        });
        analytics.trackRecommendationMade(req.user?.uid, { projectId, company: resolvedCompany || company, source });
        ctx.logActivity("rec.create", "info", req.user?.uid || "guest", `Rec for project #${projectId}, company="${company}"`);
        return;
      } catch (err) {
        (ctx.log || console).error({ err: err?.message || err }, "recommendations.post error");
        return res
          .status(500)
          .json({ error: "Internal error creating recommendation" });
      }
    }
  );
};
