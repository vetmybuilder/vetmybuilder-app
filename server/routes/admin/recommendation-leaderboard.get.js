// server/routes/admin/recommendation-leaderboard.get.js
// Debug leaderboard with all score ingredients.
// GET /api/admin/recommendation-leaderboard?projectId=123  -> project-scoped (owner or project is live)
// GET /api/admin/recommendation-leaderboard                -> GLOBAL (admin-only)
//
// Auth: requires sign-in.
// Response: { items: [...], total }

module.exports = (router, ctx) => {
  const { db, auth, extractLocationTokens } = ctx;

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

  // Mirror requireAdmin check (role OR allow-listed email)
  function isAdmin(req) {
    const uid = req.user?.uid;
    if (!uid) return false;

    const roleRow =
      db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid) || null;
    const role = String(roleRow?.role || "user").toLowerCase();

    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = String(req.user?.email || "")
      .trim()
      .toLowerCase();
    const isAllowlisted = email && allowlist.includes(email);

    return role === "admin" || isAllowlisted;
  }

  // ---- per-recommendation ingredients (table names match your DB) ----
  const likesFor = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM recommendation_votes
            WHERE recommendationId=? AND value=1`
        )
        .get(rid)?.c || 0
    );

  const recPhotoCount = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM recommendation_photos
            WHERE recommendationId=?`
        )
        .get(rid)?.c || 0
    );

  // Number of closures where this recommendation is the winner
  const closuresWonCount = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM project_closures
            WHERE winnerRecommendationId=?`
        )
        .get(rid)?.c || 0
    );

  // Would hire again from closures
  const closuresWouldAgainCount = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM project_closures
            WHERE winnerRecommendationId=? AND COALESCE(wouldUseAgain,0)=1`
        )
        .get(rid)?.c || 0
    );

  // Photos attached to closures for projects this rec won
  const closurePhotoCountFor = (rid) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM project_closure_photos cp
             JOIN project_closures c ON c.projectId = cp.projectId
            WHERE c.winnerRecommendationId=?`
        )
        .get(rid)?.c || 0
    );

  const companyVerification = (rid) => {
    const row = db
      .prepare(
        `SELECT status, score, companyNumber, companyName, checkedAt
           FROM company_verifications
          WHERE recommendationId=?
          ORDER BY COALESCE(checkedAt,'') DESC, id DESC
          LIMIT 1`
      )
      .get(rid);
    if (!row) return null;
    return {
      status: String(row.status || ""),
      score: row.score == null ? null : Number(row.score),
      companyNumber: row.companyNumber || null,
      companyName: row.companyName || null,
      checkedAt: row.checkedAt || null,
    };
  };

  // --- your scoring formula (unchanged) ---
  function computeScore({
    isRecommended,
    fromFriend,
    fromCommunity,
    likes,
    wins,
    recPhotos,
    completionPhotos,
    wouldAgain,
    ch,
  }) {
    let s = 0;
    s += isRecommended ? 1.0 : 0;
    if (fromFriend) s += 0.2;
    if (fromCommunity) s += 0.4;
    s += Math.min(4, Math.log2(1 + wins)) * 0.8;
    s += Math.min(4, Math.log2(1 + likes)) * 0.5;
    if (recPhotos > 0) s += Math.min(3, Math.log2(1 + recPhotos)) * 0.35;
    if (completionPhotos > 0)
      s += Math.min(3, Math.log2(1 + completionPhotos)) * 0.25;
    s += wouldAgain * 0.7;
    if (ch) {
      const st = String(ch.status || "").toLowerCase();
      if (st === "verified") s += 0.6;
      else if (st === "ambiguous") s += 0.15;
      if (Number.isFinite(ch.score))
        s += Math.min(0.5, (Number(ch.score) / 100) * 0.5);
    }
    return Math.round(s * 20) / 20;
  }

  // Name normalization when no CH number
  const normalizeKey = (s) =>
    String(s || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Cache tokens per project for community check (global mode)
  const projTokCache = new Map();
  function getProjectTokens(projectId) {
    if (!projectId) return {};
    if (projTokCache.has(projectId)) return projTokCache.get(projectId);
    const p = db
      .prepare(`SELECT location FROM projects WHERE id=?`)
      .get(projectId);
    const tok = extractLocationTokens?.(p?.location || "") || {};
    projTokCache.set(projectId, tok);
    return tok;
  }

  function fromCommunityFlag(projectId, recommenderUserId) {
    if (!projectId || !recommenderUserId) return 0;
    const pTok = getProjectTokens(projectId);
    const u = db
      .prepare(
        `SELECT postcode, postcodeSector, postcodeOutward, city
           FROM users
          WHERE uid=?`
      )
      .get(recommenderUserId);
    return Number(
      (pTok.full && u?.postcode === pTok.full) ||
        (pTok.sector && u?.postcodeSector === pTok.sector) ||
        (pTok.outward && u?.postcodeOutward === pTok.outward) ||
        (pTok.city &&
          u?.city &&
          String(u.city).toLowerCase() ===
            String(pTok.city || "").toLowerCase())
    );
  }

  /* ---------- ROUTE ---------- */
  router.get("/admin/recommendation-leaderboard", auth, (req, res) => {
    try {
      const projectId = toNum(req.query.projectId);

      // ===== GLOBAL MODE (admin-only) =====
      if (!projectId) {
        if (!isAdmin(req)) {
          return res.status(403).json({ error: "Admin access required" });
        }

        const recs = db
          .prepare(
            `SELECT
               r.id, r.projectId, r.company, r.name, r.email, r.phone, r.comment,
               r.isAnonymous, r.createdAt, r.source, r.recommenderUserId
             FROM recommendations r`
          )
          .all();

        if (!Array.isArray(recs) || recs.length === 0) {
          return res.json({ items: [], total: 0 });
        }

        // Collapse by identity (CH number -> canonical; else normalized name)
        const buckets = new Map(); // key -> { company, companyNumber?, items: Row[] }

        for (const r of recs) {
          const likes = likesFor(r.id);
          const recPhotos = recPhotoCount(r.id);
          const wins = closuresWonCount(r.id);
          const compPhotos = closurePhotoCountFor(r.id);
          const wouldAgain = closuresWouldAgainCount(r.id);
          const ch = companyVerification(r.id);

          const fromFriend =
            String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0;
          const fromCommunity = fromCommunityFlag(
            r.projectId,
            r.recommenderUserId
          );

          const score = computeScore({
            isRecommended: 1,
            fromFriend,
            fromCommunity,
            likes,
            wins,
            recPhotos,
            completionPhotos: compPhotos,
            wouldAgain,
            ch,
          });

          const row = {
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
            legacyWins: 0, // no legacy table in this schema
            wouldAgain,
            chStatus: ch?.status || null,
            chScore: ch?.score ?? null,
            chCompanyNumber: ch?.companyNumber || null,
            chCompanyName: ch?.companyName || null,
            score,
          };

          const identityName = row.chCompanyName || row.company || "";
          const identityKey = row.chCompanyNumber
            ? `#${row.chCompanyNumber}`
            : `n:${normalizeKey(identityName)}`;

          let bucket = buckets.get(identityKey);
          if (!bucket) {
            bucket = {
              key: identityKey,
              company: identityName || row.company || "—",
              companyNumber: row.chCompanyNumber || null,
              items: [],
            };
            buckets.set(identityKey, bucket);
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
        for (const b of buckets.values()) {
          const top = pickTop(b.items);

          const aggLikes = b.items.reduce((s, it) => s + (it.likes || 0), 0);
          const aggRecPhotos = b.items.reduce(
            (s, it) => s + (it.recPhotos || 0),
            0
          );
          const aggCompPhotos = b.items.reduce(
            (s, it) => s + (it.completionPhotos || 0),
            0
          );
          const aggWins = b.items.reduce(
            (s, it) => s + (it.completionWins || 0),
            0
          );
          const aggWouldAgain = b.items.reduce(
            (s, it) => s + (it.wouldAgain || 0),
            0
          );

          const aggScore = computeScore({
            isRecommended: 1,
            fromFriend: b.items.some((it) => truthy(it.fromFriend)) ? 1 : 0,
            fromCommunity: b.items.some((it) => truthy(it.fromCommunity))
              ? 1
              : 0,
            likes: aggLikes,
            wins: aggWins,
            recPhotos: aggRecPhotos,
            completionPhotos: aggCompPhotos,
            wouldAgain: aggWouldAgain,
            ch: { status: top.chStatus, score: top.chScore },
          });

          collapsed.push({
            id: top.id,
            projectId: top.projectId,
            company: b.company,
            name: top.name,
            createdAt: top.createdAt,
            fromFriend: top.fromFriend,
            fromCommunity: top.fromCommunity,
            likes: aggLikes,
            recPhotos: aggRecPhotos + aggCompPhotos, // single "Photos" column
            completionWins: aggWins,
            completionPhotos: aggCompPhotos,
            legacyWins: 0,
            wouldAgain: aggWouldAgain,
            chStatus: top.chStatus,
            chScore: top.chScore,
            score: aggScore,
          });
          // end collapse
        }

        collapsed.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.likes !== a.likes) return b.likes - a.likes;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

        return res.json({ items: collapsed, total: collapsed.length });
      }

      // ===== PROJECT MODE (original behaviour) =====
      const proj = db
        .prepare(
          `SELECT ownerUserId, status, location FROM projects WHERE id=?`
        )
        .get(projectId);
      if (!proj) return res.status(404).json({ error: "Project not found" });

      const uid = req.user?.uid || null;
      const isOwner = uid && String(uid) === String(proj.ownerUserId);
      const isLive = String(proj.status || "").toLowerCase() === "live";
      if (!isOwner && !isLive)
        return res.status(403).json({ error: "Forbidden" });

      const pTok = extractLocationTokens?.(proj.location || "") || {};

      const rows = db
        .prepare(
          `SELECT
             r.id, r.projectId, r.company, r.name, r.email, r.phone, r.comment,
             r.isAnonymous, r.createdAt, r.source, r.recommenderUserId
           FROM recommendations r
          WHERE r.projectId=?`
        )
        .all(projectId);

      function fromCommunityFlagProject(row) {
        if (!row.recommenderUserId) return 0;
        const u = db
          .prepare(
            `SELECT postcode, postcodeSector, postcodeOutward, city
               FROM users
              WHERE uid=?`
          )
          .get(row.recommenderUserId);
        return Number(
          (pTok.full && u?.postcode === pTok.full) ||
            (pTok.sector && u?.postcodeSector === pTok.sector) ||
            (pTok.outward && u?.postcodeOutward === pTok.outward) ||
            (pTok.city &&
              u?.city &&
              String(u.city).toLowerCase() ===
                String(pTok.city || "").toLowerCase())
        );
      }

      const items = rows.map((r) => {
        const likes = likesFor(r.id);
        const recPhotos = recPhotoCount(r.id);
        const wins = closuresWonCount(r.id);
        const compPhotos = closurePhotoCountFor(r.id);
        const wouldAgain = closuresWouldAgainCount(r.id);
        const ch = companyVerification(r.id);

        const score = computeScore({
          isRecommended: 1,
          fromFriend:
            String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
          fromCommunity: fromCommunityFlagProject(r),
          likes,
          wins,
          recPhotos,
          completionPhotos: compPhotos,
          wouldAgain,
          ch,
        });

        return {
          id: r.id,
          projectId: r.projectId,
          company: r.company,
          name: r.name,
          createdAt: r.createdAt,
          fromFriend:
            String(r.source || "platform").toLowerCase() === "magic" ? 1 : 0,
          fromCommunity: fromCommunityFlagProject(r),
          likes,
          recPhotos,
          completionWins: wins,
          completionPhotos: compPhotos,
          legacyWins: 0,
          wouldAgain,
          chStatus: ch?.status || null,
          chScore: ch?.score ?? null,
          score,
        };
      });

      items.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.likes !== a.likes) return b.likes - a.likes;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      return res.json({ items, total: items.length });
    } catch (e) {
      console.error("[admin/recommendation-leaderboard] error", e);
      return res.status(500).json({ error: "Failed" });
    }
  });
};
