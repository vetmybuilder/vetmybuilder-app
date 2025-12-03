/**
 * POST /api/tradesmen/shares
 * Auth: tradesman only. One submission per (project, tradesman).
 *
 * Accepts:
 *  - JSON: { projectId, message?, photos?: [{ name,type,size,filename? }, ...] }
 *  - multipart/form-data:
 *      projectId|pid|project_id: number
 *      message?: string
 *      photos[]: files (up to 8)
 */
module.exports = (router, ctx) => {
  const {
    auth,
    mysqlQuery,
    notifyUsers,
    upload,
    PUBLIC_API_BASE = "",
    db,
  } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // Multer middleware (allows JSON + multipart)
  const withUploads =
    typeof upload?.array === "function"
      ? upload.array("photos", 8)
      : (_req, _res, next) => next();

  // ── Helpers ────────────────────────────────────────────────────────────────

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
    // MySQL schema: tradesmen.user_id
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

  // Build correct URLs: existing app serves files at /uploads/*
  const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, ""); // no trailing slash
  const toRelUrl = (filename) => (filename ? `/uploads/${filename}` : "");
  const toAbsUrl = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

  const filesToPhotos = (files = []) =>
    files.map((f) => {
      const filename = f.filename || "";
      const relUrl = toRelUrl(filename); // /uploads/<file>
      const absUrl = toAbsUrl(relUrl); // http(s)://host/uploads/<file>
      return {
        name: f.originalname || filename || "",
        type: f.mimetype || "",
        size: Number(f.size) || 0,
        filename,
        url: relUrl,
        absoluteUrl: absUrl,
      };
    });

  // Accept projectId from multiple places (body/query/headers/referrer)
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

  // Write to MySQL notifications table so the bell can see it
  async function createNotification({
    userId,
    type,
    message,
    projectId,
    linkPath,
  }) {
    try {
      await mysqlQuery(
        `INSERT INTO notifications
           (userId, type, message, projectId, linkPath, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          type,
          message,
          projectId,
          linkPath || null,
          new Date(), // mysql2 converts Date -> DATETIME
        ]
      );
    } catch (err) {
      console.warn(
        "[shares.post] failed to insert notification into MySQL:",
        err?.message || err
      );
    }
  }

  // ── Route ──────────────────────────────────────────────────────────────────
  router.post("/tradesmen/shares", auth, withUploads, async (req, res) => {
    try {
      const uid = req.user?.uid || req.user?.id;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      // must be a tradesman
      const tm = await findTradesmanByUid(uid);
      if (!tm) {
        return res
          .status(403)
          .json({ error: "Only tradesmen can share profiles." });
      }

      const pid = extractProjectId(req);
      if (!Number.isFinite(pid)) {
        return res.status(400).json({ error: "Invalid projectId" });
      }

      const project = await projectById(pid);
      if (!project) return res.status(404).json({ error: "Project not found" });

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

      // Normalised names for notification text
      const companyName =
        tm.company_name ||
        tm.companyName ||
        tm.name ||
        tm.contact_name ||
        "A tradesman";

      const projectName = project.name || "your project";

      const notifMessage = `${companyName} is interested in your ${projectName} and has shared their profile. Click to view.`;

      // idempotent guard
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

      // Accept photos from uploaded files OR JSON
      let photos = [];
      if (Array.isArray(req.files) && req.files.length) {
        photos = filesToPhotos(req.files);
      } else if (Array.isArray(req.body?.photos)) {
        photos = (req.body.photos || []).map((p) => {
          const filename = p.filename || "";
          let rel = p.url || (filename ? toRelUrl(filename) : "");
          // Normalize any old /api/uploads to /uploads (and add absolute)
          rel = rel.replace(/^\/api\/uploads\//, "/uploads/");
          const abs = p.absoluteUrl
            ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
            : toAbsUrl(rel);
          return { ...p, filename, url: rel, absoluteUrl: abs };
        });
      }

      const message = String(req.body?.message || "");

      // If share already exists, re-notify owner (idempotent UX)
      if (existing) {
        try {
          const linkPath =
            (await resolveBuilderLinkPath(tm)) || `/projects/${pid}/shares`;

          // New: write to MySQL notifications table
          await createNotification({
            userId: project.ownerUserId,
            type: "tradesman_shared_profile",
            message: notifMessage,
            projectId: pid,
            linkPath,
          });

          // Legacy: still fire notifyUsers for SSE / emails if any
          if (typeof notifyUsers === "function" && db) {
            notifyUsers(db, [project.ownerUserId], {
              type: "tradesman_shared_profile",
              message: notifMessage,
              projectId: pid,
              shareId: existing.id,
              linkPath,
            });
          }
        } catch (err) {
          console.warn("[shares.post] re-notify failed", err?.message || err);
        }

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

      const rowRows = await mysqlQuery(
        `SELECT * FROM trade_shares WHERE id = ? LIMIT 1`,
        [shareId]
      );
      const row = rowRows[0];

      // Notify owner
      try {
        const linkPath =
          (await resolveBuilderLinkPath(tm)) || `/projects/${pid}/shares`;

        // New: bell notification in MySQL
        await createNotification({
          userId: project.ownerUserId,
          type: "tradesman_shared_profile",
          message: notifMessage,
          projectId: pid,
          linkPath,
        });

        // Legacy: SQLite / SSE side-effects
        if (typeof notifyUsers === "function" && db) {
          notifyUsers(db, [project.ownerUserId], {
            type: "tradesman_shared_profile",
            message: notifMessage,
            projectId: pid,
            shareId: row.id,
            linkPath,
          });
        }
      } catch (e) {
        console.warn("[shares.post] notify failed", e);
      }

      return res.status(201).json({
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
    } catch (e) {
      console.error("[shares.post] error", e);
      return res.status(500).json({ error: "Failed to save share" });
    }
  });
};

// /**
//  * POST /api/tradesmen/shares
//  * Auth: tradesman only. One submission per (project, tradesman).
//  *
//  * Accepts:
//  *  - JSON: { projectId, message?, photos?: [{ name,type,size,filename? }, ...] }
//  *  - multipart/form-data:
//  *      projectId|pid|project_id: number
//  *      message?: string
//  *      photos[]: files (up to 8)
//  */
// module.exports = (router, ctx) => {
//   const { db, auth, notifyUsers, upload, PUBLIC_API_BASE = "" } = ctx;

//   // ── Table ────────────────────────────────────────────────────────────────────
//   db.prepare(
//     `
//     CREATE TABLE IF NOT EXISTS trade_shares (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       project_id INTEGER NOT NULL,
//       tradesman_uid TEXT NOT NULL,
//       photos_json TEXT NOT NULL DEFAULT '[]',
//       message TEXT DEFAULT '',
//       created_at TEXT NOT NULL DEFAULT (datetime('now')),
//       UNIQUE(project_id, tradesman_uid)
//     )
//   `
//   ).run();

//   // Multer middleware (allows JSON + multipart)
//   const withUploads =
//     typeof upload?.array === "function"
//       ? upload.array("photos", 8)
//       : (_req, _res, next) => next();

//   // ── Helpers ─────────────────────────────────────────────────────────────────
//   const projectById = (id) =>
//     db.prepare(`SELECT * FROM projects WHERE id=?`).get(id);

//   const isLive = (p) => String(p?.status || "").toLowerCase() === "live";

//   const findTradesmanByUid = (uid) => {
//     const cols = new Set(
//       db
//         .prepare(`PRAGMA table_info(tradesmen)`)
//         .all()
//         .map((r) => r.name)
//     );
//     if (cols.has("user_id")) {
//       const byUser = db
//         .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
//         .get(uid);
//       if (byUser) return byUser;
//     }
//     if (cols.has("uid")) {
//       return db.prepare(`SELECT * FROM tradesmen WHERE uid=?`).get(uid);
//     }
//     return null;
//   };

//   const resolveBuilderLinkPath = (tm) => {
//     if (!tm) return null;

//     const cols = new Set(
//       db
//         .prepare(`PRAGMA table_info(tradesmen)`)
//         .all()
//         .map((r) => r.name)
//     );

//     // Preferred: tradesman public profile page (/tradesman/<builderId>)
//     if (cols.has("user_id") && tm.user_id) {
//       return `/tradesman/${tm.user_id}`;
//     }

//     // Fallback: some schemas use "uid"
//     if (cols.has("uid") && tm.uid) {
//       return `/tradesman/${tm.uid}`;
//     }

//     // Backwards-compatibility with older "builder" URLs if you still have them
//     if (cols.has("id") && tm.id) {
//       return `/builder/${tm.id}`;
//     }
//     if (cols.has("profile_slug") && tm.profile_slug) {
//       return `/builder/${tm.profile_slug}`;
//     }

//     return null;
//   };

//   // Build correct URLs: existing app serves files at /uploads/*
//   const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, ""); // no trailing slash
//   const toRelUrl = (filename) => (filename ? `/uploads/${filename}` : "");
//   const toAbsUrl = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

//   const filesToPhotos = (files = []) =>
//     files.map((f) => {
//       const filename = f.filename || "";
//       const relUrl = toRelUrl(filename); // /uploads/<file>
//       const absUrl = toAbsUrl(relUrl); // http://host/uploads/<file>
//       return {
//         name: f.originalname || filename || "",
//         type: f.mimetype || "",
//         size: Number(f.size) || 0,
//         filename,
//         url: relUrl,
//         absoluteUrl: absUrl,
//       };
//     });

//   // Accept projectId from multiple places (body/query/headers/referrer)
//   const extractProjectId = (req) => {
//     const first = (...vals) =>
//       vals.find((v) => v !== undefined && v !== null && `${v}`.trim() !== "");
//     const fromBody = first(
//       req.body?.projectId,
//       req.body?.pid,
//       req.body?.project_id
//     );
//     const fromQuery = first(req.query?.projectId, req.query?.pid);
//     const fromHead = first(
//       req.headers["x-vmb-project"],
//       req.headers["x-project-id"]
//     );
//     let fromRef = null;
//     const ref = req.headers?.referer || req.headers?.referrer || "";
//     const m = ref.match(/\/projects\/(\d+)(?:\/|$)/i);
//     if (m && m[1]) fromRef = m[1];

//     const raw = first(fromBody, fromQuery, fromHead, fromRef);
//     const n = Number(String(raw || "").trim());
//     return Number.isFinite(n) && n > 0 ? n : NaN;
//   };

//   // ── Route ───────────────────────────────────────────────────────────────────
//   router.post("/tradesmen/shares", auth, withUploads, (req, res) => {
//     try {
//       const uid = req.user?.uid || req.user?.id;
//       if (!uid) return res.status(401).json({ error: "Unauthorized" });

//       // must be a tradesman
//       const tm = findTradesmanByUid(uid);
//       if (!tm) {
//         return res
//           .status(403)
//           .json({ error: "Only tradesmen can share profiles." });
//       }

//       const pid = extractProjectId(req);
//       if (!Number.isFinite(pid)) {
//         return res.status(400).json({ error: "Invalid projectId" });
//       }

//       const project = projectById(pid);
//       if (!project) return res.status(404).json({ error: "Project not found" });
//       if (String(project.ownerUserId) === String(uid)) {
//         return res
//           .status(400)
//           .json({ error: "You cannot share to your own project." });
//       }
//       if (!isLive(project)) {
//         return res
//           .status(400)
//           .json({ error: "Project is not live and cannot accept shares." });
//       }

//       // Normalised names for notification text
//       const companyName =
//         tm.company_name ||
//         tm.companyName ||
//         tm.name ||
//         tm.contact_name ||
//         "A tradesman";

//       // e.g. "Bathroom Project" or fall back to "your project"
//       const projectName = project.name || "your project";

//       const notifMessage = `${companyName} is interested in your ${projectName} and has shared their profile. Click to view.`;

//       // idempotent guard
//       const existing = db
//         .prepare(
//           `SELECT id, created_at FROM trade_shares WHERE project_id=? AND tradesman_uid=?`
//         )
//         .get(pid, uid);

//       // Accept photos from uploaded files OR JSON
//       let photos = [];
//       if (Array.isArray(req.files) && req.files.length) {
//         photos = filesToPhotos(req.files);
//       } else if (Array.isArray(req.body?.photos)) {
//         photos = (req.body.photos || []).map((p) => {
//           const filename = p.filename || "";
//           // Normalize any old /api/uploads to /uploads (and add absolute)
//           let rel = p.url || (filename ? toRelUrl(filename) : "");
//           rel = rel.replace(/^\/api\/uploads\//, "/uploads/");
//           const abs = p.absoluteUrl
//             ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
//             : toAbsUrl(rel);
//           return { ...p, filename, url: rel, absoluteUrl: abs };
//         });
//       }

//       const message = String(req.body?.message || "");

//       if (existing) {
//         // re-notify (idempotent UX)
//         try {
//           const linkPath =
//             resolveBuilderLinkPath(tm) || `/projects/${pid}/shares`;
//           if (typeof notifyUsers === "function") {
//             notifyUsers(db, [project.ownerUserId], {
//               type: "tradesman_shared_profile",
//               message: notifMessage,
//               projectId: pid,
//               shareId: existing.id,
//               linkPath,
//             });
//           }
//         } catch {}
//         return res.json({
//           ok: true,
//           already: true,
//           id: existing.id,
//           createdAt: existing.created_at,
//         });
//       }

//       // Insert
//       const info = db
//         .prepare(
//           `INSERT INTO trade_shares (project_id, tradesman_uid, photos_json, message)
//            VALUES (?, ?, ?, ?)`
//         )
//         .run(pid, uid, JSON.stringify(photos || []), message);

//       const row = db
//         .prepare(`SELECT * FROM trade_shares WHERE id=?`)
//         .get(info.lastInsertRowid);

//       // Notify owner
//       try {
//         const linkPath =
//           resolveBuilderLinkPath(tm) || `/projects/${pid}/shares`;
//         if (typeof notifyUsers === "function") {
//           notifyUsers(db, [project.ownerUserId], {
//             type: "tradesman_shared_profile",
//             message: notifMessage,
//             projectId: pid,
//             shareId: row.id,
//             linkPath,
//           });
//         }
//       } catch (e) {
//         console.warn("[shares.post] notify failed", e);
//       }

//       return res.status(201).json({
//         ok: true,
//         share: {
//           id: row.id,
//           projectId: row.project_id,
//           tradesmanUid: row.tradesman_uid,
//           photos,
//           message: row.message || "",
//           createdAt: row.created_at,
//         },
//       });
//     } catch (e) {
//       console.error("[shares.post] error", e);
//       return res.status(500).json({ error: "Failed to save share" });
//     }
//   });
// };
