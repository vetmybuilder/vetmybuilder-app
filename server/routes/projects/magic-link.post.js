// server/routes/projects/magic-link.post.js
/**
 * POST /api/projects/:id/magic-link
 * Auth: required (owner only)
 * Requires project.status === 'live'
 *
 * Optional: ?rotate=1 or body.rotate=1 to force a new token.
 * Response: { ok: true, url, token, projectId }
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const crypto = require("node:crypto");
  const { logger, withRequest } = require("../../lib/logger");

  router.post("/projects/:id/magic-link", auth, async (req, res) => {
    const uid = req.user?.uid;
    const projectId = Number(req.params.id);

    const log = withRequest(req, logger).child({
      route: "/projects/:id/magic-link",
      action: "magic_link_generate",
      uid,
      projectId,
    });

    try {
      // ---------------------------------------------------------
      // 1. Validate projectId
      // ---------------------------------------------------------
      if (!Number.isFinite(projectId)) {
        log.warn("Invalid project id");
        return res.status(400).json({ error: "invalid_id" });
      }

      // ---------------------------------------------------------
      // 2. Fetch project + ownership check
      // ---------------------------------------------------------
      let project;
      try {
        const rows = await mysqlQuery(
          `SELECT id, ownerUserId, status
             FROM projects
            WHERE id = ?`,
          [projectId]
        );
        project = rows[0] || null;
      } catch (err) {
        log.error({ err }, "MySQL error fetching project");
        return res.status(500).json({ error: "internal_error" });
      }

      if (!project) {
        log.info("Project not found");
        return res.status(404).json({ error: "not_found" });
      }

      if (String(project.ownerUserId) !== String(uid)) {
        log.warn("Forbidden - user not project owner");
        return res.status(403).json({ error: "forbidden" });
      }

      if (String(project.status || "").toLowerCase() !== "live") {
        log.warn("Project must be live before inviting recommendations");
        return res.status(400).json({
          error: "project_not_live",
          message: "Project must be live before inviting recommendations.",
        });
      }

      // ---------------------------------------------------------
      // 3. Determine rotation
      // ---------------------------------------------------------
      const rotate =
        String(req.query.rotate || "").toLowerCase() === "1" ||
        String(req.body?.rotate || "").toLowerCase() === "1";

      // ---------------------------------------------------------
      // 4. Fetch latest recommendation link (if exists)
      // ---------------------------------------------------------
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
        log.error({ err }, "MySQL error fetching recommendation_links");
        return res.status(500).json({ error: "internal_error" });
      }

      // ---------------------------------------------------------
      // 5. Create or rotate token
      // ---------------------------------------------------------
      try {
        if (!link) {
          // Create new token
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

          log.info({ token: link?.token }, "Magic link created");
        } else if (rotate) {
          // Rotate token
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
              WHERE id = ?
              LIMIT 1`,
            [link.id]
          );
          link = linkRows[0] || null;

          log.info({ token: link?.token }, "Magic link rotated");
        } else {
          log.info({ token: link?.token }, "Magic link reused");
        }
      } catch (err) {
        log.error({ err }, "MySQL error creating/rotating magic link");
        return res.status(500).json({ error: "internal_error" });
      }

      if (!link) {
        log.error("Link was unexpectedly null");
        return res.status(500).json({ error: "internal_error" });
      }

      // ---------------------------------------------------------
      // 6. Build public WEB URL
      // ---------------------------------------------------------
      function resolveWebBase(req) {
        // Explicit environment override
        const explicit =
          process.env.WEB_PUBLIC_BASE || process.env.NEXT_PUBLIC_WEB_BASE;

        if (explicit) return String(explicit).replace(/\/+$/, "");

        // Production auto-detection
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

          // For Cloudflare / GCP environment port normalization
          host = host.replace(/:8787$/, ":3000");

          return `${proto}://${host}`;
        }

        // Local development
        return "http://localhost:3000";
      }

      const webBase = resolveWebBase(req);
      const url = new URL(`/r/${link.token}`, webBase).toString();

      log.info({ url, token: link.token }, "Magic link returned");

      res.json({
        ok: true,
        url,
        token: link.token,
        projectId,
      });
      ctx.logActivity("project.magic-link", "info", req.user?.uid, `Magic link created for project #${projectId}`);
      return;
    } catch (err) {
      log.error({ err }, "Unexpected magic-link error");
      return res.status(500).json({
        error: "unexpected_failure",
        detail: err?.message || String(err),
      });
    }
  });
};
