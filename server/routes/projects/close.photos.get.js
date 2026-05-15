// server/routes/projects/close.photos.get.js
// GET /api/projects/:id/close/photos
// Returns: { photos: [{id,filePath,fileUrl,mime,sizeBytes,createdAt}] }

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const path = require("path");
  const fs = require("fs");

  const { logger, withRequest } = require("../../lib/logger");

  const uploadsRoot =
    ctx.UPLOAD_DIR || ctx.uploadsDir || path.join(process.cwd(), "uploads");

  /**
   * IMPORTANT:
   * Your static files are served at:
   *   http://<host>:<port>/uploads/...
   * NOT:
   *   http://<host>:<port>/api/uploads/...
   *
   * So we must build fileUrl WITHOUT "/api".
   *
   * Prefer:
   * - ctx.PUBLIC_BASE_URL (if you have it)
   * - NEXT_PUBLIC_SITE_URL / SITE_URL / PUBLIC_BASE_URL
   * - else fall back to request origin at runtime
   */
  const STATIC_BASE =
    ctx.PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "";

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

  function reqOrigin(req) {
    const proto =
      (req.headers["x-forwarded-proto"] || "")
        .toString()
        .split(",")[0]
        .trim() ||
      req.protocol ||
      "http";
    const host =
      (req.headers["x-forwarded-host"] || "").toString().split(",")[0].trim() ||
      req.headers.host ||
      "";
    if (!host) return "";
    return `${proto}://${host}`;
  }

  function joinBaseAndPath(base, p) {
    const b = String(base || "").replace(/\/+$/, "");
    const pathPart = String(p || "").startsWith("/") ? String(p) : `/${p}`;
    return `${b}${pathPart}`;
  }

  router.get("/projects/:id/close/photos", auth, async (req, res) => {
    const projectId = Number(req.params.id);
    const uid = req.user?.uid;

    const log = withRequest(req, logger).child({
      route: "/projects/:id/close/photos",
      action: "load_closure_photos",
      uid,
      projectId,
    });

    if (!Number.isFinite(projectId)) {
      log.warn("Invalid projectId");
      return res.status(400).json({ error: "Invalid id" });
    }

    // -------------------------------------------------------------
    // 1) Load project + closure row
    // -------------------------------------------------------------
    let project;
    try {
      const rows = await mysqlQuery(
        "SELECT id, ownerUserId, status FROM projects WHERE id = ?",
        [projectId]
      );
      project = rows[0] || null;
    } catch (err) {
      log.error({ err }, "MySQL error loading project");
      return res.status(500).json({ error: "internal_error" });
    }

    if (!project) {
      log.info("Project not found");
      return res.status(404).json({ error: "Not found" });
    }

    let closure = null;
    try {
      const rows = await mysqlQuery(
        `SELECT winner_tradesman_uid, boost_consent
           FROM project_closures
          WHERE projectId = ?
          ORDER BY id DESC
          LIMIT 1`,
        [projectId]
      );
      closure = rows[0] || null;
    } catch (err) {
      log.error({ err }, "MySQL error loading closure row");
      return res.status(500).json({ error: "internal_error" });
    }

    // -------------------------------------------------------------
    // 2) Authorisation
    //
    // Closure photos are sensitive. Visibility is now restricted to:
    //   (a) the project owner
    //   (b) the winning tradesperson on the closure
    //   (c) anyone, if the homeowner explicitly opted into the public
    //       boost via project_closures.boost_consent = 1
    //   (d) admin users
    // Everyone else gets a 403 (NOT 404 - the route is still real, the
    // owner needs it to keep working).
    // -------------------------------------------------------------
    let allow = false;
    let reason = "";

    if (uid && uid === project.ownerUserId) {
      allow = true;
      reason = "owner";
    } else if (closure && uid && uid === closure.winner_tradesman_uid) {
      allow = true;
      reason = "winning_tradesperson";
    } else if (closure && Number(closure.boost_consent) === 1) {
      allow = true;
      reason = "boost_consent_public";
    } else {
      // Admin escape hatch. We avoid wiring requireAdmin into the
      // middleware chain (it would 403 owners) and instead do a cheap
      // role lookup inline for this fall-through case only.
      try {
        const roleRows = await mysqlQuery(
          `SELECT role
             FROM user_roles
            WHERE uid = ?
              AND LOWER(role) = 'admin'
            LIMIT 1`,
          [uid]
        );
        if (roleRows && roleRows[0]) {
          allow = true;
          reason = "admin";
        }
      } catch (err) {
        log.warn({ err }, "admin role lookup failed");
      }

      // Env-allowlist admin (matches requireAdmin in server/lib/roles.js).
      if (!allow) {
        const email = String(req.user?.email || "").toLowerCase();
        const allowlist = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (email && allowlist.includes(email)) {
          allow = true;
          reason = "admin_allowlist";
        }
      }
    }

    if (!allow) {
      log.warn(
        { hasClosure: !!closure, boostConsent: closure?.boost_consent },
        "Forbidden: user not permitted to view closure photos"
      );
      return res.status(403).json({ error: "forbidden" });
    }

    log.info({ reason }, "Closure photo access granted");

    // -------------------------------------------------------------
    // 3) Load closure photos
    // -------------------------------------------------------------
    let rows;
    try {
      rows = await mysqlQuery(
        `SELECT id, filePath, mime, sizeBytes, createdAt
           FROM project_closure_photos
          WHERE projectId = ?
          ORDER BY id DESC`,
        [projectId]
      );
    } catch (err) {
      log.error({ err }, "MySQL error loading closure photos");
      return res.status(500).json({ error: "internal_error" });
    }

    // -------------------------------------------------------------
    // 4) Hydrate photo URLs and skip missing files
    // -------------------------------------------------------------
    const seen = new Set();
    const photos = [];

    // Decide base for absolute URLs (NO "/api")
    const base =
      /^https?:\/\//i.test(STATIC_BASE) && STATIC_BASE
        ? STATIC_BASE
        : reqOrigin(req);

    for (const r of rows) {
      const fp = String(r.filePath || "");

      // R2 / external URL — use directly without disk check
      if (/^https?:\/\//i.test(fp)) {
        if (seen.has(fp)) continue;
        seen.add(fp);
        photos.push({ ...r, filePath: fp, fileUrl: fp });
        continue;
      }

      // Local disk file
      const browserPath = normalizeUploadPath(fp);
      if (!browserPath) continue;

      const abs = toAbsDiskPath(browserPath);
      if (!fs.existsSync(abs)) {
        log.warn({ path: abs }, "Skipping orphaned photo file");
        continue;
      }

      if (seen.has(browserPath)) continue;
      seen.add(browserPath);

      const fileUrl = base ? joinBaseAndPath(base, browserPath) : browserPath;

      photos.push({
        ...r,
        filePath: browserPath,
        fileUrl,
      });
    }

    log.info({ count: photos.length }, "Returning closure photos");

    return res.json({ photos });
  });
};
