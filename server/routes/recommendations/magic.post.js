// server/routes/recommendations/magic.post.js

/**
 * POST /api/recommendations/magic/:token
 * Auth: optional (anonymous allowed)
 * Handles JSON or multipart (photos)
 */

module.exports = (router, ctx) => {
  const { db, admin, notifyUsers, mysqlQuery } = ctx;
  const { uploadToR2, isR2Configured } = require("../../lib/r2");
  const {
    processBuffer,
    processFile,
  } = require("../../lib/imageSanitiser");
  const log = ctx.log || console;
  const TAG = "[recommendations/magic.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // --- deps ---
  const z = require("zod");
  const path = ctx.path || require("node:path");
  const crypto = require("node:crypto");
  const UPLOAD_DIR = ctx.UPLOAD_DIR || path.resolve(process.cwd(), "uploads");

  const { _roughNameScore } = (() => {
    try {
      return require("../lib/companyVerifyHelpers");
    } catch {
      return { _roughNameScore: () => 0 };
    }
  })();

  const { queueVerification } = (() => {
    try {
      return require("../lib/companyVerification");
    } catch {
      return { queueVerification: () => {} };
    }
  })();

  const { computeRecommendationSignals } = require("../../lib/ai/recommendationSignaller");

  // FIXED: previously incorrectly referenced ctxGetCompanyProfile
  const matchByName = ctx.matchByName;
  const searchCompanies = ctx.searchCompanies;
  const getCompanyProfile = ctx.getCompanyProfile;

  const queueCompanyVerification = ctx.queueCompanyVerification || (() => {});

  const cleanPhone =
    ctx.cleanPhone ||
    function cleanPhone(input) {
      if (!input) return null;
      const s = String(input).trim();
      return s.replace(/[^\d+]/g, "") || null;
    };

  const RecSchema =
    ctx.RecSchema ||
    z
      .object({
        name: z.string().min(0).max(120),
        email: z
          .string()
          .email()
          .optional()
          .or(z.literal("").transform(() => undefined)),
        phone: z
          .string()
          .min(0)
          .max(40)
          .optional()
          .or(z.literal("").transform(() => undefined)),
        company: z.string().min(1).max(200),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        comment: z.string().min(10).max(2000),
      })
      .transform((v) => ({
        ...v,
        rating: typeof v.rating === "number" ? v.rating : undefined,
      }));

  function optionalAuth(adminInstance) {
    return async (req, _res, next) => {
      try {
        const h = req.headers?.authorization || "";
        if (h.startsWith("Bearer ")) {
          const token = h.slice(7);
          const decoded = await adminInstance.auth().verifyIdToken(token);
          req.user = { uid: decoded.uid, email: decoded.email || null };
        }
      } catch {
        // ignore
      }
      next();
    };
  }

  const upload = (() => {
    const multer = require("multer");
    const storage = isR2Configured ? multer.memoryStorage() : (() => {
      const fs = require("node:fs");
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      return multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname || "");
          const base = Date.now().toString(36) + "-" + crypto.randomBytes(6).toString("base64url");
          cb(null, `${base}${ext}`);
        },
      });
    })();
    return multer({ storage, limits: { fileSize: 8 * 1024 * 1024, files: 8 }, fileFilter: (_req, file, cb) => {
      // HEIC / HEIF accepted - imageSanitiser transcodes to JPEG.
      const ok = /^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.mimetype);
      cb(ok ? null : new Error("Only images are allowed"), ok);
    }});
  })();

  const multipartGate = (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      upload.array("photos", 8)(req, res, (err) => {
        if (err) {
          log.warn(`${TAG} upload failed`, { error: err?.message });
          return res.status(400).json({ error: err.message });
        }
        next();
      });
    } else {
      next();
    }
  };

  /* =======================================================================
   *                               ROUTE
   * ======================================================================= */

  router.post(
    "/recommendations/magic/:token",
    optionalAuth(admin),
    multipartGate,
    async (req, res) => {
      const { token } = req.params;
      log.info(`${TAG} hit`, { token });

      try {
        // -------------------------
        //   1) Load magic token
        // -------------------------
        const linkRows = await mysqlQuery(
          `SELECT * FROM recommendation_links WHERE token = ? LIMIT 1`,
          [token]
        );
        const link = linkRows[0];

        if (!link) {
          log.warn(`${TAG} invalid token`, { token });
          return res
            .status(404)
            .json({ error: "Invalid or expired link token." });
        }

        // -------------------------
        //   2) Load project
        // -------------------------
        const projRows = await mysqlQuery(
          `SELECT id, status, location, ownerUserId, name
             FROM projects WHERE id = ? LIMIT 1`,
          [link.projectId]
        );
        const proj = projRows[0];

        if (!proj || String(proj.status).toLowerCase() !== "live") {
          log.warn(`${TAG} project not live`, {
            projectId: link.projectId,
            status: proj?.status,
          });
          return res.status(400).json({
            error: "This project is not accepting recommendations yet.",
          });
        }

        // -------------------------
        //   3) Parse incoming payload
        // -------------------------
        const asNumber = (v) => (v === "" || v == null ? undefined : Number(v));

        const payload = {
          name: String(req.body?.name ?? "").trim(),
          email: String(req.body?.email ?? "").trim() || undefined,
          phone: String(req.body?.phone ?? "").trim() || undefined,
          company: String(req.body?.company ?? "").trim(),
          rating: asNumber(req.body?.rating),
          comment: String(req.body?.comment ?? "").trim(),
        };

        if (!payload.name) payload.name = "Anonymous";

        const parsed = RecSchema.safeParse(payload);
        if (!parsed.success) {
          log.warn(`${TAG} invalid payload`, {
            issues: parsed.error.issues,
          });
          return res.status(400).json({
            error: "Invalid payload",
            issues: parsed.error.issues,
          });
        }

        const { name, email, phone, company, comment } = parsed.data;

        const hireAgain = (req.body?.hireAgain || "").toLowerCase();
        let ratingNum = Number.isFinite(parsed.data.rating)
          ? parsed.data.rating
          : hireAgain === "no"
          ? 1
          : 5;
        ratingNum = Math.max(1, Math.min(5, ratingNum));

        const now = new Date().toISOString().slice(0, 19).replace("T", " ");
        const uid = req.user?.uid ?? null;
        const isAnonymous = uid ? 0 : 1;

        // -------------------------
        //   4) Resolve Company Name
        // -------------------------
        let resolvedCompany = company;
        let resolvedBy = "input";

        const locationHint =
          String(
            req.body?.postcode || req.body?.city || proj?.location || ""
          ).trim() || undefined;

        // DB match
        try {
          const local = await mysqlQuery(
            `SELECT company
               FROM recommendations
              WHERE LOWER(company) = LOWER(?)
              ORDER BY id DESC LIMIT 1`,
            [company]
          );
          if (local[0]?.company) {
            resolvedCompany = local[0].company.trim();
            resolvedBy = "db";
            log.info(`${TAG} local company match`, { resolvedCompany });
          }
        } catch (e) {
          log.warn(`${TAG} local DB lookup failed`, { error: e?.message });
        }

        // CH match
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
              if (result?.ok && result.company?.name) {
                resolvedCompany = result.company.name.trim();
                resolvedBy = "ch";
                log.info(`${TAG} CH matchByName`, {
                  resolvedCompany,
                });
              }
            } else {
              const search = await searchCompanies({
                name: company,
                itemsPerPage: 50,
              });
              const items = Array.isArray(search?.items) ? search.items : [];

              const ranked = items
                .filter((i) => i?.title && i.company_number)
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
                  resolvedCompany = chName.trim();
                  resolvedBy = "ch";
                  log.info(`${TAG} CH fallback match`, {
                    resolvedCompany,
                  });
                }
              }
            }
          } catch (e) {
            log.warn(`${TAG} CH lookup failed`, { error: e?.message });
          }
        }

        // -------------------------
        //   5) Insert into MySQL
        // -------------------------
        const insertResult = await mysqlQuery(
          `INSERT INTO recommendations
             (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'magic')`,
          [
            link.projectId,
            uid,
            now,
            name,
            email || null,
            cleanPhone(phone),
            resolvedCompany,
            ratingNum,
            comment,
            isAnonymous,
          ]
        );

        const recommendationId = insertResult.insertId;

        log.info(`${TAG} recommendation inserted`, {
          recommendationId,
          resolvedCompany,
          resolvedBy,
        });

        const recommenderRelation = uid ? "neighbour" : "friend";

        queueVerification(queueCompanyVerification, {
          recId: recommendationId,
          name: resolvedCompany,
          locationHint,
          sourceTag: "magic",
        });

        // Fire-and-forget: compute recommendation signals (sentiment, themes, generic_score)
        computeRecommendationSignals({
          mysqlQuery,
          recommendationId,
          comment,
          log,
        }).catch(() => {});

        // -------------------------
        //   6) Photos
        // -------------------------
        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length) {
          const stmt =
            `INSERT INTO recommendation_photos ` +
            `(recommendationId, filePath, mime, sizeBytes, createdAt) ` +
            `VALUES (?, ?, ?, ?, ?)`;

          for (const f of files) {
            let filePath;
            let storedMime = f.mimetype;
            let storedSize = f.size ?? f.buffer?.length ?? 0;

            if (isR2Configured) {
              try {
                const p = await processBuffer({
                  buffer: f.buffer,
                  mimetype: f.mimetype,
                  originalname: f.originalname,
                });
                filePath = (await uploadToR2({ buffer: p.buffer, mimetype: p.mimetype, originalname: p.originalname, folder: "recommendations" })).publicUrl;
                storedMime = p.mimetype;
                storedSize = p.buffer?.length ?? storedSize;
              } catch (e) {
                log.warn(`${TAG} R2 upload failed`, { error: e?.message });
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
                  log.warn(`${TAG} processFile failed`, { error: e?.message });
                }
              }
              const rel = path.relative(UPLOAD_DIR, fPath).split(path.sep).join("/");
              filePath = `/uploads/${rel}`;
            }
            await mysqlQuery(stmt, [recommendationId, filePath, storedMime, storedSize, now]);
          }

          log.info(`${TAG} photos stored`, { count: files.length });
        }

        // -------------------------
        //   7) Notify owner
        // -------------------------
        try {
          if (proj.ownerUserId && proj.ownerUserId !== uid) {
            if (typeof notifyUsers === "function" && db) {
              notifyUsers(db, [proj.ownerUserId], {
                type: "recommendation_new",
                message: `Someone recommended a tradesperson to your project "${proj.name}"`,
                projectId: link.projectId,
                linkPath: `/projects/${link.projectId}`,
              });
            }
            log.info(`${TAG} owner notified`, {
              ownerUid: proj.ownerUserId,
            });
          }
        } catch (e) {
          log.warn(`${TAG} notify failed`, { error: e?.message });
        }

        // -------------------------
        //   8) Auto-like
        // -------------------------
        try {
          if (hireAgain !== "no") {
            const voterId = uid || `magic:${token}`;
            const exists = await mysqlQuery(
              `SELECT 1 FROM recommendation_votes
               WHERE recommendationId = ? AND userId = ? LIMIT 1`,
              [recommendationId, voterId]
            );
            if (!exists.length) {
              await mysqlQuery(
                `INSERT INTO recommendation_votes
                   (recommendationId, userId, value)
                 VALUES (?, ?, 1)`,
                [recommendationId, voterId]
              );
            }

            log.info(`${TAG} auto-liked`, { voterId });
          }
        } catch (e) {
          log.warn(`${TAG} auto-like failed`, { error: e?.message });
        }

        res.status(201).json({
          ok: true,
          recommendationId,
          resolvedCompany,
          resolvedBy,
          recommender: {
            relation: recommenderRelation,
            source: "magic",
          },
        });
        ctx.logActivity("rec.magic-link", "info", req.user?.uid || "guest", "Magic recommendation created");
        return;
      } catch (err) {
        log.error(`${TAG} fatal`, err);
        return res.status(500).json({
          error: "Internal error creating recommendation via magic",
        });
      }
    }
  );

  if (!ctx.__logged_magic_post) {
    ctx.__logged_magic_post = true;

    log.info(
      {
        route: "/api/recommendations/magic/:token",
        method: "POST",
      },
      "[routes] mounted"
    );
  }
};
