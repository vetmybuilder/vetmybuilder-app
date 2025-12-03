// server/routes/projects/magic-link.post.js
/**
 * POST /api/projects/:id/magic-link
 * Auth: required (owner only)
 * Requires project.status === 'live'
 * Query/body: rotate=1 to force a new token
 * Returns: { ok: true, url, token, projectId }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const crypto = require("node:crypto");

  router.post("/projects/:id/magic-link", auth, async (req, res) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    // ---- 1) Check project + ownership + status (MySQL) ----
    let projectRows;
    try {
      projectRows = await mysqlQuery(
        `SELECT id, ownerUserId, status
           FROM projects
          WHERE id = ?`,
        [projectId]
      );
    } catch (err) {
      console.error("MySQL error fetching project in magic-link:", err);
      return res.status(500).json({ error: "internal_error" });
    }

    const project = projectRows[0] || null;
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    if (String(project.ownerUserId) !== String(req.user.uid)) {
      return res
        .status(403)
        .json({ error: "Only the owner can generate invites." });
    }
    if (String(project.status || "").toLowerCase() !== "live") {
      return res.status(400).json({
        error: "Project must be live before inviting recommendations.",
      });
    }

    // ---- 2) Determine if we should rotate the token ----
    const rotate =
      String(req.query.rotate || "").toLowerCase() === "1" ||
      String(req.body?.rotate || "").toLowerCase() === "1";

    // ---- 3) Fetch latest link (if any) ----
    let link;
    try {
      const linkRows = await mysqlQuery(
        `SELECT id, token, createdAt
           FROM recommendation_links
          WHERE projectId = ?
          ORDER BY id DESC
          LIMIT 1`,
        [projectId]
      );
      link = linkRows[0] || null;
    } catch (err) {
      console.error(
        "MySQL error fetching recommendation_links in magic-link:",
        err
      );
      return res.status(500).json({ error: "internal_error" });
    }

    // ---- 4) Create or rotate token ----
    try {
      if (!link) {
        // No existing link → create new
        const token = crypto.randomBytes(24).toString("base64url");

        await mysqlQuery(
          `INSERT INTO recommendation_links (projectId, token)
           VALUES (?, ?)`,
          [projectId, token]
        );

        const linkRows = await mysqlQuery(
          `SELECT id, token, createdAt
             FROM recommendation_links
            WHERE projectId = ?
            ORDER BY id DESC
            LIMIT 1`,
          [projectId]
        );
        link = linkRows[0] || null;
        console.log("[magic-link] created", { projectId, token: link.token });
      } else if (rotate) {
        // Existing link + rotate=1 → update token (and bump createdAt)
        const newToken = crypto.randomBytes(24).toString("base64url");

        await mysqlQuery(
          `UPDATE recommendation_links
              SET token = ?, createdAt = NOW()
            WHERE id = ?`,
          [newToken, link.id]
        );

        const linkRows = await mysqlQuery(
          `SELECT id, token, createdAt
             FROM recommendation_links
            WHERE id = ?`,
          [link.id]
        );
        link = linkRows[0] || null;
        console.log("[magic-link] rotated", { projectId, token: link.token });
      } else {
        console.log("[magic-link] existing", {
          projectId,
          token: link.token,
        });
      }
    } catch (err) {
      console.error("MySQL error creating/rotating magic-link:", err);
      return res.status(500).json({ error: "internal_error" });
    }

    if (!link) {
      // Extremely unlikely, but guard against null
      return res.status(500).json({ error: "internal_error" });
    }

    // ---- 5) Build absolute WEB URL for share page ----
    function resolveWebBase(req) {
      const explicit =
        process.env.WEB_PUBLIC_BASE || process.env.NEXT_PUBLIC_WEB_BASE;
      if (explicit) return String(explicit).replace(/\/+$/, "");

      if (process.env.NODE_ENV === "production") {
        const proto =
          String(req.headers["x-forwarded-proto"] || req.protocol || "http")
            .split(",")[0]
            .trim() || "http";
        let host = String(
          req.headers["x-forwarded-host"] || req.headers.host || ""
        )
          .split(",")[0]
          .trim();
        if (!host) return `${proto}://localhost:3000`;
        host = host.replace(/:8787$/, ":3000");
        return `${proto}://${host}`;
      }

      return "http://localhost:3000";
    }

    const webBase = resolveWebBase(req);
    const url = new URL(`/r/${link.token}`, webBase).toString();

    return res
      .status(200)
      .json({ ok: true, url, token: link.token, projectId });
  });
};

// // server/routes/projects/magic-link.post.js
// /**
//  * POST /api/projects/:id/magic-link
//  * Auth: required (owner only)
//  * Requires project.status === 'live'
//  * Query/body: rotate=1 to force a new token
//  * Returns: { ok: true, url, token, projectId }
//  */
// module.exports = (router, ctx) => {
//   const { db, auth } = ctx;
//   const crypto = require("node:crypto");

//   router.post("/projects/:id/magic-link", auth, (req, res) => {
//     const projectId = Number(req.params.id);
//     if (!Number.isFinite(projectId)) {
//       return res.status(400).json({ error: "Invalid id" });
//     }

//     const project = db
//       .prepare(`SELECT id, ownerUserId, status FROM projects WHERE id = ?`)
//       .get(projectId);

//     if (!project) return res.status(404).json({ error: "Project not found" });
//     if (String(project.ownerUserId) !== String(req.user.uid)) {
//       return res
//         .status(403)
//         .json({ error: "Only the owner can generate invites." });
//     }
//     if (String(project.status || "").toLowerCase() !== "live") {
//       return res.status(400).json({
//         error: "Project must be live before inviting recommendations.",
//       });
//     }

//     // Ensure table exists (back-compat)
//     db.exec(`
//       CREATE TABLE IF NOT EXISTS recommendation_links (
//         id INTEGER PRIMARY KEY AUTOINCREMENT,
//         projectId INTEGER NOT NULL,
//         token TEXT NOT NULL,
//         createdAt TEXT NOT NULL
//       );
//     `);

//     const rotate =
//       String(req.query.rotate || "").toLowerCase() === "1" ||
//       String(req.body?.rotate || "").toLowerCase() === "1";

//     const now = new Date().toISOString();

//     // Fetch latest link (handles older DBs with duplicates)
//     let link = db
//       .prepare(
//         `SELECT id, token, createdAt
//            FROM recommendation_links
//           WHERE projectId = ?
//           ORDER BY id DESC
//           LIMIT 1`
//       )
//       .get(projectId);

//     if (!link) {
//       const token = crypto.randomBytes(24).toString("base64url");
//       db.prepare(
//         `INSERT INTO recommendation_links (projectId, token, createdAt)
//          VALUES (?, ?, ?)`
//       ).run(projectId, token, now);

//       link = db
//         .prepare(
//           `SELECT id, token, createdAt
//              FROM recommendation_links
//             WHERE projectId = ?
//             ORDER BY id DESC
//             LIMIT 1`
//         )
//         .get(projectId);
//       console.log("[magic-link] created", { projectId, token: link.token });
//     } else if (rotate) {
//       const token = crypto.randomBytes(24).toString("base64url");
//       db.prepare(
//         `UPDATE recommendation_links SET token = ?, createdAt = ? WHERE id = ?`
//       ).run(token, now, link.id);

//       link = db
//         .prepare(
//           `SELECT id, token, createdAt
//              FROM recommendation_links
//             WHERE id = ?`
//         )
//         .get(link.id);
//       console.log("[magic-link] rotated", { projectId, token: link.token });
//     } else {
//       console.log("[magic-link] existing", { projectId, token: link.token });
//     }

//     // Build absolute WEB URL for share page
//     function resolveWebBase(req) {
//       const explicit =
//         process.env.WEB_PUBLIC_BASE || process.env.NEXT_PUBLIC_WEB_BASE;
//       if (explicit) return String(explicit).replace(/\/+$/, "");

//       if (process.env.NODE_ENV === "production") {
//         const proto =
//           String(req.headers["x-forwarded-proto"] || req.protocol || "http")
//             .split(",")[0]
//             .trim() || "http";
//         let host = String(
//           req.headers["x-forwarded-host"] || req.headers.host || ""
//         )
//           .split(",")[0]
//           .trim();
//         if (!host) return `${proto}://localhost:3000`;
//         host = host.replace(/:8787$/, ":3000");
//         return `${proto}://${host}`;
//       }

//       return "http://localhost:3000";
//     }

//     const webBase = resolveWebBase(req);
//     const url = new URL(`/r/${link.token}`, webBase).toString();

//     return res.status(200).json({ ok: true, url, token: link.token, projectId });
//   });
// };
