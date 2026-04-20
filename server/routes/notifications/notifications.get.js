// server/routes/notifications/notifications.get.js
/**
 * GET /api/notifications
 * Auth: required
 * Query: ?limit=  ?grouped=1
 * Response (ungrouped): { items, unread }
 * Response (grouped):   { groups, ungrouped, unread }
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  function parseLimit(v, def = 50, min = 1, max = 500) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  router.get("/notifications", auth, async (req, res) => {
    const log = withRequest(req, logger).child({
      route: "GET /api/notifications",
    });

    const uid = req.user.uid;
    const grouped = req.query.grouped === "1";
    const limit = parseLimit(req.query.limit, 50);

    log.debug({ uid, limit, grouped }, "Fetching notifications");

    try {
      if (grouped) {
        // Fetch all notifications for the last 30 days with project info via LEFT JOIN.
        // Exclude notifications that belong to completed/archived projects (but keep
        // notifications that have no projectId — those go into the ungrouped array).
        // Hide notifications for the user's OWN closed projects.
        // Keep notifications about OTHER people's projects (e.g. project_closed_local).
        const rows = await mysqlQuery(
          `SELECT n.id, n.type, n.message, n.projectId, n.linkPath, n.createdAt, n.readAt,
                  p.name AS projectName, p.status AS projectStatus
             FROM notifications n
             LEFT JOIN projects p ON p.id = n.projectId
            WHERE n.userId = ?
              AND n.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND NOT (p.ownerUserId = ? AND p.status IN ('completed', 'archived'))
            ORDER BY n.createdAt DESC`,
          [uid, uid]
        );

        // Count unread (same filter — exclude own closed projects)
        const unreadRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
             FROM notifications n
             LEFT JOIN projects p ON p.id = n.projectId
            WHERE n.userId = ?
              AND n.readAt IS NULL
              AND n.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND NOT (p.ownerUserId = ? AND p.status IN ('completed', 'archived'))`,
          [uid, uid]
        );
        const unread = unreadRows[0]?.c || 0;

        // Partition rows into project groups and ungrouped
        const groupMap = new Map(); // projectId (string) → group accumulator
        const ungrouped = [];

        for (const row of rows) {
          if (row.projectId == null) {
            ungrouped.push(row);
            continue;
          }

          const key = String(row.projectId);
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              projectId: row.projectId,
              projectName: row.projectName || null,
              projectStatus: row.projectStatus || null,
              unread: 0,
              total: 0,
              latest: row.createdAt,
              summary: {},
              items: [],
            });
          }

          const group = groupMap.get(key);
          group.total += 1;
          if (row.readAt == null) group.unread += 1;
          if (row.createdAt > group.latest) group.latest = row.createdAt;
          group.summary[row.type] = (group.summary[row.type] || 0) + 1;
          group.items.push(row);
        }

        // Sort groups by latest notification descending
        const groups = Array.from(groupMap.values()).sort(
          (a, b) => new Date(b.latest) - new Date(a.latest)
        );

        log.info(
          { uid, groups: groups.length, ungrouped: ungrouped.length, unread },
          "Grouped notifications fetched successfully"
        );

        return res.json({ groups, ungrouped, unread });
      }

      // ── Non-grouped (existing) path ──────────────────────────────────────
      // Fetch notifications (LIMIT is safe because it's clamped)
      const items = await mysqlQuery(
        `SELECT id, type, message, projectId, linkPath, createdAt, readAt
           FROM notifications
          WHERE userId = ?
            AND createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
          ORDER BY createdAt DESC
          LIMIT ${limit}`,
        [uid]
      );

      const unreadRows = await mysqlQuery(
        `SELECT COUNT(*) AS c
           FROM notifications n
           LEFT JOIN projects p ON p.id = n.projectId
          WHERE n.userId = ?
            AND n.readAt IS NULL
            AND n.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
            AND NOT (p.ownerUserId = ? AND p.status IN ('completed', 'archived'))`,
        [uid, uid]
      );

      const unread = unreadRows[0]?.c || 0;

      log.info(
        { uid, count: items.length, unread },
        "Notifications fetched successfully"
      );

      return res.json({ items, unread });
    } catch (err) {
      log.error(
        {
          uid,
          errMsg: err?.message,
          stack: err?.stack,
        },
        "Error fetching notifications"
      );

      return res.status(500).json({ error: "internal_error" });
    }
  });
};
