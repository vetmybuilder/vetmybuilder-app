// server/routes/tradesmen/shares.post.js
/**
 * POST /api/tradesmen/shares
 * Auth: tradesman only
 * One submission per (project, tradesman)
 */

const path = require("node:path");
const { uploadToR2, isR2Configured } = require("../../lib/r2");
const analytics = require("../../lib/analytics");
const {
  processBuffer,
  processFile,
} = require("../../lib/imageSanitiser");

module.exports = (router, ctx) => {
  const {
    auth,
    mysqlQuery,
    upload,
    PUBLIC_API_BASE = "",
  } = ctx;

  const log = ctx.log || console;
  const TAG = "[tradesmen/shares.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Multer middleware — memory storage for R2, disk for local
  const multer = require("multer");
  const r2Upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 8 } });
  const withUploads = isR2Configured
    ? r2Upload.array("photos", 8)
    : typeof upload?.array === "function"
      ? upload.array("photos", 8)
      : (_req, _res, next) => next();

  // Helpers --------------------------------------------------------------------

  const projectById = async (id) => {
    const rows = await mysqlQuery(
      `SELECT * FROM projects WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  };

  const isLive = (p) => String(p?.status || "").toLowerCase() === "live";

  async function findTradesmanByUid(uid) {
    if (!uid) return null;
    const rows = await mysqlQuery(
      `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
      [uid]
    );
    return rows[0] || null;
  }

  async function resolveBuilderLinkPath(tm) {
    if (!tm) return null;
    if (tm.user_id) return `/tradesman/${tm.user_id}`;
    if (tm.profile_slug) return `/builder/${tm.profile_slug}`;
    if (tm.id) return `/builder/${tm.id}`;
    return null;
  }

  const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, "");
  const toRelUrl = (filename) => (filename ? `/uploads/${filename}` : "");
  const toAbsUrl = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

  const filesToPhotos = (files = []) =>
    files.map((f) => {
      const filename = f.filename || "";
      const rel = toRelUrl(filename);
      const abs = toAbsUrl(rel);
      return {
        name: f.originalname || filename || "",
        type: f.mimetype || "",
        size: Number(f.size) || 0,
        filename,
        url: rel,
        absoluteUrl: abs,
      };
    });

  const extractProjectId = (req) => {
    const first = (...vals) =>
      vals.find(
        (v) => v !== undefined && v !== null && String(v).trim() !== ""
      );

    const fromBody = first(
      req.body?.projectId,
      req.body?.pid,
      req.body?.project_id
    );
    const fromQuery = first(req.query?.projectId, req.query?.pid);
    const fromHead = first(
      req.headers["x-vmb-project"],
      req.headers["x-project-id"]
    );

    let fromRef = null;
    const ref = req.headers?.referer || req.headers?.referrer || "";
    const m = ref.match(/\/projects\/(\d+)(?:\/|$)/i);
    if (m && m[1]) fromRef = m[1];

    const raw = first(fromBody, fromQuery, fromHead, fromRef);
    const n = Number(String(raw || "").trim());
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };

  // Route ----------------------------------------------------------------------

  router.post("/tradesmen/shares", auth, withUploads, async (req, res) => {
    const uid = req.user?.uid || req.user?.id;

    log.info(`${TAG} incoming request`, {
      uid,
      bodyKeys: Object.keys(req.body || {}),
      filesCount: (req.files || []).length,
    });

    try {
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const tm = await findTradesmanByUid(uid);
      if (!tm) {
        log.warn(`${TAG} user is not tradesman`, { uid });
        return res
          .status(403)
          .json({ error: "Only tradesmen can share profiles." });
      }

      const pid = extractProjectId(req);
      if (!Number.isFinite(pid)) {
        log.warn(`${TAG} invalid projectId`, { pidRaw: req.body?.projectId });
        return res.status(400).json({ error: "Invalid projectId" });
      }

      const project = await projectById(pid);
      if (!project) {
        log.warn(`${TAG} project not found`, { pid });
        return res.status(404).json({ error: "Project not found" });
      }

      if (String(project.ownerUserId) === String(uid)) {
        return res
          .status(400)
          .json({ error: "You cannot share to your own project." });
      }
      if (!isLive(project)) {
        return res
          .status(400)
          .json({ error: "Project is not live and cannot accept shares." });
      }

      const companyName =
        tm.company_name ||
        tm.companyName ||
        tm.name ||
        tm.contact_name ||
        "A tradesman";

      // Check existing share
      const existingRows = await mysqlQuery(
        `
        SELECT id, created_at
          FROM trade_shares
         WHERE project_id = ? AND tradesman_uid = ?
         LIMIT 1
        `,
        [pid, uid]
      );
      const existing = existingRows[0] || null;

      // Photos
      let photos = [];
      if (Array.isArray(req.files) && req.files.length) {
        if (isR2Configured) {
          photos = (await Promise.all(req.files.map(async (f) => {
            try {
              const p = await processBuffer({
                buffer: f.buffer,
                mimetype: f.mimetype,
                originalname: f.originalname,
              });
              const url = await uploadToR2({ buffer: p.buffer, mimetype: p.mimetype, originalname: p.originalname, folder: "shares" });
              return {
                name: p.originalname || "",
                type: p.mimetype || "",
                size: p.buffer?.length ?? f.buffer?.length ?? 0,
                url,
                absoluteUrl: url,
              };
            } catch (e) {
              log.warn(`${TAG} R2 upload failed`, { error: e?.message });
              return null;
            }
          }))).filter(Boolean);
        } else {
          // Normalise each file on disk (HEIC -> JPEG, EXIF stripped)
          // then map to the photo payload shape. Capture the possibly-
          // renamed filename so URLs point to the right file.
          const processed = await Promise.all(
            req.files.map(async (f) => {
              if (!f.path) return f;
              try {
                const p = await processFile({
                  filePath: f.path,
                  mimetype: f.mimetype,
                  originalname: f.originalname,
                  filename: f.filename,
                });
                return {
                  ...f,
                  path: p.filePath,
                  filename: p.filename,
                  mimetype: p.mimetype,
                  originalname: p.originalname,
                };
              } catch (e) {
                log.warn(`${TAG} processFile failed`, { error: e?.message });
                return f;
              }
            }),
          );
          photos = filesToPhotos(processed);
        }
      } else if (Array.isArray(req.body?.photos)) {
        photos = (req.body.photos || []).map((p) => {
          const filename = p.filename || "";
          let rel = p.url || (filename ? toRelUrl(filename) : "");
          rel = rel.replace(/^\/api\/uploads\//, "/uploads/");
          const abs = p.absoluteUrl
            ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
            : toAbsUrl(rel);
          return { ...p, filename, url: rel, absoluteUrl: abs };
        });
      }

      const message = String(req.body?.message || "");

      // If already shared → idempotent return
      if (existing) {
        log.info(`${TAG} idempotent hit`, { shareId: existing.id });
        return res.json({
          ok: true,
          already: true,
          id: existing.id,
          createdAt: existing.created_at,
        });
      }

      // Insert new share
      const insertResult = await mysqlQuery(
        `
        INSERT INTO trade_shares
          (project_id, tradesman_uid, photos_json, message, created_at)
        VALUES (?, ?, ?, ?, NOW())
        `,
        [pid, uid, JSON.stringify(photos || []), message]
      );

      const shareId = insertResult.insertId;
      log.info(`${TAG} share created`, { shareId });

      const rowRows = await mysqlQuery(
        `SELECT * FROM trade_shares WHERE id = ? LIMIT 1`,
        [shareId]
      );
      const row = rowRows[0];

      res.status(201).json({
        ok: true,
        share: {
          id: row.id,
          projectId: row.project_id,
          tradesmanUid: row.tradesman_uid,
          photos,
          message: row.message || "",
          createdAt: row.created_at,
        },
      });
      analytics.trackProfileShared(req.user?.uid, { projectId: pid, companyName });
      ctx.logActivity("tradesman.share", "info", req.user.uid, `Shared profile on project #${pid}`);
      return;
    } catch (e) {
      log.error(`${TAG} unexpected`, { error: e?.message, stack: e?.stack });
      return res.status(500).json({ error: "Failed to save share" });
    }
  });
};
