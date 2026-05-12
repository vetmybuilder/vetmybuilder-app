// server/routes/admin/cleanup.js
//
// Admin maintenance endpoints. Each operation is single-purpose and
// surfaces a precise count BEFORE it mutates so the admin UI can show
// "X rows will be deleted" rather than a vague "Purge".
//
// Routes mounted here:
//
//   GET  /api/admin/cleanup/preview
//        → counts for each operation, no mutation
//
//   POST /api/admin/cleanup/notifications/purge-by-type
//        body { type: string }            → DELETE notifications WHERE type=?
//
//   POST /api/admin/cleanup/notifications/rewrite-linkpaths
//        no body                          → rewrite legacy /projects/X?openChat=Y → /chat/Y
//
//   POST /api/admin/cleanup/notifications/purge-older-than
//        body { days: number, type?: string }
//                                          → DELETE notifications older than N days, optional type filter
//
//   POST /api/admin/cleanup/notifications/purge-closed-projects
//        no body                           → DELETE owner-side notifications for completed projects
//                                            (one-off backfill for jobs closed BEFORE the
//                                            close-time DELETE was added on 2026-05-12)

const { requireAdmin } = require("../../lib/roles");

// Whitelist of `type` values purge-by-type will accept. Stops a typo from
// nuking the wrong column. Extend as new deprecated types appear.
const PURGEABLE_TYPES = new Set([
  "project_live_local",
  // Add more here as we deprecate notification types.
]);

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  const log = ctx.log || console;
  const TAG = "[admin/cleanup]";
  const adminGuard = requireAdmin(ctx);

  // ============ PREVIEW ============
  router.get(
    "/admin/cleanup/preview",
    auth,
    adminGuard,
    async (_req, res) => {
      try {
        // Deprecated notification types
        const typeCounts = {};
        for (const t of PURGEABLE_TYPES) {
          const rows = await mysqlQuery(
            "SELECT COUNT(*) AS c FROM notifications WHERE type = ?",
            [t],
          );
          typeCounts[t] = Number(rows?.[0]?.c) || 0;
        }

        // Legacy linkPath shape (/projects/X?openChat=Y)
        const legacyRows = await mysqlQuery(
          "SELECT COUNT(*) AS c FROM notifications WHERE linkPath LIKE '/projects/%?openChat=%'",
        );
        const legacyLinkPaths = Number(legacyRows?.[0]?.c) || 0;

        // Age buckets
        const ageBuckets = {};
        for (const days of [30, 60, 90, 180]) {
          const rows = await mysqlQuery(
            "SELECT COUNT(*) AS c FROM notifications WHERE createdAt < DATE_SUB(NOW(), INTERVAL ? DAY)",
            [days],
          );
          ageBuckets[days] = Number(rows?.[0]?.c) || 0;
        }

        // Notifications still attached to completed projects, BOTH on the
        // owner side (where userId = the project owner) AND on the matched
        // tradesperson side (any builder with a matched swipe_interest row).
        // close.post.js wipes both groups on close going forward; this
        // count + button is the one-off backfill for historical rows.
        // We exclude `project_closed_local` because those belong to NEIGHBOURS
        // (not the owner or matched trades) and are the intentional "your
        // neighbour completed a job" feed entries.
        const closedOwnerRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
             FROM notifications n
             JOIN projects p ON p.id = n.projectId
            WHERE p.status = 'completed'
              AND n.userId = p.ownerUserId`,
        );
        const closedTradeRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
             FROM notifications n
             JOIN projects p ON p.id = n.projectId
             JOIN swipe_interest si ON si.project_id = p.id
                                   AND si.builder_uid = n.userId
                                   AND si.status = 'matched'
            WHERE p.status = 'completed'`,
        );
        const closedProjects =
          (Number(closedOwnerRows?.[0]?.c) || 0) +
          (Number(closedTradeRows?.[0]?.c) || 0);

        return res.json({
          ok: true,
          notifications: {
            byDeprecatedType: typeCounts,
            legacyLinkPaths,
            olderThan: ageBuckets,
            // Kept under the same key as before for backwards-compat with
            // the existing client - the value now covers both sides.
            closedProjectsForOwners: closedProjects,
          },
        });
      } catch (err) {
        log.error?.(`${TAG} preview failed`, { error: err?.message });
        return res.status(500).json({ ok: false, error: "preview_failed" });
      }
    },
  );

  // ============ PURGE BY TYPE ============
  router.post(
    "/admin/cleanup/notifications/purge-by-type",
    auth,
    adminGuard,
    async (req, res) => {
      const type = String(req.body?.type || "").trim();
      if (!type) {
        return res.status(400).json({ ok: false, error: "missing_type" });
      }
      if (!PURGEABLE_TYPES.has(type)) {
        // Strict allowlist - admin can't pass "all" or a wildcard. A
        // typo'd type is harmless because DELETE 0 rows is a no-op.
        return res.status(400).json({
          ok: false,
          error: "type_not_purgeable",
          allowed: Array.from(PURGEABLE_TYPES),
        });
      }

      try {
        const result = await mysqlQuery(
          "DELETE FROM notifications WHERE type = ?",
          [type],
        );
        const deleted = Number(result?.affectedRows) || 0;
        log.info?.(`${TAG} purged ${deleted} notifications`, {
          admin: req.user?.uid,
          type,
        });
        return res.json({ ok: true, deleted });
      } catch (err) {
        log.error?.(`${TAG} purge-by-type failed`, { error: err?.message });
        return res.status(500).json({ ok: false, error: "purge_failed" });
      }
    },
  );

  // ============ REWRITE LEGACY LINKPATHS ============
  router.post(
    "/admin/cleanup/notifications/rewrite-linkpaths",
    auth,
    adminGuard,
    async (req, res) => {
      try {
        const result = await mysqlQuery(
          `UPDATE notifications
              SET linkPath = CONCAT(
                '/chat/',
                SUBSTRING(linkPath, LOCATE('?openChat=', linkPath) + LENGTH('?openChat='))
              )
            WHERE linkPath LIKE '/projects/%?openChat=%'`,
        );
        const updated = Number(result?.affectedRows) || 0;
        log.info?.(`${TAG} rewrote ${updated} legacy linkPaths`, {
          admin: req.user?.uid,
        });
        return res.json({ ok: true, updated });
      } catch (err) {
        log.error?.(`${TAG} rewrite-linkpaths failed`, { error: err?.message });
        return res.status(500).json({ ok: false, error: "rewrite_failed" });
      }
    },
  );

  // ============ PURGE OLDER THAN N DAYS ============
  router.post(
    "/admin/cleanup/notifications/purge-older-than",
    auth,
    adminGuard,
    async (req, res) => {
      const days = Number(req.body?.days);
      const type = req.body?.type ? String(req.body.type).trim() : null;

      if (!Number.isFinite(days) || days < 7) {
        // 7-day minimum so an accidental click can't nuke the recent
        // activity feed.
        return res.status(400).json({
          ok: false,
          error: "min_7_days",
          message: "Use a value of 7 or more.",
        });
      }
      if (type && !PURGEABLE_TYPES.has(type)) {
        return res
          .status(400)
          .json({ ok: false, error: "type_not_purgeable" });
      }

      try {
        let result;
        if (type) {
          result = await mysqlQuery(
            "DELETE FROM notifications WHERE type = ? AND createdAt < DATE_SUB(NOW(), INTERVAL ? DAY)",
            [type, days],
          );
        } else {
          result = await mysqlQuery(
            "DELETE FROM notifications WHERE createdAt < DATE_SUB(NOW(), INTERVAL ? DAY)",
            [days],
          );
        }
        const deleted = Number(result?.affectedRows) || 0;
        log.info?.(`${TAG} purged ${deleted} notifications older than ${days}d`, {
          admin: req.user?.uid,
          type,
        });
        return res.json({ ok: true, deleted });
      } catch (err) {
        log.error?.(`${TAG} purge-older-than failed`, { error: err?.message });
        return res.status(500).json({ ok: false, error: "purge_failed" });
      }
    },
  );

  // ============ PURGE CLOSED-PROJECT NOTIFICATIONS ============
  // One-off backfill: deletes stale activity entries for any project
  // already in status='completed'. Forward-going closes handle this
  // automatically in close.post.js (DELETE + SSE refresh on both sides).
  //
  // Two passes, scoped narrowly so we don't accidentally nuke
  // `project_closed_local` rows that belong to neighbours:
  //   1. Owner-side: userId = the project owner.
  //   2. Tradesperson-side: userId = a builder with a matched
  //      swipe_interest on that project.
  router.post(
    "/admin/cleanup/notifications/purge-closed-projects",
    auth,
    adminGuard,
    async (req, res) => {
      try {
        const ownerResult = await mysqlQuery(
          `DELETE n FROM notifications n
             JOIN projects p ON p.id = n.projectId
            WHERE p.status = 'completed'
              AND n.userId = p.ownerUserId`,
        );
        const tradeResult = await mysqlQuery(
          `DELETE n FROM notifications n
             JOIN projects p ON p.id = n.projectId
             JOIN swipe_interest si ON si.project_id = p.id
                                   AND si.builder_uid = n.userId
                                   AND si.status = 'matched'
            WHERE p.status = 'completed'`,
        );
        const deleted =
          (Number(ownerResult?.affectedRows) || 0) +
          (Number(tradeResult?.affectedRows) || 0);
        log.info?.(
          `${TAG} purged ${deleted} notifications for completed projects (owners + matched trades)`,
          { admin: req.user?.uid },
        );
        return res.json({ ok: true, deleted });
      } catch (err) {
        log.error?.(`${TAG} purge-closed-projects failed`, {
          error: err?.message,
        });
        return res.status(500).json({ ok: false, error: "purge_failed" });
      }
    },
  );

  if (!ctx.__logged_admin_cleanup) {
    ctx.__logged_admin_cleanup = true;
    log.info?.(`[routes] mounted: /admin/cleanup/*`);
  }
};
