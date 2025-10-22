// server/v2/routes/projects/recommendations.post.js
/**
 * POST /api/v2/projects/:id/recommendations
 * Auth: required
 * Body: JSON or multipart/form-data ("photos" up to 8)
 * Response: 201 { ok: true, recommendationId }
 */
module.exports = (router, ctx) => {
  const {
    db,
    auth,
    upload, // multer array("photos", 8) provided in ctx
    RecSchema, // reuse zod schema from ctx
    cleanPhone,
    queueCompanyVerification,
    notifyUsers,
    path: nodePath,
    UPLOAD_DIR,
  } = ctx;

  const path = nodePath || require("node:path");

  // Conditionally parse multipart
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
    "/projects/:id/recommendations",
    auth,
    multipartGate,
    (req, res) => {
      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId)) {
        return res.status(400).json({ error: "Invalid id" });
      }

      const asNumber = (v) =>
        v === undefined || v === null || v === "" ? undefined : Number(v);

      const payload = {
        name: String(req.body?.name ?? "").trim(),
        email: String(req.body?.email ?? "").trim() || undefined,
        phone: String(req.body?.phone ?? "").trim() || undefined,
        company: String(req.body?.company ?? "").trim(),
        rating: asNumber(req.body?.rating) ?? 5,
        comment: String(req.body?.comment ?? "").trim(),
      };

      const parsed = RecSchema.safeParse(payload);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", issues: parsed.error.issues });
      }

      const { name, email, phone, company, rating, comment } = parsed.data;
      const now = new Date().toISOString();
      const uid = req.user?.uid ?? null;

      const rawSource = String(req.body?.source ?? "")
        .trim()
        .toLowerCase();
      const source = rawSource === "magic" ? "magic" : "platform";

      const info = db
        .prepare(
          `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, email, phone, company, rating, comment, isAnonymous, source)
           VALUES
           (@projectId, @uid, @createdAt, @name, @email, @phone, @company, @rating, @comment, 0, @source)`
        )
        .run({
          projectId,
          uid,
          createdAt: now,
          name,
          email: email ?? null,
          phone: cleanPhone(phone),
          company,
          rating,
          comment,
          source,
        });

      const recommendationId = info.lastInsertRowid;

      // Companies House verification (fire-and-forget)
      try {
        // 1) Prefer explicit hint if caller provided it
        const explicitHint = String(
          (req.body?.locationHint ||
            req.body?.companyPostcode ||
            req.body?.companyCity ||
            ""
          ).toString()
        ).trim();

        let locationHint = "";
        if (explicitHint) {
          locationHint = explicitHint;
        } else {
          // 2) OPTIONAL: if the project owner is submitting, allow project's location as a weak hint
          try {
            const proj = db
              .prepare(
                `SELECT ownerUserId, location FROM projects WHERE id = ?`
              )
              .get(projectId);
            const isOwner =
              uid && proj && String(uid) === String(proj.ownerUserId);
            if (isOwner && proj?.location) {
              locationHint = String(proj.location);
            }
          } catch {}
        }

        queueCompanyVerification({
          recId: recommendationId,
          name: String(company),
          locationHint: locationHint || undefined, // pass undefined when empty
        });
      } catch (e) {
        console.warn("[platform-post] queueCompanyVerification failed", e);
      }

      // Auto-like by recommender unless they are the owner
      try {
        if (uid) {
          const ownerRow = db
            .prepare(`SELECT ownerUserId FROM projects WHERE id = ?`)
            .get(projectId);
          if (!ownerRow || String(ownerRow.ownerUserId) !== String(uid)) {
            db.prepare(
              `INSERT OR IGNORE INTO recommendation_votes (recommendationId, userId, value)
               VALUES (?, ?, 1)`
            ).run(recommendationId, uid);
          }
        }
      } catch (e) {
        console.warn("[recommendation auto-like] failed", e);
      }

      // photos (store relative path)
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length) {
        const stmt = db.prepare(
          `INSERT INTO recommendation_photos
             (recommendationId, filePath, mime, sizeBytes, createdAt)
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

      // Notify project owner
      try {
        const ownerRow = db
          .prepare(`SELECT ownerUserId, name FROM projects WHERE id = ?`)
          .get(projectId);

        if (
          ownerRow &&
          ownerRow.ownerUserId &&
          String(ownerRow.ownerUserId) !== String(uid)
        ) {
          notifyUsers?.(db, [ownerRow.ownerUserId], {
            type: "recommendation_new",
            message: `Someone has recommended a tradesperson to your project “${ownerRow.name}”`,
            projectId,
            linkPath: `/builders/${recommendationId}`,
          });
        }
      } catch (e) {
        console.warn("[notify-owner platform] failed", e);
      }

      return res.status(201).json({ ok: true, recommendationId });
    }
  );
};
