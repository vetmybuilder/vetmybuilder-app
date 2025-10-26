// server/routes/projects/close.post.js
/**
 * POST /api/projects/:id/close   (router path here is "/projects/:id/close")
 * Auth: owner only
 * Body:
 *  {
 *    didGoAhead: boolean,
 *    reasons?: string[],
 *    otherReason?: string,
 *    selectedRecommendationId?: number,
 *    winnerFromCommunity?: boolean | 0 | 1 | "0" | "1" | "true" | "false",
 *    wouldUseAgain?: boolean | 0 | 1 | "0" | "1" | "true" | "false" | null
 *  }
 *
 * Rules:
 *  - didGoAhead === true:
 *      • winnerFromCommunity truthy -> status='completed', completedAt=now
 *      • otherwise                  -> status='archived',  archivedAt=now
 *  - didGoAhead === false            -> status='archived',  archivedAt=now
 *
 * Also upserts project_closures (manual upsert) including wouldUseAgain.
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  // --- Ensure projects table has columns used by this route (SQLite-safe, idempotent) ---
  (function ensureProjectsTimestamps() {
    try {
      const cols = db
        .prepare("PRAGMA table_info(projects)")
        .all()
        .map((c) => c.name);
      const tx = db.transaction(() => {
        if (!cols.includes("archivedAt")) {
          db.prepare("ALTER TABLE projects ADD COLUMN archivedAt TEXT").run();
        }
        if (!cols.includes("completedAt")) {
          db.prepare("ALTER TABLE projects ADD COLUMN completedAt TEXT").run();
        }
      });
      tx();
    } catch (e) {
      // non-fatal in test env; logs to aid debugging
      console.warn("ensureProjectsTimestamps failed:", e?.message || e);
    }
  })();

  // NOTE: router is mounted under /api, so do NOT prefix with /api here
  router.post("/projects/:id/close", auth, (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return res.status(400).json({ error: "Invalid id" });

      const current = db
        .prepare("SELECT id, ownerUserId, status FROM projects WHERE id=?")
        .get(id);
      if (!current) return res.status(404).json({ error: "Not found" });
      if (current.ownerUserId !== req.user.uid)
        return res.status(403).json({ error: "Forbidden" });

      const {
        didGoAhead,
        reasons,
        otherReason,
        selectedRecommendationId,
        winnerFromCommunity,
        wouldUseAgain,
      } = req.body || {};

      const did = !!didGoAhead;

      // Normalize reasons
      const allowed = new Set([
        "budget",
        "no_show",
        "quote_too_high",
        "other",
        "tradesman_unavailable",
      ]);
      const reasonsJson = JSON.stringify(
        Array.isArray(reasons)
          ? reasons.filter((r) => allowed.has(String(r)))
          : []
      );

      const now = new Date().toISOString();

      // Winner info (provided by client; avoids schema coupling)
      const winnerId =
        Number.isFinite(Number(selectedRecommendationId)) &&
        Number(selectedRecommendationId) > 0
          ? Number(selectedRecommendationId)
          : null;

      const winnerFromCommunityNum =
        winnerFromCommunity === 1 ||
        winnerFromCommunity === "1" ||
        winnerFromCommunity === true ||
        winnerFromCommunity === "true"
          ? 1
          : 0;

      // Normalize wouldUseAgain -> null|0|1
      let wouldUseAgainNorm = null;
      if (
        wouldUseAgain === 0 ||
        wouldUseAgain === "0" ||
        wouldUseAgain === false ||
        wouldUseAgain === "false"
      ) {
        wouldUseAgainNorm = 0;
      } else if (
        wouldUseAgain === 1 ||
        wouldUseAgain === "1" ||
        wouldUseAgain === true ||
        wouldUseAgain === "true"
      ) {
        wouldUseAgainNorm = 1;
      } else {
        wouldUseAgainNorm = null; // absent/unknown
      }

      // ---- Status transitions (guarantee completedAt when completed) ----
      if (!did) {
        db.prepare(
          `UPDATE projects
             SET status='archived', archivedAt=?, completedAt=completedAt
           WHERE id=?`
        ).run(now, id);
      } else if (winnerFromCommunityNum === 1) {
        db.prepare(
          `UPDATE projects
             SET status='completed',
                 completedAt=COALESCE(completedAt, ?),
                 archivedAt=archivedAt
           WHERE id=?`
        ).run(now, id);
      } else {
        db.prepare(
          `UPDATE projects
             SET status='archived', archivedAt=?, completedAt=completedAt
           WHERE id=?`
        ).run(now, id);
      }

      // Manual upsert into project_closures (now includes wouldUseAgain)
      const exists = db
        .prepare(
          "SELECT projectId FROM project_closures WHERE projectId = ? LIMIT 1"
        )
        .get(id);

      if (exists) {
        db.prepare(
          `UPDATE project_closures
              SET didGoAhead=?,
                  reasons=?,
                  otherReason=?,
                  winnerRecommendationId=?,
                  wouldUseAgain=?,
                  createdBy=?,
                  createdAt=?
            WHERE projectId=?`
        ).run(
          did ? 1 : 0,
          reasonsJson,
          otherReason || null,
          winnerId || null,
          wouldUseAgainNorm,
          req.user.uid,
          now,
          id
        );
      } else {
        db.prepare(
          `INSERT INTO project_closures
              (projectId, didGoAhead, reasons, otherReason, winnerRecommendationId, wouldUseAgain, createdBy, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          did ? 1 : 0,
          reasonsJson,
          otherReason || null,
          winnerId || null,
          wouldUseAgainNorm,
          req.user.uid,
          now
        );
      }

      // Final safety: if row is completed but completedAt is NULL, backfill it now
      let project = db.prepare("SELECT * FROM projects WHERE id=?").get(id);
      if (project && project.status === "completed" && !project.completedAt) {
        db.prepare(`UPDATE projects SET completedAt=? WHERE id=?`).run(now, id);
        project = db.prepare("SELECT * FROM projects WHERE id=?").get(id);
      }

      return res.json({ ok: true, project });
    } catch (err) {
      console.error("close project error:", err);
      return res.status(500).json({
        error: "Internal error closing project",
        detail: String(err?.message || err),
      });
    }
  });
};
