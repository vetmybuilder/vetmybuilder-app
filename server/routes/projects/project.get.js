//
// GET /api/projects/:id
//
// Visibility Rules:
//   • Anonymous → only LIVE projects visible (else 401)
//   • Authenticated → owner OR (live|completed). Others receive 404
//
// Logging: structured logger + withRequest
//

const { formatPostcode } = require("../../lib/location"); // ⭐ ensure this strips inward code

module.exports = (router, ctx) => {
  const { admin, touchUserMw, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  // Optional bearer auth
  function optionalAuth(adminInstance) {
    return async (req, _res, next) => {
      try {
        const h = req.headers?.authorization || "";
        if (h.startsWith("Bearer ")) {
          const token = h.slice(7);
          const decoded = await adminInstance.auth().verifyIdToken(token);
          req.user = {
            uid: decoded.uid,
            email: decoded.email || null,
          };
        }
      } catch {
        // ignore
      }
      next();
    };
  }

  router.get(
    "/projects/:id",
    optionalAuth(admin),
    touchUserMw,
    async (req, res) => {
      const projectId = Number(req.params.id);
      const log = withRequest(req, logger).child({
        route: "/projects/:id",
        projectId,
      });

      if (!Number.isFinite(projectId)) {
        log.warn("Invalid project ID");
        return res.status(400).json({ error: "invalid_project_id" });
      }

      // --------------------------------------------
      // Load project
      // --------------------------------------------
      let project;
      try {
        const rows = await mysqlQuery(
          `
          SELECT *
          FROM projects
          WHERE id = ?
        `,
          [projectId]
        );
        project = rows[0] || null;
      } catch (err) {
        log.error({ err }, "MySQL error while fetching project");
        return res.status(500).json({ error: "internal_error" });
      }

      if (!project) {
        log.info("Project not found");
        return res.status(404).json({ error: "not_found" });
      }

      const status = String(project.status || "").toLowerCase();
      const isLive = status === "live";
      const isCompleted = status === "completed";

      const viewerUid = req.user?.uid || null;
      const isOwner =
        viewerUid && String(project.ownerUserId) === String(viewerUid);

      // --------------------------------------------------
      // ⭐ ALWAYS SANITISE LOCATION BEFORE RETURNING
      // --------------------------------------------------
      try {
        project.location = formatPostcode(project.location);
      } catch {
        // fallback if helper fails
        project.location = String(project.location || "").trim();
      }

      // --------------------------------------------------
      // Anonymous viewer logic
      // --------------------------------------------------
      if (!viewerUid) {
        if (!isLive) {
          log.info("Anonymous viewer attempted non-live project");
          return res.status(401).json({ error: "missing_bearer_token" });
        }

        res.set("Cache-Control", "no-store");
        log.info("Anonymous viewer accessing live project");
        return res.json({ project });
      }

      // --------------------------------------------------
      // Authenticated viewer logic
      // Only owner OR (live|completed) users can see
      // All others → pretend it doesn't exist
      // --------------------------------------------------
      if (!isOwner && !isLive && !isCompleted) {
        log.info("Non-owner viewer blocked from non-visible project");
        return res.status(404).json({ error: "not_found" });
      }

      res.set("Cache-Control", "no-store");
      log.info("Authenticated viewer accessing project", {
        isOwner,
        status,
      });

      return res.json({ project });
    }
  );
};
