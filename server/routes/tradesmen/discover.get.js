/**
 * GET  /api/builders/discover
 * ALSO /api/tradesmen/discover
 *
 * Query (optional):
 *   projectId  → if provided, use that project's location to scope the area
 *   location   → fallback if projectId is absent; otherwise we use the project's location
 *   page, pageSize
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  // ---- helpers ----
  const tblExists = (name) =>
    !!db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);

  const tblCols = (name) => {
    const rows = db.prepare(`PRAGMA table_info(${name})`).all();
    return new Set(rows.map((r) => r.name));
  };

  function outward(s) {
    if (!s) return "";
    const S = String(s).trim().toUpperCase();
    const m = S.match(/^[A-Z]{1,2}\d{1,2}[A-Z]?/);
    return (m ? m[0] : S.split(/\s+/)[0] || "").trim();
  }

  function clamp(n, lo, hi, dflt) {
    const v = Number(n);
    if (!Number.isFinite(v)) return dflt;
    return Math.max(lo, Math.min(hi, v));
  }

  // derive best outward from whatever columns user row has
  function pickAreaFromUser(row) {
    if (!row) return "";
    const candidates = [
      row.postcodeOutward,
      row.postcode_sector,
      row.postcodeSector,
      row.postcode,
      row.location,
      row.city,
    ].filter(Boolean);
    for (const c of candidates) {
      const o = outward(c);
      if (o) return o;
      if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(String(c).toUpperCase().trim())) {
        return String(c).toUpperCase().trim();
      }
    }
    return "";
  }

  const hasVotes = tblExists("recommendation_votes");
  const hasPhotos = tblExists("recommendation_photos");
  const hasCV = tblExists("company_verifications");
  const cvCols = hasCV ? tblCols("company_verifications") : new Set();
  const useCV =
    hasCV &&
    cvCols.has("recommendationId") &&
    cvCols.has("verdict") &&
    (cvCols.has("best") ||
      (cvCols.has("companyNumber") && cvCols.has("companyName")));

  const likesExpr = hasVotes
    ? "(SELECT COALESCE(SUM(value),0) FROM recommendation_votes v WHERE v.recommendationId = r.id)"
    : "0";

  const photosCountExpr = hasPhotos
    ? "(SELECT COUNT(*) FROM recommendation_photos rp WHERE rp.recommendationId = r.id)"
    : "0";

  const cvNumberExpr =
    useCV && cvCols.has("best")
      ? "JSON_EXTRACT(cv.best, '$.number')"
      : useCV
      ? "cv.companyNumber"
      : "NULL";

  const cvNameExpr =
    useCV && cvCols.has("best")
      ? "COALESCE(JSON_EXTRACT(cv.best, '$.name'), r.company)"
      : useCV
      ? "COALESCE(cv.companyName, r.company)"
      : "r.company";

  function handler(req, res) {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

      const page = clamp(req.query.page, 1, 999999, 1);
      const pageSize = clamp(req.query.pageSize, 1, 50, 10);
      const offset = (page - 1) * pageSize;

      // ---- Area scoping priority: projectId → location query → user profile
      let loc = String(req.query.location || "").toUpperCase().trim();

      const pid = Number(req.query.projectId);
      if (Number.isFinite(pid)) {
        const projectRow = db.prepare("SELECT location FROM projects WHERE id = ?").get(pid);
        if (projectRow?.location) {
          loc = String(projectRow.location).toUpperCase().trim();
        }
      }

      if (!loc) {
        const userRow = db.prepare("SELECT * FROM users WHERE uid = ?").get(uid);
        loc = pickAreaFromUser(userRow);
      }

      const area = outward(loc);
      if (!area) {
        return res.status(400).json({ ok: false, error: "Missing or invalid location" });
      }
      const like = area + "%";

      // ---- Build SQL (exclude ONLY the current viewer's own recommended companies)
      let sql, totalSql, params = { like, limit: pageSize, offset, uid };

      if (useCV) {
        // Use CH verification for dedupe (companyNumber)
        sql = `
          WITH base AS (
            SELECT
              r.id,
              r.createdAt,
              UPPER(p.location)        AS projectLocation,
              ${cvNumberExpr}          AS companyNumber,
              ${cvNameExpr}            AS companyName,
              ${likesExpr}             AS likes,
              ${photosCountExpr}       AS photoCount
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            JOIN company_verifications cv ON cv.recommendationId = r.id
            WHERE LOWER(cv.verdict) = 'verified'
              AND projectLocation LIKE @like
          ),
          exclude AS (
            SELECT DISTINCT
              ${cvNumberExpr} AS companyNumber
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            JOIN company_verifications cv ON cv.recommendationId = r.id
            WHERE p.ownerUserId = @uid
              AND LOWER(cv.verdict) = 'verified'
              AND ${cvNumberExpr} IS NOT NULL
          ),
          ver AS (
            SELECT *
            FROM base
            WHERE (companyNumber NOT IN (SELECT companyNumber FROM exclude))
               OR companyNumber IS NULL
          ),
          grouped AS (
            SELECT
              companyNumber,
              companyName,
              COUNT(*)                 AS recCount,
              COALESCE(SUM(likes),0)  AS totalLikes,
              MAX(DATETIME(createdAt)) AS lastRecommendedAt,
              MAX(photoCount)          AS maxPhotoCount,
              (SELECT id FROM ver v2
               WHERE v2.companyNumber = ver.companyNumber
               ORDER BY DATETIME(v2.createdAt) DESC, v2.id DESC
               LIMIT 1)               AS sampleRecommendationId
            FROM ver
            GROUP BY companyNumber, companyName
          )
          SELECT companyNumber, companyName, recCount, totalLikes, lastRecommendedAt, maxPhotoCount AS photoCount, sampleRecommendationId
          FROM grouped
          ORDER BY recCount DESC, totalLikes DESC, lastRecommendedAt DESC
          LIMIT @limit OFFSET @offset
        `;

        totalSql = `
          WITH base AS (
            SELECT ${cvNumberExpr} AS companyNumber, UPPER(p.location) AS projectLocation
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            JOIN company_verifications cv ON cv.recommendationId = r.id
            WHERE LOWER(cv.verdict) = 'verified'
              AND projectLocation LIKE @like
          ),
          exclude AS (
            SELECT DISTINCT ${cvNumberExpr} AS companyNumber
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            JOIN company_verifications cv ON cv.recommendationId = r.id
            WHERE p.ownerUserId = @uid
              AND LOWER(cv.verdict) = 'verified'
              AND ${cvNumberExpr} IS NOT NULL
          ),
          ver AS (
            SELECT * FROM base
            WHERE (companyNumber NOT IN (SELECT companyNumber FROM exclude))
               OR companyNumber IS NULL
          )
          SELECT COUNT(DISTINCT companyNumber) AS total
          FROM ver
        `;
      } else {
        // Fallback: dedupe by normalized company name (companyKey)
        sql = `
          WITH base AS (
            SELECT
              r.id,
              r.createdAt,
              UPPER(p.location)       AS projectLocation,
              r.company               AS companyName,
              UPPER(TRIM(r.company))  AS companyKey,
              ${likesExpr}            AS likes,
              ${photosCountExpr}      AS photoCount
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            WHERE projectLocation LIKE @like
          ),
          exclude AS (
            SELECT DISTINCT UPPER(TRIM(r.company)) AS companyKey
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            WHERE p.ownerUserId = @uid
              AND r.company IS NOT NULL
          ),
          ver AS (
            SELECT *
            FROM base
            WHERE (companyKey NOT IN (SELECT companyKey FROM exclude))
               OR companyKey IS NULL
          ),
          grouped AS (
            SELECT
              NULL                     AS companyNumber,
              MAX(companyName)         AS companyName,
              companyKey,
              COUNT(*)                 AS recCount,
              COALESCE(SUM(likes),0)   AS totalLikes,
              MAX(DATETIME(createdAt)) AS lastRecommendedAt,
              MAX(photoCount)          AS maxPhotoCount,
              (SELECT id FROM ver v2
               WHERE v2.companyKey = ver.companyKey
               ORDER BY DATETIME(v2.createdAt) DESC, v2.id DESC
               LIMIT 1)                AS sampleRecommendationId
            FROM ver
            GROUP BY companyKey
          )
          SELECT companyNumber, companyName, recCount, totalLikes, lastRecommendedAt, maxPhotoCount AS photoCount, sampleRecommendationId
          FROM grouped
          ORDER BY recCount DESC, totalLikes DESC, lastRecommendedAt DESC
          LIMIT @limit OFFSET @offset
        `;

        totalSql = `
          WITH base AS (
            SELECT UPPER(TRIM(r.company)) AS companyKey, UPPER(p.location) AS projectLocation
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            WHERE projectLocation LIKE @like
          ),
          exclude AS (
            SELECT DISTINCT UPPER(TRIM(r.company)) AS companyKey
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            WHERE p.ownerUserId = @uid
              AND r.company IS NOT NULL
          ),
          ver AS (
            SELECT * FROM base
            WHERE (companyKey NOT IN (SELECT companyKey FROM exclude))
               OR companyKey IS NULL
          )
          SELECT COUNT(DISTINCT companyKey) AS total
          FROM ver
        `;
      }

      const rows = db.prepare(sql).all(params);

      const items = rows.map((row) => ({
        companyNumber:
          (row.companyNumber != null
            ? String(row.companyNumber).replace(/^"|"$/g, "")
            : null) || null,
        companyName: String(row.companyName ?? "").replace(/^"|"$/g, ""),
        sampleRecommendationId: Number(row.sampleRecommendationId),
        recCount: Number(row.recCount) || 0,
        totalLikes: Number(row.totalLikes) || 0,
        lastRecommendedAt: row.lastRecommendedAt,
        hasPhotos: Number(row.photoCount || 0) > 0,
      }));

      const total = Number(db.prepare(totalSql).get(params)?.total || 0);

      res.json({ ok: true, location: area, items, total, page, pageSize });
    } catch (e) {
      console.error("[discover] unhandled:", e);
      res.status(500).json({ ok: false, error: "Server error" });
    }
  }

  router.get("/builders/discover", auth, handler);
  router.get("/tradesmen/discover", auth, handler);
};
