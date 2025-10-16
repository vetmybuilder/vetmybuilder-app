// server/v2/routes/recommendations/magic.post.js
/**
 * POST /api/v2/recommendations/magic/:token
 * Auth: optional (anonymous allowed)
 * Body:
 *   - JSON or multipart/form-data (field: photos[] up to 8)
 *   - { name?, email?, phone?, company, rating?, comment, hireAgain? }
 * Behavior:
 *   - Anonymous name defaults to "Anonymous"
 *   - rating: prefers numeric; else maps hireAgain=no -> 1, default 5; clamped [1..5]
 *   - Stores photos under UPLOAD_DIR and records rows
 *   - Notifies project owner (if different from submitter)
 *   - Auto-like if hireAgain !== "no"
 * Response: 201 { ok: true, recommendationId }
 */
module.exports = (router, ctx) => {
  const { db, admin, notifyUsers } = ctx;

  // --- deps (with safe fallbacks if not provided on ctx) ---
  const z = require("zod");
  const crypto = require("node:crypto"); // not directly used here, but fine to keep available
  const path = ctx.path || require("node:path");
  const UPLOAD_DIR = ctx.UPLOAD_DIR || path.resolve(process.cwd(), "uploads"); // fallback to same default

  // RecSchema (reuse from ctx if provided; otherwise recreate)
  const RecSchema =
    ctx.RecSchema ||
    z
      .object({
        name: z.string().min(0).max(120), // can be blank; we coerce to "Anonymous"
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
      .transform((v) => {
        const r = typeof v.rating === "number" ? v.rating : undefined; // we'll finish mapping below
        return { ...v, rating: r };
      });

  // cleanPhone helper
  const cleanPhone =
    ctx.cleanPhone ||
    function cleanPhone(input) {
      if (!input) return null;
      const s = String(input).trim();
      if (!s) return null;
      const compact = s.replace(/[^\d+]/g, "");
      return compact || null;
    };

  // optionalAuth helper (same semantics as monolith)
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
        // ignore invalid/expired tokens
      }
      next();
    };
  }

  // Multer uploader: prefer provided ctx.upload; otherwise build a local one
  const upload =
    ctx.upload ||
    (() => {
      const fs = require("node:fs");
      const multer = require("multer");
      if (!fs.existsSync(UPLOAD_DIR))
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const storage = multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname || "");
          const base =
            Date.now().toString(36) +
            "-" +
            require("node:crypto").randomBytes(6).toString("base64url");
          cb(null, `${base}${ext || ""}`);
        },
      });
      return multer({
        storage,
        limits: { fileSize: 8 * 1024 * 1024, files: 8 },
        fileFilter: (_req, file, cb) => {
          const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
          cb(ok ? null : new Error("Only images are allowed"), ok);
        },
      });
    })();

  const queueCompanyVerification =
    ctx.queueCompanyVerification || /* no-op fallback */ (() => {});

  // --- middleware to conditionally parse multipart like in monolith ---
  const multipartGate = (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("multipart/form-data")) {
      upload.array("photos", 8)(req, res, (err) => {
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
    "/recommendations/magic/:token",
    optionalAuth(admin),
    multipartGate,
    (req, res) => {
      const { token } = req.params;

      const link = db
        .prepare(`SELECT * FROM recommendation_links WHERE token = ?`)
        .get(token);
      if (!link) {
        console.warn("[magic-post] token not found", { token });
        return res
          .status(404)
          .json({ error: "Invalid or expired link token." });
      }

      const proj = db
        .prepare(`SELECT status FROM projects WHERE id = ?`)
        .get(link.projectId);
      if (!proj || String(proj.status || "").toLowerCase() !== "live") {
        console.warn("[magic-post] project not live", {
          token,
          pid: link.projectId,
        });
        return res.status(400).json({
          error: "This project is not accepting recommendations yet.",
        });
      }

      const asNumber = (v) =>
        v === undefined || v === null || v === "" ? undefined : Number(v);

      // Build payload (works for multipart & json)
      const payload = {
        name: String(req.body?.name ?? "").trim(),
        email: String(req.body?.email ?? "").trim() || undefined,
        phone: String(req.body?.phone ?? "").trim() || undefined,
        company: String(req.body?.company ?? "").trim(),
        rating: asNumber(req.body?.rating), // may be undefined; we map later
        comment: String(req.body?.comment ?? "").trim(),
      };

      if (!payload.name) payload.name = "Anonymous";

      const parsed = RecSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn("[magic-post] bad payload", parsed.error.flatten());
        return res
          .status(400)
          .json({ error: "Invalid payload", issues: parsed.error.issues });
      }

      const { name, email, phone, company, comment } = parsed.data;

      // rating mapping
      const rawParsedRating = parsed.data.rating;
      const hireAgainRaw =
        typeof req.body?.hireAgain === "string"
          ? req.body.hireAgain.toLowerCase()
          : undefined;

      let ratingNum = Number.isFinite(rawParsedRating)
        ? Number(rawParsedRating)
        : hireAgainRaw === "no"
        ? 1
        : 5;
      ratingNum = Math.max(1, Math.min(5, ratingNum));

      const now = new Date().toISOString();
      const uid = req.user?.uid ?? null;
      const isAnonymous = uid ? 0 : 1;

      const info = db
        .prepare(
          `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
           VALUES
           (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, @isAnonymous, 'magic')`
        )
        .run({
          projectId: link.projectId,
          uid,
          createdAt: now,
          name,
          email: email ?? null,
          phone: cleanPhone(phone),
          company,
          rating: ratingNum,
          comment,
          isAnonymous,
        });

      const recommendationId = info.lastInsertRowid;

      // Companies House verification (fire-and-forget)
      try {
        const projectRow = db
          .prepare(`SELECT location FROM projects WHERE id = ?`)
          .get(link.projectId);
        const locationHint =
          String(
            req.body?.postcode || req.body?.city || projectRow?.location || ""
          ).trim() || undefined;

        queueCompanyVerification({
          recId: recommendationId,
          name: String(company),
          locationHint,
        });
      } catch (e) {
        console.warn("[magic-post] queueCompanyVerification failed", e);
      }

      // Persist photos if any (store relative path)
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length) {
        const stmt = db.prepare(
          `INSERT INTO recommendation_photos (recommendationId, filePath, mime, sizeBytes, createdAt)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const f of files) {
          const rel = path
            .relative(UPLOAD_DIR, f.path)
            .split(path.sep)
            .join("/");
          stmt.run(
            recommendationId,
            `/uploads/${rel}`,
            f.mimetype,
            f.size,
            now
          );
        }
      }

      // Notify owner
      try {
        const ownerRow = db
          .prepare(`SELECT ownerUserId, name FROM projects WHERE id=?`)
          .get(link.projectId);
        if (ownerRow && ownerRow.ownerUserId) {
          const submitter = uid || null;
          if (ownerRow.ownerUserId !== submitter) {
            notifyUsers?.(db, [ownerRow.ownerUserId], {
              type: "recommendation_new",
              message: `Someone has recommended a tradesperson to your project “${ownerRow.name}”`,
              projectId: link.projectId,
              linkPath: `/projects/${link.projectId}`,
            });
          }
        }
      } catch (e) {
        console.warn("[notify-owner magic] failed", e);
      }

      // Auto-like when hireAgain != "no"
      try {
        if (hireAgainRaw !== "no") {
          const voterId = uid || `magic:${token}`;
          db.prepare(
            `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
             VALUES (?, ?, 1)`
          ).run(recommendationId, voterId);
        }
      } catch (e) {
        console.warn("[magic-post] auto-like failed", e);
      }

      console.log("[magic-post] recommendation created", {
        token,
        pid: link.projectId,
        uid: uid || "anon",
        photos: files.length,
        rating: ratingNum,
      });

      return res.status(201).json({ ok: true, recommendationId });
    }
  );
};
