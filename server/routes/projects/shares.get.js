// server/routes/projects/shares.get.js

/**
 * GET /api/projects/:id/shares
 * Owner-only: list tradesmen who shared their profile for this project.
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery, PUBLIC_API_BASE = "" } = ctx;
  const TAG = "[projects.shares.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, "");
  const normUrl = (u) =>
    String(u || "").replace(/^\/api\/uploads\//, "/uploads/");
  const toAbs = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

  router.get("/projects/:id/shares", auth, async (req, res) => {
    try {
      const uid = req.user?.uid || req.user?.id || null;
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const pid = Number(req.params.id);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid project id" });
      }

      // Ensure project exists and caller is the owner
      const projects = await mysqlQuery(
        `SELECT id, ownerUserId FROM projects WHERE id = ? LIMIT 1`,
        [pid]
      );
      const project = projects[0];

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (String(project.ownerUserId || "") !== String(uid)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Load shares + basic tradesman info in one go
      const rows = await mysqlQuery(
        `
        SELECT
          s.id,
          s.project_id,
          s.tradesman_uid,
          s.photos_json,
          s.message,
          s.created_at,

          t.user_id        AS tm_user_id,
          t.company_name   AS tm_company_name,
          t.company_number AS tm_company_number,
          t.profile_slug   AS tm_profile_slug,
          t.contact_name   AS tm_contact_name
        FROM trade_shares AS s
        LEFT JOIN tradesmen AS t
          ON t.user_id = s.tradesman_uid
        WHERE s.project_id = ?
        ORDER BY s.created_at DESC, s.id DESC
        `,
        [pid]
      );

      const items = rows.map((r) => {
        // photos_json is stored as JSON text (or JSON column); normalise to array
        let photos = [];
        try {
          const raw =
            typeof r.photos_json === "string"
              ? r.photos_json
              : JSON.stringify(r.photos_json ?? []);
          const parsed = raw ? JSON.parse(raw) : [];
          photos = Array.isArray(parsed) ? parsed : [];
        } catch {
          photos = [];
        }

        // Normalise any legacy /api/uploads -> /uploads and ensure absoluteUrl
        photos = photos.map((p) => {
          const url = normUrl(
            p.url || (p.filename ? `/uploads/${p.filename}` : "")
          );
          const absoluteUrl =
            p.absoluteUrl && /^https?:\/\//i.test(p.absoluteUrl)
              ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
              : url
              ? toAbs(url)
              : "";

          return { ...p, url, absoluteUrl };
        });

        const tradesman = r.tm_user_id
          ? {
              id: null, // not needed for this endpoint
              user_id: r.tm_user_id,
              uid: r.tm_user_id,
              name: r.tm_contact_name || null,
              company: r.tm_company_name || null,
              company_number: r.tm_company_number || null,
              profile_slug: r.tm_profile_slug || null,
            }
          : null;

        return {
          id: r.id,
          projectId: r.project_id,
          tradesmanUid: r.tradesman_uid,
          photos,
          message: r.message || "",
          createdAt: r.created_at,
          tradesman,
        };
      });

      return res.json({ ok: true, items, total: items.length });
    } catch (e) {
      console.error(`${TAG} error`, e?.message || e);
      return res.status(500).json({ error: "Failed to load shares" });
    }
  });
};
