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
    // 1) Load project
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

    // -------------------------------------------------------------
    // 2) Authorisation
    //
    // NEW RULE:
    //   - Owner always allowed
    //   - Completed → ALL authenticated users allowed
    //   - Other statuses → only owner
    // -------------------------------------------------------------
    let allow = false;

    if (uid === project.ownerUserId) {
      allow = true;
    } else if (project.status === "completed") {
      allow = true; // community visibility; no postcode logic
    }

    if (!allow) {
      log.warn("Forbidden: user not permitted to view closure photos");
      return res.status(403).json({ error: "Forbidden" });
    }

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
