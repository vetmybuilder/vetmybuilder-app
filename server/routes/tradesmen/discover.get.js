/**
 * Discover tradesmen (area + (optional) trade-aware) with owner-only exclusions.
 * Accepts:
 *   /api/discover?projectId=...&location=E4&pageSize=6
 *   /api/discover?near=E4&limit=6
 * Aliases: /api/tradesmen/discover, /api/builders/discover
 */
module.exports = (router, ctx) => {
  console.log("[discover] route module loaded");
  const { db, auth } = ctx;

  const tblExists = (name) =>
    !!db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);

  const tblCols = (name) => {
    const rows = db.prepare(`PRAGMA table_info(${name})`).all();
    return new Set(rows.map((r) => r.name));
  };

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

  function handler(req, res) {
    console.log("[discover] hit:", req.method, req.path, req.query);
    try {
      const uid = req.user?.uid;
      if (!uid)
        return res.status(401).json({ ok: false, error: "Unauthorized" });

      // Accept both request shapes
      const rawLimit = req.query.pageSize ?? req.query.limit;
      const rawLocation = req.query.location ?? req.query.near;

      const pageSize = clamp(rawLimit, 1, 50, 10);
      const page = clamp(req.query.page, 1, 999999, 1);
      const offset = (page - 1) * pageSize;

      // Scope by project first if provided
      let loc = String(rawLocation || "")
        .toUpperCase()
        .trim();
      const pid = Number(req.query.projectId);
      if (Number.isFinite(pid)) {
        const projectRow = db
          .prepare("SELECT location FROM projects WHERE id = ?")
          .get(pid);
        if (projectRow?.location)
          loc = String(projectRow.location).toUpperCase().trim();
      }
      if (!loc) {
        const userRow = db
          .prepare("SELECT * FROM users WHERE uid = ?")
          .get(uid);
        loc = pickAreaFromUser(userRow);
      }
      const area = outward(loc);
      if (!area)
        return res
          .status(400)
          .json({ ok: false, error: "Missing or invalid location" });
      const like = area + "%";

      // Optional trade filter (harmless if omitted)
      const tradeRaw =
        String(req.query.trade || "")
          .toLowerCase()
          .trim() || "";
      const trade = [
        "electrician",
        "plumber",
        "carpenter",
        "painter",
        "plasterer",
        "builder",
      ].includes(tradeRaw)
        ? tradeRaw
        : "";

      const params = { like, limit: pageSize, offset, uid, trade };

      // Inline SIC mapping
      const sicMapping = `
        WITH sic_map(code, trade) AS (
          VALUES
            ('43210','electrician'),
            ('43220','plumber'),
            ('43320','carpenter'),
            ('43341','painter'),
            ('43310','plasterer'),
            ('41100','builder'), ('41201','builder'), ('41202','builder'),
            ('43390','builder'), ('43999','builder')
        ),
      `;

      // Exclusions: only current viewer's own recommended companies
      const excludeCV = `
        exclude AS (
          SELECT DISTINCT ${cvNumberExpr} AS companyNumber
          FROM recommendations r
          JOIN projects p ON p.id = r.projectId
          JOIN company_verifications cv ON cv.recommendationId = r.id
          WHERE p.ownerUserId = @uid
            AND LOWER(cv.verdict) = 'verified'
            AND ${cvNumberExpr} IS NOT NULL
        ),
      `;
      const excludeName = `
        exclude AS (
          SELECT DISTINCT UPPER(TRIM(r.company)) AS companyKey
          FROM recommendations r
          JOIN projects p ON p.id = r.projectId
          WHERE p.ownerUserId = @uid
            AND r.company IS NOT NULL
        ),
      `;

      const kwLikeExpr = trade
        ? `CASE WHEN LOWER(IFNULL(r.comment,'')) LIKE '%' || @trade || '%' THEN 1 ELSE 0 END`
        : "0";

      let sql, totalSql;

      if (useCV) {
        sql = `
          ${sicMapping}
          base AS (
            SELECT
              r.id,
              r.createdAt,
              UPPER(p.location)        AS projectLocation,
              ${cvNumberExpr}          AS companyNumber,
              ${cvNameExpr}            AS companyName,
              ${likesExpr}             AS likes,
              ${photosCountExpr}       AS photoCount,
              LOWER(IFNULL(p.type,'')) AS projectTypeLower,
              ${kwLikeExpr}            AS kwHit
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            JOIN company_verifications cv ON cv.recommendationId = r.id
            WHERE LOWER(cv.verdict) = 'verified'
              AND UPPER(p.location) LIKE @like
          ),
          ${excludeCV}
          ver AS (
            SELECT * FROM base
            WHERE (companyNumber NOT IN (SELECT companyNumber FROM exclude))
               OR companyNumber IS NULL
          ),
          -- SIC scoring
          sic_hits AS (
            SELECT
              ver.companyNumber,
              MAX(CASE WHEN sm.trade = @trade THEN 1.0 ELSE 0 END) AS sic_exact,
              MAX(CASE
                    WHEN sm.trade = 'builder' AND @trade <> 'builder' AND @trade <> '' THEN 0.5
                    WHEN sm.trade <> 'builder' AND @trade = 'builder' THEN 0.5
                    ELSE 0
                  END) AS sic_related
            FROM ver
            JOIN company_verifications cv ON cv.recommendationId = ver.id
            LEFT JOIN json_each(COALESCE(JSON_EXTRACT(cv.best, '$.sicCodes'), '[]')) s
            LEFT JOIN sic_map sm ON sm.code = s.value
            GROUP BY ver.companyNumber
          ),
          hist AS (
            SELECT
              ver.companyNumber,
              SUM(CASE WHEN projectTypeLower = @trade THEN 1 ELSE 0 END) AS hits,
              COUNT(*) AS total
            FROM ver
            GROUP BY ver.companyNumber
          ),
          kw AS (
            SELECT companyNumber, MAX(kwHit) AS kwBoost
            FROM ver
            GROUP BY companyNumber
          ),
          grouped AS (
            SELECT
              ver.companyNumber,
              MAX(ver.companyName)                     AS companyName,
              COUNT(*)                                 AS recCount,
              COALESCE(SUM(ver.likes),0)               AS totalLikes,
              MAX(DATETIME(ver.createdAt))             AS lastRecommendedAt,
              MAX(ver.photoCount)                      AS maxPhotoCount,
              (SELECT id FROM ver v2
               WHERE v2.companyNumber = ver.companyNumber
               ORDER BY DATETIME(v2.createdAt) DESC, v2.id DESC
               LIMIT 1)                                AS sampleRecommendationId,
              COALESCE(sh.sic_exact,0)                 AS sic_exact,
              COALESCE(sh.sic_related,0)               AS sic_related,
              CASE WHEN h.total > 0 THEN CAST(h.hits AS REAL) / (h.total + 1) ELSE 0 END AS hist_score,
              COALESCE(k.kwBoost,0)                    AS kw_score
            FROM ver
            LEFT JOIN sic_hits sh ON sh.companyNumber = ver.companyNumber
            LEFT JOIN hist h      ON h.companyNumber = ver.companyNumber
            LEFT JOIN kw   k      ON k.companyNumber = ver.companyNumber
            GROUP BY ver.companyNumber
          )
          SELECT
            companyNumber,
            companyName,
            recCount,
            totalLikes,
            lastRecommendedAt,
            maxPhotoCount AS photoCount,
            sampleRecommendationId,
            (0.7 * MAX(sic_exact, sic_related) + 0.25 * hist_score + 0.05 * kw_score) AS tradeScore
          FROM grouped
          WHERE (@trade = '' OR (0.7 * MAX(sic_exact, sic_related) + 0.25 * hist_score + 0.05 * kw_score) >= 0.35)
          ORDER BY
            CASE WHEN @trade = '' THEN 0 ELSE 1 END DESC,
            tradeScore DESC,
            recCount DESC,
            totalLikes DESC,
            lastRecommendedAt DESC
          LIMIT @limit OFFSET @offset
        `;

        totalSql = `
          ${sicMapping}
          base AS (
            SELECT
              r.id,
              UPPER(p.location)        AS projectLocation,
              ${cvNumberExpr}          AS companyNumber,
              LOWER(IFNULL(p.type,'')) AS projectTypeLower
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            JOIN company_verifications cv ON cv.recommendationId = r.id
            WHERE LOWER(cv.verdict) = 'verified'
              AND UPPER(p.location) LIKE @like
          ),
          ${excludeCV}
          ver AS (
            SELECT * FROM base
            WHERE (companyNumber NOT IN (SELECT companyNumber FROM exclude))
               OR companyNumber IS NULL
          ),
          sic_hits AS (
            SELECT
              ver.companyNumber,
              MAX(CASE WHEN sm.trade = @trade THEN 1.0 ELSE 0 END) AS sic_exact,
              MAX(CASE
                    WHEN sm.trade = 'builder' AND @trade <> 'builder' AND @trade <> '' THEN 0.5
                    WHEN sm.trade <> 'builder' AND @trade = 'builder' THEN 0.5
                    ELSE 0
                  END) AS sic_related
            FROM ver
            JOIN company_verifications cv ON cv.recommendationId = ver.id
            LEFT JOIN json_each(COALESCE(JSON_EXTRACT(cv.best, '$.sicCodes'), '[]')) s
            LEFT JOIN sic_map sm ON sm.code = s.value
            GROUP BY ver.companyNumber
          ),
          hist AS (
            SELECT
              ver.companyNumber,
              SUM(CASE WHEN projectTypeLower = @trade THEN 1 ELSE 0 END) AS hits,
              COUNT(*) AS total
            FROM ver
            GROUP BY ver.companyNumber
          ),
          grouped AS (
            SELECT
              ver.companyNumber,
              MAX(COALESCE(sh.sic_exact,0)) AS sic_exact,
              MAX(COALESCE(sh.sic_related,0)) AS sic_related,
              CASE WHEN h.total > 0 THEN CAST(h.hits AS REAL) / (h.total + 1) ELSE 0 END AS hist_score
            FROM ver
            LEFT JOIN sic_hits sh ON sh.companyNumber = ver.companyNumber
            LEFT JOIN hist h      ON h.companyNumber = ver.companyNumber
            GROUP BY ver.companyNumber
          )
          SELECT COUNT(*) AS total
          FROM grouped
          WHERE (@trade = '' OR (0.7 * MAX(sic_exact, sic_related) + 0.25 * hist_score) >= 0.35)
        `;
      } else {
        // --- Fallback: no CH JSON; dedupe by companyKey (FIX: add WITH) ---
        sql = `
          WITH
          base AS (
            SELECT
              r.id,
              r.createdAt,
              UPPER(p.location)        AS projectLocation,
              r.company                AS companyName,
              UPPER(TRIM(r.company))   AS companyKey,
              ${likesExpr}             AS likes,
              ${photosCountExpr}       AS photoCount,
              LOWER(IFNULL(p.type,'')) AS projectTypeLower,
              ${kwLikeExpr}            AS kwHit
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            WHERE projectLocation LIKE @like
          ),
          ${excludeName}
          ver AS (
            SELECT * FROM base
            WHERE (companyKey NOT IN (SELECT companyKey FROM exclude))
               OR companyKey IS NULL
          ),
          hist AS (
            SELECT
              ver.companyKey                 AS companyKey,
              SUM(CASE WHEN projectTypeLower = @trade THEN 1 ELSE 0 END) AS hits,
              COUNT(*) AS total
            FROM ver
            GROUP BY ver.companyKey
          ),
          kw AS (
            SELECT
              ver.companyKey AS companyKey,
              MAX(kwHit)     AS kwBoost
            FROM ver
            GROUP BY ver.companyKey
          ),
          grouped AS (
            SELECT
              ver.companyKey                            AS companyKey,
              MAX(ver.companyName)                      AS companyName,
              COUNT(*)                                  AS recCount,
              COALESCE(SUM(ver.likes),0)                AS totalLikes,
              MAX(DATETIME(ver.createdAt))              AS lastRecommendedAt,
              MAX(ver.photoCount)                       AS maxPhotoCount,
              (SELECT id FROM ver v2
               WHERE v2.companyKey = ver.companyKey
               ORDER BY DATETIME(v2.createdAt) DESC, v2.id DESC
               LIMIT 1)                                 AS sampleRecommendationId,
              CASE WHEN h.total > 0
                   THEN CAST(h.hits AS REAL) / (h.total + 1)
                   ELSE 0
              END                                        AS hist_score,
              COALESCE(k.kwBoost,0)                      AS kw_score
            FROM ver
            LEFT JOIN hist h ON h.companyKey = ver.companyKey
            LEFT JOIN kw   k ON k.companyKey = ver.companyKey
            GROUP BY ver.companyKey
          )
          SELECT
            NULL AS companyNumber,
            companyName,
            recCount,
            totalLikes,
            lastRecommendedAt,
            maxPhotoCount AS photoCount,
            sampleRecommendationId,
            (0.25 * hist_score + 0.05 * kw_score) AS tradeScore
          FROM grouped
          WHERE (@trade = '' OR (0.25 * hist_score + 0.05 * kw_score) >= 0.35)
          ORDER BY
            CASE WHEN @trade = '' THEN 0 ELSE 1 END DESC,
            tradeScore DESC,
            recCount DESC,
            totalLikes DESC,
            lastRecommendedAt DESC
          LIMIT @limit OFFSET @offset
        `;

        // Keep the same filter semantics for totals
        totalSql = `
          WITH
          base AS (
            SELECT
              r.id,
              UPPER(p.location)        AS projectLocation,
              UPPER(TRIM(r.company))   AS companyKey,
              LOWER(IFNULL(p.type,'')) AS projectTypeLower,
              ${kwLikeExpr}            AS kwHit
            FROM recommendations r
            JOIN projects p ON p.id = r.projectId
            WHERE projectLocation LIKE @like
          ),
          ${excludeName}
          ver AS (
            SELECT * FROM base
            WHERE (companyKey NOT IN (SELECT companyKey FROM exclude))
               OR companyKey IS NULL
          ),
          hist AS (
            SELECT
              ver.companyKey                 AS companyKey,
              SUM(CASE WHEN projectTypeLower = @trade THEN 1 ELSE 0 END) AS hits,
              COUNT(*) AS total
            FROM ver
            GROUP BY ver.companyKey
          ),
          kw AS (
            SELECT
              ver.companyKey AS companyKey,
              MAX(kwHit)     AS kwBoost
            FROM ver
            GROUP BY ver.companyKey
          ),
          grouped AS (
            SELECT
              ver.companyKey AS companyKey,
              CASE WHEN h.total > 0
                   THEN CAST(h.hits AS REAL) / (h.total + 1)
                   ELSE 0
              END AS hist_score,
              COALESCE(k.kwBoost,0) AS kw_score
            FROM ver
            LEFT JOIN hist h ON h.companyKey = ver.companyKey
            LEFT JOIN kw   k ON k.companyKey = ver.companyKey
            GROUP BY ver.companyKey
          )
          SELECT COUNT(*) AS total
          FROM grouped
          WHERE (@trade = '' OR (0.25 * hist_score + 0.05 * kw_score) >= 0.35)
        `;
      }

      const rows = db.prepare(sql).all(params);
      const items = rows.map((row) => ({
        companyNumber:
          row.companyNumber != null
            ? String(row.companyNumber).replace(/^"|"$/g, "")
            : null,
        companyName: String(row.companyName ?? "").replace(/^"|"$/g, ""),
        sampleRecommendationId: Number(row.sampleRecommendationId),
        recCount: Number(row.recCount) || 0,
        totalLikes: Number(row.totalLikes) || 0,
        lastRecommendedAt: row.lastRecommendedAt,
        hasPhotos: Number(row.photoCount || 0) > 0,
        tradeScore: trade ? Number(row.tradeScore || 0) : undefined,
      }));

      const total = Number(db.prepare(totalSql).get(params)?.total || 0);
      res.json({
        ok: true,
        location: area,
        trade: trade || null,
        items,
        total,
        page,
        pageSize,
      });
    } catch (e) {
      console.error("[discover] error:", e);
      const payload =
        process.env.NODE_ENV === "production"
          ? { ok: false, error: "Server error" }
          : {
              ok: false,
              error: String((e && e.message) || e),
              stack: String((e && e.stack) || ""),
            };
      res.status(500).json(payload);
    }
  }

  // Paths under your /api mount; aliases included
  router.get("/discover", auth, handler);
  router.get("/tradesmen/discover", auth, handler);
  router.get("/builders/discover", auth, handler);
};
