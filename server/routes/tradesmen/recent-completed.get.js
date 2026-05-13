// server/routes/tradesmen/recent-completed.get.js
//
// GET /api/tradesmen/:uid/recent-completed
//
// Returns the anonymised list of jobs where this tradesperson was the
// winner AND the homeowner ticked "Give them a boost" at close time
// (which doubles as consent for the closure photos to surface
// anonymously here).
//
// Powers two card surfaces on the homeowner swipe deck:
//   - Front: a "Top tradesperson" chip when items.length > 0.
//   - Back : an emerald "Recently completed in {area}" band; tapping
//     the band opens a lightbox showing the photos. The homeowner's
//     name, address and project ID are never returned — only project
//     type, area, photos and how long ago.
//
// Auth: required (the deck is a homeowner-only surface; we don't want
// random scrapers pulling completed-job photos by UID).

const PATH = "/tradesmen/:uid/recent-completed";

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  const log = ctx.log || console;

  router.get(PATH, auth, async (req, res) => {
    const targetUid = String(req.params.uid || "").trim();
    if (!targetUid) {
      return res.status(400).json({ error: "invalid_uid" });
    }

    res.set("Cache-Control", "no-store");

    try {
      // Boosted closures = project_closures rows where this trader was
      // the winner AND boost_consent = 1. Join the project for type +
      // location, and pull the closure photo paths.
      const rows = await mysqlQuery(
        `SELECT
            p.id            AS projectId,
            p.type          AS projectType,
            p.location      AS projectLocation,
            pc.createdAt    AS closedAt
           FROM project_closures pc
           JOIN projects p ON p.id = pc.projectId
          WHERE pc.boost_consent = 1
            AND pc.winner_tradesman_uid = ?
          ORDER BY pc.createdAt DESC
          LIMIT 20`,
        [targetUid],
      );

      if (rows.length === 0) {
        return res.json({ items: [], topTradesperson: false });
      }

      const projectIds = rows.map((r) => r.projectId);
      const placeholders = projectIds.map(() => "?").join(",");
      const photoRows = await mysqlQuery(
        `SELECT projectId, filePath
           FROM project_closure_photos
          WHERE projectId IN (${placeholders})`,
        projectIds,
      );

      const photosByProject = new Map();
      for (const row of photoRows) {
        const arr = photosByProject.get(row.projectId) || [];
        arr.push(toPublicPhotoUrl(row.filePath));
        photosByProject.set(row.projectId, arr);
      }

      // Strip the location to its outward code so we don't leak the
      // homeowner's full postcode. "E4 6AB" -> "E4".
      const items = rows.map((r) => ({
        projectType: r.projectType || null,
        area: outwardOnly(r.projectLocation),
        closedAt: r.closedAt || null,
        photos: photosByProject.get(r.projectId) || [],
      }));

      return res.json({
        items,
        topTradesperson: items.length > 0,
      });
    } catch (e) {
      log.error?.("[tradesmen/recent-completed] failed", {
        targetUid,
        error: e?.message,
      });
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

function outwardOnly(location) {
  const s = String(location || "").trim().toUpperCase();
  if (!s) return null;
  const m = s.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)/);
  return m ? m[1] : s;
}

function toPublicPhotoUrl(filePath) {
  const s = String(filePath || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return s;
  return `/uploads/${s}`;
}
