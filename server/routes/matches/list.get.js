// server/routes/matches/list.get.js
//
// GET /api/matches
// Homeowner-only. Aggregates swipe_interest rows across ALL of the caller's
// projects. Returns matches with normalized status/source and a bucket count
// for the UI ("new" | "contacted" | "archived").

const { mysqlQuery: _mq } = require("../../lib/mysql");
const {
  computeScore,
  normaliseScore,
  ageInDays,
} = require("../../lib/recommendationScoring");

function mapStatus(dbStatus) {
  if (dbStatus === "pending") return "new";
  if (dbStatus === "matched") return "contacted";
  return "archived";
}

function mapSource(dbSource) {
  return dbSource === "recommended" ? "recommended" : "ai-matched";
}

function splitTrades(csv) {
  if (!csv) return [];
  return String(csv)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function normaliseBadge(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s;
}

module.exports = function mountGlobalMatches(router, ctx) {
  const mysqlQuery = ctx?.mysqlQuery ?? _mq;
  const auth = ctx?.auth;

  router.get("/matches", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    // LEFT JOIN company_verifications via t.company_number = cv.companyNumber.
    // company_verifications is keyed per recommendation, so the same builder
    // can have multiple rows (one per project rec). We aggregate by
    // companyNumber to pick a representative status/score: 'verified' wins
    // over anything else, and we take MAX(score) for the CH match score.
    // The endpoint then prefers cvStatus when present, otherwise falls back
    // to t.ch_status. Google rating/reviews still come from `tradesmen` —
    // company_verifications has no google_rating / google_reviews_count
    // columns (verified 2026-04-24).
    const rows = await mysqlQuery(
      `SELECT si.id AS matchId,
              si.project_id AS projectId,
              p.name AS projectTitle,
              si.builder_uid AS builderUid,
              t.company_name AS companyName,
              t.profile_picture_url AS photoUrl,
              t.trade_types AS tradesCsv,
              GREATEST(0, TIMESTAMPDIFF(YEAR, t.created_at, NOW())) AS yearsTrading,
              t.google_rating AS googleRating,
              COALESCE(t.google_reviews_count, 0) AS googleReviewCount,
              COALESCE(t.vmb_score, 0) AS profileScore,
              t.vmb_badge AS vmbBadge,
              t.ch_status AS chStatus,
              cv.cvStatus AS cvStatus,
              cv.chMatchScore AS chMatchScore,
              COALESCE(t.likes_count, 0) AS likesCount,
              COALESCE(t.wins_count, 0) AS winsCount,
              si.source AS source,
              si.status AS status
       FROM swipe_interest si
       JOIN projects p ON p.id = si.project_id
       LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
       LEFT JOIN (
         SELECT companyNumber,
                MAX(CASE WHEN LOWER(status) = 'verified' THEN 'verified'
                         WHEN LOWER(status) = 'matched'  THEN 'matched'
                         ELSE LOWER(status) END) AS cvStatus,
                MAX(score) AS chMatchScore
           FROM company_verifications
          WHERE companyNumber IS NOT NULL AND companyNumber <> ''
          GROUP BY companyNumber
       ) cv ON cv.companyNumber = t.company_number
       WHERE p.ownerUserId = ?
       ORDER BY si.homeowner_swiped_at DESC, si.created_at DESC`,
      [uid],
    );

    // Resolve per-(project, builder) recommendation score so the mobile
    // /matches view shows the same number as the desktop top-recommendations
    // surface. Desktop reads /api/recommendations/ratings, which computes
    // each rec's score on the fly via computeScore + normaliseScore, and
    // takes MAX across recs for the same company (see web/utils/vmb.ts
    // computeAggregateScore). Replicate the relevant signals here.
    //
    // Intentionally omitted vs the ratings endpoint: fromCommunity
    // (postcode-locality match between recommender and project) — requires
    // a per-rec users-table join and a couple of percent of score weight,
    // which isn't worth the perf cost for the matches list. Everything else
    // (friend provenance, likes, wins, photos, would-again, CH, hires,
    // recency decay) is computed identically.
    const recScoreByMatch = new Map();
    if (rows.length > 0) {
      const pairs = rows
        .filter((r) => r.projectId != null && r.builderUid)
        .map((r) => [Number(r.projectId), String(r.builderUid)]);

      if (pairs.length > 0) {
        // Find every recommendation row that matches any (projectId, linked
        // tradesman) pair on the page. We OR the pairs into a single query
        // to keep this O(1) round-trips regardless of match count.
        const orClauses = pairs
          .map(() => "(r.projectId = ? AND r.linked_tradesman_uid = ?)")
          .join(" OR ");
        const params = [];
        for (const [pid, buid] of pairs) {
          params.push(pid, buid);
        }

        const recRows = await mysqlQuery(
          `SELECT r.id, r.projectId, r.linked_tradesman_uid AS builderUid,
                  r.source, r.createdAt,
                  COALESCE(tp.vetting_score, 0) AS pipelineVettingScore
             FROM recommendations r
             LEFT JOIN tradesperson_pipeline tp
                    ON tp.claimed_by = r.linked_tradesman_uid
                   AND tp.status = 'approved'
            WHERE ${orClauses}`,
          params,
        );

        if (recRows.length > 0) {
          const recIds = recRows.map((r) => r.id);
          const placeholders = recIds.map(() => "?").join(",");

          // Likes per rec
          const likeRows = await mysqlQuery(
            `SELECT recommendationId, COUNT(*) AS c
               FROM recommendation_votes
              WHERE value = 1 AND recommendationId IN (${placeholders})
              GROUP BY recommendationId`,
            recIds,
          );
          const likesByRec = new Map(
            likeRows.map((r) => [Number(r.recommendationId), Number(r.c) || 0]),
          );

          // Photos attached directly to the rec
          const recPhotoRows = await mysqlQuery(
            `SELECT recommendationId, COUNT(*) AS c
               FROM recommendation_photos
              WHERE recommendationId IN (${placeholders})
              GROUP BY recommendationId`,
            recIds,
          );
          const recPhotosByRec = new Map(
            recPhotoRows.map((r) => [Number(r.recommendationId), Number(r.c) || 0]),
          );

          // Closure wins + would-again (legacy flow)
          const closureRows = await mysqlQuery(
            `SELECT winnerRecommendationId AS recId,
                    COUNT(*) AS wins,
                    SUM(CASE WHEN COALESCE(wouldUseAgain,0) = 1 THEN 1 ELSE 0 END) AS wa
               FROM project_closures
              WHERE winnerRecommendationId IN (${placeholders})
              GROUP BY winnerRecommendationId`,
            recIds,
          );
          const closuresByRec = new Map(
            closureRows.map((r) => [
              Number(r.recId),
              { wins: Number(r.wins) || 0, wouldAgain: Number(r.wa) || 0 },
            ]),
          );

          // Hires accepted/declined
          const hireRows = await mysqlQuery(
            `SELECT recommendationId,
                    SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted,
                    SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined
               FROM hires
              WHERE recommendationId IN (${placeholders})
              GROUP BY recommendationId`,
            recIds,
          );
          const hiresByRec = new Map(
            hireRows.map((r) => [
              Number(r.recommendationId),
              {
                accepted: Number(r.accepted) || 0,
                declined: Number(r.declined) || 0,
              },
            ]),
          );

          // CH verification — pick the most recent row per rec id. Try the
          // newer recommendation_id column first, fall back to the legacy
          // recommendationId spelling.
          let chRows;
          try {
            chRows = await mysqlQuery(
              `SELECT cv.recommendation_id AS recId, cv.status, cv.score
                 FROM company_verifications cv
                 JOIN (
                   SELECT recommendation_id AS recId, MAX(COALESCE(checkedAt,'')) AS m
                     FROM company_verifications
                    WHERE recommendation_id IN (${placeholders})
                    GROUP BY recommendation_id
                 ) latest ON latest.recId = cv.recommendation_id
                          AND COALESCE(cv.checkedAt,'') = latest.m
                WHERE cv.recommendation_id IN (${placeholders})`,
              [...recIds, ...recIds],
            );
          } catch {
            chRows = await mysqlQuery(
              `SELECT cv.recommendationId AS recId, cv.status, cv.score
                 FROM company_verifications cv
                 JOIN (
                   SELECT recommendationId AS recId, MAX(COALESCE(checkedAt,'')) AS m
                     FROM company_verifications
                    WHERE recommendationId IN (${placeholders})
                    GROUP BY recommendationId
                 ) latest ON latest.recId = cv.recommendationId
                          AND COALESCE(cv.checkedAt,'') = latest.m
                WHERE cv.recommendationId IN (${placeholders})`,
              [...recIds, ...recIds],
            );
          }
          const chByRec = new Map(
            chRows.map((r) => [
              Number(r.recId),
              {
                status: String(r.status || ""),
                score: r.score == null ? null : Number(r.score),
              },
            ]),
          );

          // project_completions and project_completion_photos provide the
          // newer wins/photos/wouldAgain stream. These tables may not exist
          // in older schemas — guard with a feature check.
          const completionsByRec = new Map();
          const completionPhotosByRec = new Map();
          let hasCompletions = false;
          try {
            const compRows = await mysqlQuery(
              `SELECT id, recommendationId,
                      didWorkGoAhead, wouldHireAgain
                 FROM project_completions
                WHERE recommendationId IN (${placeholders})`,
              recIds,
            );
            hasCompletions = true;
            for (const c of compRows) {
              const recId = Number(c.recommendationId);
              const cur = completionsByRec.get(recId) || {
                wins: 0,
                wouldAgain: 0,
                ids: [],
              };
              if (Number(c.didWorkGoAhead || 0) === 1) cur.wins += 1;
              if (Number(c.wouldHireAgain || 0) === 1) cur.wouldAgain += 1;
              cur.ids.push(c.id);
              completionsByRec.set(recId, cur);
            }
          } catch {
            // table missing; treat as no completion data
            hasCompletions = false;
          }

          if (hasCompletions) {
            const allCompletionIds = [];
            for (const v of completionsByRec.values()) {
              for (const id of v.ids) allCompletionIds.push(id);
            }
            if (allCompletionIds.length > 0) {
              try {
                const ph = allCompletionIds.map(() => "?").join(",");
                const photoRows = await mysqlQuery(
                  `SELECT pc.recommendationId, COUNT(*) AS c
                     FROM project_completion_photos pcp
                     JOIN project_completions pc ON pc.id = pcp.completionId
                    WHERE pcp.completionId IN (${ph})
                    GROUP BY pc.recommendationId`,
                  allCompletionIds,
                );
                for (const r of photoRows) {
                  completionPhotosByRec.set(
                    Number(r.recommendationId),
                    Number(r.c) || 0,
                  );
                }
              } catch {
                // silent — photo table absent
              }
            }
          }

          // Compute and reduce: per (projectId, builderUid), MAX score wins.
          for (const r of recRows) {
            const recId = Number(r.id);
            const projectId = Number(r.projectId);
            const builderUid = String(r.builderUid);
            const key = `${projectId}::${builderUid}`;

            const likes = likesByRec.get(recId) || 0;
            const recPhotos = recPhotosByRec.get(recId) || 0;
            const closure = closuresByRec.get(recId) || {
              wins: 0,
              wouldAgain: 0,
            };
            const completion = completionsByRec.get(recId) || {
              wins: 0,
              wouldAgain: 0,
            };
            const completionPhotos = completionPhotosByRec.get(recId) || 0;
            const hires = hiresByRec.get(recId) || {
              accepted: 0,
              declined: 0,
            };
            const ch = chByRec.get(recId) || null;

            const raw = computeScore({
              fromFriend:
                String(r.source || "platform").toLowerCase() === "magic"
                  ? 1
                  : 0,
              // fromCommunity intentionally omitted — see comment above
              fromCommunity: 0,
              likes,
              wins: closure.wins + completion.wins,
              recPhotos,
              completionPhotos,
              wouldAgain: closure.wouldAgain + completion.wouldAgain,
              ch,
              hiresAccepted: hires.accepted,
              hiresDeclined: hires.declined,
              ageDays: ageInDays(r.createdAt),
            });
            const normalised = Math.max(
              normaliseScore(raw),
              Number(r.pipelineVettingScore || 0),
            );

            const prev = recScoreByMatch.get(key);
            if (prev == null || normalised > prev) {
              recScoreByMatch.set(key, normalised);
            }
          }
        }
      }
    }

    const matches = (rows || []).map((r) => {
      const status = mapStatus(r.status);
      const source = mapSource(r.source);
      const whyMatch =
        source === "recommended"
          ? "Recommended · Free to contact"
          : "Matched on area + trade";

      // chVerified is true if either source confirms it. cv (company_verifications)
      // is the canonical pipeline-side check; t.ch_status is what the
      // tradesman-side flow writes. Either populating 'matched' or 'verified'
      // means the company has been confirmed at Companies House.
      const cvStatus = (r.cvStatus || "").toLowerCase();
      const tStatus = (r.chStatus || "").toLowerCase();
      const chVerified =
        cvStatus === "verified" ||
        cvStatus === "matched" ||
        tStatus === "matched" ||
        tStatus === "verified";

      // vmbScore: prefer the desktop-equivalent recommendation score
      // (MAX across recs for this project+builder). Fall back to the
      // builder's profile-wide vmb_score when no project-scoped rec exists.
      // r.recommendationScore may be set by the test mock to override the
      // computed value; respect it when present.
      const explicit =
        r.recommendationScore === undefined ? null : r.recommendationScore;
      const computedRecScore = recScoreByMatch.get(
        `${Number(r.projectId)}::${String(r.builderUid || "")}`,
      );
      const recScore =
        explicit != null
          ? Number(explicit)
          : computedRecScore != null
            ? computedRecScore
            : null;

      const vmbScore =
        recScore != null
          ? recScore
          : Math.max(0, Number(r.profileScore) || 0);

      return {
        matchId: String(r.matchId),
        projectId: String(r.projectId),
        projectTitle: r.projectTitle || "",
        builderUid: r.builderUid || "",
        companyName: r.companyName || "",
        photoUrl: r.photoUrl || null,
        trades: splitTrades(r.tradesCsv),
        yearsTrading: Number(r.yearsTrading) || 0,
        googleRating: r.googleRating === null || r.googleRating === undefined ? null : Number(r.googleRating),
        googleReviewCount: Number(r.googleReviewCount) || 0,
        vmbScore,
        vmbBadge: normaliseBadge(r.vmbBadge),
        chVerified,
        chMatchScore: r.chMatchScore === null || r.chMatchScore === undefined ? null : Number(r.chMatchScore),
        likesCount: Number(r.likesCount) || 0,
        winsCount: Number(r.winsCount) || 0,
        source,
        status,
        whyMatch,
      };
    });

    const counts = { new: 0, contacted: 0, archived: 0 };
    for (const m of matches) {
      counts[m.status] = (counts[m.status] || 0) + 1;
    }

    res.json({ matches, counts });
  });
};
