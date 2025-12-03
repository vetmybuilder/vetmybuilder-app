// server/routes/projects/close.photos.get.js
// GET /api/projects/:id/close/photos -> { photos: [{id,filePath,fileUrl,mime,sizeBytes,createdAt}] }
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const path = require("path");
  const fs = require("fs");

  // Use the SAME dir you mount in server/index.js
  const uploadsRoot =
    (ctx && (ctx.UPLOAD_DIR || ctx.uploadsDir)) ||
    path.join(process.cwd(), "uploads");

  // PUBLIC_API_BASE is already passed in your server/index.js ctx
  const API_BASE =
    (ctx && ctx.PUBLIC_API_BASE) || process.env.NEXT_PUBLIC_API_BASE || "";

  function normalizeUploadPath(p) {
    if (!p) return p;
    const s = String(p).replace(/\\/g, "/");
    const i = s.indexOf("uploads/");
    const tail = i >= 0 ? s.slice(i) : s.replace(/^\/+/, "");
    const ensured = tail.startsWith("uploads/") ? tail : "uploads/" + tail;
    return "/" + ensured.replace(/^\/+/, "");
  }

  function toAbsDiskPath(normalized) {
    const rel = String(normalized).replace(/^\/?uploads\//, "");
    return path.join(uploadsRoot, rel);
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  router.get("/projects/:id/close/photos", auth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    // --- Load project from MySQL ---
    let project;
    try {
      const projectRows = await mysqlQuery(
        "SELECT id, ownerUserId, status, location FROM projects WHERE id = ?",
        [id]
      );
      project = projectRows[0] || null;
    } catch (err) {
      console.error(
        "Error fetching project in /projects/:id/close/photos (MySQL):",
        err
      );
      return res.status(500).json({ error: "internal_error" });
    }

    if (!project) return res.status(404).json({ error: "Not found" });

    // --- Authorization ---
    let allow = false;

    // 1) Owner can always see
    if (req.user.uid === project.ownerUserId) {
      allow = true;
    } else {
      // 2) Completed community visibility:
      //    Any authenticated user in the same area may view closure photos
      //    when the project is completed.
      if (project.status === "completed") {
        try {
          const meRows = await mysqlQuery(
            `SELECT locationRaw,
                    postcodeOutward,
                    postcodeSector,
                    postcode,
                    city
               FROM users
              WHERE uid = ?`,
            [req.user.uid]
          );
          const me = meRows[0] || null;

          const tokens = [];
          if (me) {
            const fields = [
              me.locationRaw,
              me.postcodeOutward,
              me.postcodeSector,
              me.postcode,
              me.city,
            ];
            for (const v of fields) {
              const s = String(v ?? "").trim();
              if (s) tokens.push(s);
            }
          }

          const normTokens = Array.from(new Set(tokens.map(norm))).filter(
            Boolean
          );
          const projLoc = norm(project.location);

          if (
            projLoc &&
            normTokens.length > 0 &&
            normTokens.some((t) => projLoc.includes(t))
          ) {
            allow = true;
          }
        } catch (err) {
          console.error(
            "Error fetching user for close.photos auth (MySQL):",
            err
          );
          // fall through; allow remains false
        }
      }
    }

    if (!allow) return res.status(403).json({ error: "Forbidden" });

    // --- Load photos from MySQL ---
    let rows;
    try {
      rows = await mysqlQuery(
        "SELECT id, filePath, mime, sizeBytes, createdAt FROM project_closure_photos WHERE projectId=? ORDER BY id DESC",
        [id]
      );
    } catch (err) {
      console.error(
        "Error fetching closure photos in /projects/:id/close/photos (MySQL):",
        err
      );
      return res.status(500).json({ error: "internal_error" });
    }

    const seen = new Set();
    const photos = [];
    for (const r of rows) {
      const browserPath = normalizeUploadPath(r.filePath); // e.g. /uploads/abc.jpg
      if (!browserPath) continue;

      const abs = toAbsDiskPath(browserPath);
      if (!fs.existsSync(abs)) continue; // hide orphans

      if (seen.has(browserPath)) continue;
      seen.add(browserPath);

      // IMPORTANT:
      // If API_BASE is a full URL, use it. Otherwise (e.g. '/api'), return the bare /uploads path
      // so Next.js rewrite `{ source: "/uploads/:path*", destination: "${target}/uploads/:path*" }` can work.
      const useAbsolute = /^https?:\/\//i.test(API_BASE);
      const fileUrl = useAbsolute
        ? API_BASE.replace(/\/+$/, "") + browserPath
        : browserPath;

      photos.push({
        ...r,
        filePath: browserPath, // keep for compatibility
        fileUrl, // absolute URL when needed, else /uploads/... for Next rewrite
      });
    }

    res.json({ photos });
  });
};

// // server/routes/projects/close.photos.get.js
// // GET /api/projects/:id/close/photos -> { photos: [{id,filePath,fileUrl,mime,sizeBytes,createdAt}] }
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;
//   const path = require("path");
//   const fs = require("fs");

//   // Use the SAME dir you mount in server/index.js
//   const uploadsRoot =
//     (ctx && (ctx.UPLOAD_DIR || ctx.uploadsDir)) ||
//     path.join(process.cwd(), "uploads");

//   // PUBLIC_API_BASE is already passed in your server/index.js ctx
//   const API_BASE =
//     (ctx && ctx.PUBLIC_API_BASE) || process.env.NEXT_PUBLIC_API_BASE || "";

//   function normalizeUploadPath(p) {
//     if (!p) return p;
//     const s = String(p).replace(/\\/g, "/");
//     const i = s.indexOf("uploads/");
//     const tail = i >= 0 ? s.slice(i) : s.replace(/^\/+/, "");
//     const ensured = tail.startsWith("uploads/") ? tail : "uploads/" + tail;
//     return "/" + ensured.replace(/^\/+/, "");
//   }

//   function toAbsDiskPath(normalized) {
//     const rel = String(normalized).replace(/^\/?uploads\//, "");
//     return path.join(uploadsRoot, rel);
//   }

//   function norm(s) {
//     return String(s || "")
//       .toLowerCase()
//       .replace(/\s+/g, "");
//   }

//   router.get("/projects/:id/close/photos", auth, (req, res) => {
//     const id = Number(req.params.id);
//     if (!Number.isFinite(id)) {
//       return res.status(400).json({ error: "Invalid id" });
//     }

//     const project = db
//       .prepare(
//         "SELECT id, ownerUserId, status, location FROM projects WHERE id=?"
//       )
//       .get(id);
//     if (!project) return res.status(404).json({ error: "Not found" });

//     // --- Authorization ---
//     let allow = false;

//     // 1) Owner can always see
//     if (req.user.uid === project.ownerUserId) {
//       allow = true;
//     } else {
//       // 2) Completed community visibility:
//       //    Any authenticated user in the same area may view closure photos
//       //    when the project is completed.
//       if (project.status === "completed") {
//         const me =
//           db.prepare(`SELECT * FROM users WHERE uid = ?`).get(req.user.uid) ||
//           null;

//         const candidateKeys = [
//           "location",
//           "postcodeOutward",
//           "postcodeSector",
//           "postcode",
//           "city",
//         ];
//         const tokens = [];
//         if (me && typeof me === "object") {
//           for (const k of candidateKeys) {
//             if (Object.prototype.hasOwnProperty.call(me, k)) {
//               const v = String(me[k] ?? "").trim();
//               if (v) tokens.push(v);
//             }
//           }
//         }

//         const normTokens = Array.from(new Set(tokens.map(norm))).filter(
//           Boolean
//         );
//         const projLoc = norm(project.location);
//         if (
//           projLoc &&
//           normTokens.length > 0 &&
//           normTokens.some((t) => projLoc.includes(t))
//         ) {
//           allow = true;
//         }
//       }
//     }

//     if (!allow) return res.status(403).json({ error: "Forbidden" });

//     // --- Load photos ---
//     const rows = db
//       .prepare(
//         "SELECT id, filePath, mime, sizeBytes, createdAt FROM project_closure_photos WHERE projectId=? ORDER BY id DESC"
//       )
//       .all(id);

//     const seen = new Set();
//     const photos = [];
//     for (const r of rows) {
//       const browserPath = normalizeUploadPath(r.filePath); // e.g. /uploads/abc.jpg
//       if (!browserPath) continue;

//       const abs = toAbsDiskPath(browserPath);
//       if (!fs.existsSync(abs)) continue; // hide orphans

//       if (seen.has(browserPath)) continue;
//       seen.add(browserPath);

//       // IMPORTANT:
//       // If API_BASE is a full URL, use it. Otherwise (e.g. '/api'), return the bare /uploads path
//       // so Next.js rewrite `{ source: "/uploads/:path*", destination: "${target}/uploads/:path*" }` can work.
//       const useAbsolute = /^https?:\/\//i.test(API_BASE);
//       const fileUrl = useAbsolute
//         ? API_BASE.replace(/\/+$/, "") + browserPath
//         : browserPath;

//       photos.push({
//         ...r,
//         filePath: browserPath, // keep for compatibility
//         fileUrl, // absolute URL when needed, else /uploads/... for Next rewrite
//       });
//     }

//     res.json({ photos });
//   });
// };
