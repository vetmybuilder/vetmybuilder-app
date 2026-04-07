// server/routes/admin/recommendation-leaderboard.get.js
// Debug leaderboard with all score ingredients.
// GET /api/admin/recommendation-leaderboard?projectId=123  -> project-scoped
// GET /api/admin/recommendation-leaderboard                -> GLOBAL (admin-only)
//
// Auth: required.

const { logger, withRequest } = require("../../lib/logger");
const {
  computeScore,
  ageInDays,
} = require("../../lib/recommendationScoring");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, extractLocationTokens } = ctx;
  const TAG = "admin.recommendationLeaderboard";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  /* ---------- helpers ---------- */
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const truthy = (v) =>
    v === 1 ||
    v === true ||
    String(v).toLowerCase() === "1" ||
    String(v).toLowerCase() === "true";

  // Check admin role or allowlisted email
  async function isAdmin(req) {
    const uid = req.user?.uid;
    if (!uid) return false;

    let role = "user";
    try {
      const rows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      const row = rows[0] || null;
      role = String(row?.role || "user").toLowerCase();
    } catch {}

    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const email = String(req.user?.email || "")
      .trim()
      .toLowerCase();

    return role === "admin" || allowlist.includes(email);
  }

  /* ---------- scoring ingredient helpers ---------- */

  async function likesFor(rid) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c FROM recommendation_votes WHERE recommendationId = ? AND value = 1`,
      [rid]
    );
    return Number(rows[0]?.c || 0);
  }

  async function recPhotoCount(rid) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c FROM recommendation_photos WHERE recommendationId = ?`,
      [rid]
    );
    return Number(rows[0]?.c || 0);
  }

  async function closuresWonCount(rid) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c FROM project_closures WHERE winnerRecommendationId = ?`,
      [rid]
    );
    return Number(rows[0]?.c || 0);
  }

  async function closuresWouldAgainCount(rid) {
    const rows = await mysqlQuery(
      `SELECT COUNT(*) AS c
         FROM project_closures
         WHERE winnerRecommendationId = ?
           AND COALESCE(wouldUseAgain, 0) = 1`,
      [rid]
    );
    return Number(rows[0]?.c || 0);
  }

  async function closurePhotoCountFor(rid) {
    const rows = await mysqlQuery(
      `
      SELECT COUNT(*) AS c
      FROM project_closure_photos cp
      JOIN project_closures c ON c.projectId = cp.projectId
      WHERE c.winnerRecommendationId = ?
      `,
      [rid]
    );
    return Number(rows[0]?.c || 0);
  }

  async function hireCountsFor(rid) {
    const rows = await mysqlQuery(
      `
      SELECT
        COUNT(*)                                           AS total,
        SUM(status = 'accepted')                            AS accepted,
        SUM(status = 'declined')                            AS declined,
        SUM(status IN ('pending','pending_invite'))        AS pending
      FROM hires
      WHERE recommendationId = ?
      `,
      [rid]
    );
    const r = rows[0] || {};
    return {
      total: Number(r.total || 0),
      accepted: Number(r.accepted || 0),
      declined: Number(r.declined || 0),
      pending: Number(r.pending || 0),
    };
  }

  async function companyVerification(rid) {
    const rows = await mysqlQuery(
      `
      SELECT status, score, companyNumber, companyName, checkedAt
      FROM company_verifications
      WHERE recommendationId = ?
      ORDER BY COALESCE(checkedAt,'') DESC, id DESC
      LIMIT 1
      `,
      [rid]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      status: String(r.status || ""),
      score: r.score == null ? null : Number(r.score),
      companyNumber: r.companyNumber || null,
      companyName: r.companyName || null,
      checkedAt: r.checkedAt || null,
    };
  }

  // computeScore + ageInDays now live in server/lib/recommendationScoring.js
  // (imported at the top of this file). Keeps the route thin and the
  // scoring logic unit-testable in isolation.

  /* ---------- shared helpers ---------- */

  const normalizeKey = (s) =>
    String(s || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const projTokCache = new Map();

  async function getProjectTokens(projectId) {
    if (!projectId) return {};
    if (projTokCache.has(projectId)) return projTokCache.get(projectId);

    const rows = await mysqlQuery(
      `SELECT location FROM projects WHERE id = ? LIMIT 1`,
      [projectId]
    );
    const loc = rows[0]?.location || "";
    const tok = extractLocationTokens?.(loc) || {};

    projTokCache.set(projectId, tok);
    return tok;
  }

  async function fromCommunityFlag(projectId, recommenderUserId) {
    if (!projectId || !recommenderUserId) return 0;

    const tokens = await getProjectTokens(projectId);

    const rows = await mysqlQuery(
      `
      SELECT postcode, postcodeSector, postcodeOutward, city
      FROM users
      WHERE uid = ?
      LIMIT 1
      `,
      [recommenderUserId]
    );
    const u = rows[0] || null;

    return Number(
      (tokens.full && u?.postcode === tokens.full) ||
        (tokens.sector && u?.postcodeSector === tokens.sector) ||
        (tokens.outward && u?.postcodeOutward === tokens.outward) ||
        (tokens.city &&
          u?.city &&
          String(u.city).toLowerCase() ===
            String(tokens.city || "").toLowerCase())
    );
  }

  /* ---------- ROUTE ---------- */

  router.get("/admin/recommendation-leaderboard", auth, async (req, res) => {
    const log = withRequest(req).child({ route: TAG });

    try {
      const projectId = toNum(req.query.projectId);

      /* ===============================
       *   GLOBAL MODE (admin-only)
       * =============================== */
      if (!projectId) {
        if (!(await isAdmin(req))) {
          log.warn("Forbidden: non-admin attempted global leaderboard access");
          return res.status(403).json({ error: "Admin access required" });
        }

        const recs = await mysqlQuery(`
          SELECT
            r.id,
            r.projectId,
            r.company,
            r.name,
            r.email,
            r.phone,
            r.comment,
            r.isAnonymous,
            r.createdAt,
            r.source,
            r.recommenderUserId
          FROM recommendations r
        `);

        if (!Array.isArray(recs) || recs.length === 0) {
          return res.json({ items: [], total: 0 });
        }

        const buckets = new Map();

        for (const r of recs) {
          const [
            likes,
            recPhotos,
            wins,
            compPhotos,
            wouldAgain,
            ch,
            fromCommunity,
            hires,
          ] = await Promise.all([
            likesFor(r.id),
            recPhotoCount(r.id),
            closuresWonCount(r.id),
            closurePhotoCountFor(r.id),
            closuresWouldAgainCount(r.id),
            companyVerification(r.id),
            fromCommunityFlag(r.projectId, r.recommenderUserId),
            hireCountsFor(r.id),
          ]);

          const fromFriend =
            String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0;

          const ageDays = ageInDays(r.createdAt);

          const score = computeScore({
            fromFriend,
            fromCommunity,
            likes,
            wins,
            recPhotos,
            completionPhotos: compPhotos,
            wouldAgain,
            ch,
            hiresAccepted: hires.accepted,
            hiresDeclined: hires.declined,
            ageDays,
          });

          const row = {
            id: r.id,
            projectId: r.projectId,
            company: r.company,
            name: r.name,
            createdAt: r.createdAt,
            ageDays,
            fromFriend,
            fromCommunity,
            likes,
            recPhotos,
            completionWins: wins,
            completionPhotos: compPhotos,
            legacyWins: 0,
            wouldAgain,
            chStatus: ch?.status || null,
            chScore: ch?.score ?? null,
            chCompanyNumber: ch?.companyNumber || null,
            chCompanyName: ch?.companyName || null,
            hires,
            score,
          };

          const identityName = row.chCompanyName || row.company || "";
          const key = row.chCompanyNumber
            ? `#${row.chCompanyNumber}`
            : `n:${normalizeKey(identityName)}`;

          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = {
              key,
              company: identityName || row.company || "—",
              companyNumber: row.chCompanyNumber || null,
              items: [],
            };
            buckets.set(key, bucket);
          } else {
            if (row.chCompanyName && bucket.company !== row.chCompanyName) {
              bucket.company = row.chCompanyName;
            }
            if (!bucket.companyNumber && row.chCompanyNumber) {
              bucket.companyNumber = row.chCompanyNumber;
            }
          }

          bucket.items.push(row);
        }

        const pickTop = (arr) =>
          [...arr].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.likes !== a.likes) return b.likes - a.likes;
            return (
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          })[0];

        const collapsed = [];
        for (const bucket of buckets.values()) {
          const top = pickTop(bucket.items);

          const aggLikes = bucket.items.reduce((s, it) => s + it.likes, 0);
          const aggRecPhotos = bucket.items.reduce(
            (s, it) => s + it.recPhotos,
            0
          );
          const aggCompPhotos = bucket.items.reduce(
            (s, it) => s + it.completionPhotos,
            0
          );
          const aggWins = bucket.items.reduce(
            (s, it) => s + it.completionWins,
            0
          );
          const aggWouldAgain = bucket.items.reduce(
            (s, it) => s + it.wouldAgain,
            0
          );
          const aggHires = bucket.items.reduce(
            (acc, it) => ({
              total: acc.total + (it.hires?.total || 0),
              accepted: acc.accepted + (it.hires?.accepted || 0),
              declined: acc.declined + (it.hires?.declined || 0),
              pending: acc.pending + (it.hires?.pending || 0),
            }),
            { total: 0, accepted: 0, declined: 0, pending: 0 }
          );

          // For the bucket's age, use the freshest recommendation in the
          // bucket — a builder with one recent rec and several old ones
          // shouldn't be punished by the old ones' decay.
          const freshestAgeDays = bucket.items.reduce(
            (min, it) => Math.min(min, it.ageDays ?? 0),
            Number.POSITIVE_INFINITY
          );

          const aggScore = computeScore({
            fromFriend: bucket.items.some((it) => truthy(it.fromFriend))
              ? 1
              : 0,
            fromCommunity: bucket.items.some((it) => truthy(it.fromCommunity))
              ? 1
              : 0,
            likes: aggLikes,
            wins: aggWins,
            recPhotos: aggRecPhotos,
            completionPhotos: aggCompPhotos,
            wouldAgain: aggWouldAgain,
            ch: { status: top.chStatus, score: top.chScore },
            hiresAccepted: aggHires.accepted,
            hiresDeclined: aggHires.declined,
            ageDays: Number.isFinite(freshestAgeDays) ? freshestAgeDays : 0,
          });

          collapsed.push({
            id: top.id,
            projectId: top.projectId,
            company: bucket.company,
            name: top.name,
            createdAt: top.createdAt,
            fromFriend: top.fromFriend,
            fromCommunity: top.fromCommunity,
            likes: aggLikes,
            recPhotos: aggRecPhotos + aggCompPhotos,
            completionWins: aggWins,
            completionPhotos: aggCompPhotos,
            legacyWins: 0,
            wouldAgain: aggWouldAgain,
            chStatus: top.chStatus,
            chScore: top.chScore,
            hires: aggHires,
            score: aggScore,
          });
        }

        collapsed.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.likes !== a.likes) return b.likes - a.likes;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

        log.info(
          { count: collapsed.length },
          "Global recommendation leaderboard generated"
        );

        return res.json({ items: collapsed, total: collapsed.length });
      }

      /* ===============================
       *   PROJECT MODE
       * =============================== */

      const projRows = await mysqlQuery(
        `
        SELECT ownerUserId, status, location
        FROM projects
        WHERE id = ?
        LIMIT 1
        `,
        [projectId]
      );
      const proj = projRows[0];

      if (!proj) {
        log.warn({ projectId }, "Project not found");
        return res.status(404).json({ error: "Project not found" });
      }

      const uid = req.user?.uid || null;
      const isOwner = uid && String(uid) === String(proj.ownerUserId);
      const isLive = String(proj.status || "").toLowerCase() === "live";

      if (!isOwner && !isLive) {
        log.warn(
          { projectId, uid },
          "Forbidden: user not owner and project not live"
        );
        return res.status(403).json({ error: "Forbidden" });
      }

      const tokens = extractLocationTokens?.(proj.location || "") || {};

      const rows = await mysqlQuery(
        `
        SELECT
          r.id,
          r.projectId,
          r.company,
          r.name,
          r.email,
          r.phone,
          r.comment,
          r.isAnonymous,
          r.createdAt,
          r.source,
          r.recommenderUserId
        FROM recommendations r
        WHERE r.projectId = ?
        `,
        [projectId]
      );

      async function fromCommunityFlagProject(r) {
        if (!r.recommenderUserId) return 0;

        const ur = await mysqlQuery(
          `
          SELECT postcode, postcodeSector, postcodeOutward, city
          FROM users
          WHERE uid = ?
          LIMIT 1
          `,
          [r.recommenderUserId]
        );
        const u = ur[0] || null;

        return Number(
          (tokens.full && u?.postcode === tokens.full) ||
            (tokens.sector && u?.postcodeSector === tokens.sector) ||
            (tokens.outward && u?.postcodeOutward === tokens.outward) ||
            (tokens.city &&
              u?.city &&
              String(u.city).toLowerCase() ===
                String(tokens.city || "").toLowerCase())
        );
      }

      const items = [];
      for (const r of rows) {
        const [
          likes,
          recPhotos,
          wins,
          compPhotos,
          wouldAgain,
          ch,
          fromCommunity,
          hires,
        ] = await Promise.all([
          likesFor(r.id),
          recPhotoCount(r.id),
          closuresWonCount(r.id),
          closurePhotoCountFor(r.id),
          closuresWouldAgainCount(r.id),
          companyVerification(r.id),
          fromCommunityFlagProject(r),
          hireCountsFor(r.id),
        ]);

        const fromFriend =
          String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0;

        const ageDays = ageInDays(r.createdAt);

        const score = computeScore({
          fromFriend,
          fromCommunity,
          likes,
          wins,
          recPhotos,
          completionPhotos: compPhotos,
          wouldAgain,
          ch,
          hiresAccepted: hires.accepted,
          hiresDeclined: hires.declined,
          ageDays,
        });

        items.push({
          id: r.id,
          projectId: r.projectId,
          company: r.company,
          name: r.name,
          createdAt: r.createdAt,
          fromFriend,
          fromCommunity,
          likes,
          recPhotos,
          completionWins: wins,
          completionPhotos: compPhotos,
          legacyWins: 0,
          wouldAgain,
          chStatus: ch?.status || null,
          chScore: ch?.score ?? null,
          hires,
          score,
        });
      }

      items.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.likes !== a.likes) return b.likes - a.likes;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      log.info(
        { projectId, count: items.length },
        "Project leaderboard generated"
      );

      return res.json({ items, total: items.length });
    } catch (err) {
      logger.error(
        {
          err: err?.message,
          stack: err?.stack,
        },
        `${TAG} failed`
      );

      return res.status(500).json({ error: "Failed" });
    }
  });
};
