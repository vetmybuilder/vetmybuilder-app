/**
 * GET /api/projects
 * Auth: required
 * Query:
 *   tab=mine|community|favourites|archived|completed|completedCommunity|recommended
 *   name, type, location, property
 *   status=all|pending|live|archived
 *   sort=createdAt|name
 *   order=asc|desc
 *   page=1.., pageSize=1..50
 * Response: { items, total, page, pageSize }
 */

const { formatPostcode } = require("../../lib/location");

module.exports = (router, ctx) => {
  const { auth, touchUserMw, mysqlQuery } = ctx;
  const log = ctx.log || console;

  // Check once (cached on ctx) whether tradesmen.public_id exists
  async function tradesmenHasPublicId() {
    if (ctx.__tradesmenPublicIdExists !== undefined) return ctx.__tradesmenPublicIdExists;
    try {
      const rows = await mysqlQuery(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tradesmen' AND COLUMN_NAME = 'public_id' LIMIT 1`
      );
      ctx.__tradesmenPublicIdExists = rows.length > 0;
    } catch {
      ctx.__tradesmenPublicIdExists = false;
    }
    return ctx.__tradesmenPublicIdExists;
  }

  router.get("/projects", auth, touchUserMw, async (req, res) => {
    log.info?.("[projects.get] start");

    const uid = req.user.uid;

    res.set("Cache-Control", "no-store");
    res.set("Vary", "Authorization, Cookie");

    const allowedTabs = new Set([
      "mine",
      "community",
      "favourites",
      "archived",
      "completed",
      "completedcommunity",
      "recommended",
    ]);
    const tabRaw = String(req.query.tab || "mine").toLowerCase();
    const tab = allowedTabs.has(tabRaw) ? tabRaw : "mine";

    const qName = String(req.query.name ?? "").trim();
    const qType = String(req.query.type ?? "").trim();
    const qLocation = String(req.query.location ?? "").trim();
    const qProperty = String(req.query.property ?? "").trim();
    const rawStatus = String(req.query.status ?? "all").toLowerCase();

    const allowedSort = new Set(["createdAt", "name"]);
    const sort = allowedSort.has(String(req.query.sort))
      ? String(req.query.sort)
      : "createdAt";
    const order =
      String(req.query.order).toLowerCase() === "asc" ? "ASC" : "DESC";

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10))
    );
    const offset = (page - 1) * pageSize;

    const whereParts = [];
    const whereParams = [];

    if (qName) {
      whereParts.push(`p.name LIKE ?`);
      whereParams.push(`%${qName}%`);
    }
    if (qType) {
      whereParts.push(`p.type LIKE ?`);
      whereParams.push(`%${qType}%`);
    }
    if (qLocation) {
      whereParts.push(`p.location LIKE ?`);
      whereParams.push(`%${qLocation}%`);
    }
    if (qProperty) {
      whereParts.push(`p.propertyType LIKE ?`);
      whereParams.push(`%${qProperty}%`);
    }

    const applyWhere = (baseParts = [], baseParams = []) => {
      const parts = [...baseParts, ...whereParts];
      const sql = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
      const params = [...baseParams, ...whereParams];
      return { sql, params };
    };

    // Enrich rows with priceBandEstimate + urgency (parsed from
    // classificationJson) and answersJson (already in p.* but needs
    // parsing). Mutates rows in-place.
    function enrichPricing(rows) {
      for (const r of rows) {
        // Parse answers_json if it came back as a string
        if (r.answers_json != null) {
          try {
            r.answersJson = typeof r.answers_json === "string"
              ? JSON.parse(r.answers_json)
              : r.answers_json;
          } catch {
            r.answersJson = null;
          }
        } else {
          r.answersJson = null;
        }

        // Parse classificationJson (present when JOIN was used)
        if (r.classificationJson != null) {
          try {
            const parsed = typeof r.classificationJson === "string"
              ? JSON.parse(r.classificationJson)
              : r.classificationJson;
            r.priceBandEstimate = parsed?.price_band_estimate
              ? String(parsed.price_band_estimate).trim() || null
              : null;
            r.urgency = parsed?.urgency
              ? String(parsed.urgency).trim() || null
              : null;
          } catch {
            r.priceBandEstimate = null;
            r.urgency = null;
          }
          delete r.classificationJson;
        } else {
          r.priceBandEstimate = null;
          r.urgency = null;
        }
      }
    }

    // Attach a `recommendationCount` field to each row so homeowner cards
    // can show "★ N recommendations". One batched query per response,
    // counting only recommendations the homeowner hasn't dismissed or
    // unfavourited (matching what the Recommendations inbox surfaces).
    async function attachRecommendationCounts(rows) {
      if (!rows || rows.length === 0) return;
      const ids = rows.map((r) => r.id).filter((id) => Number.isFinite(id));
      if (ids.length === 0) {
        for (const r of rows) r.recommendationCount = 0;
        return;
      }
      try {
        const placeholders = ids.map(() => "?").join(",");
        const countRows = await mysqlQuery(
          `SELECT projectId, COUNT(*) AS c
             FROM recommendations
            WHERE projectId IN (${placeholders})
              AND deck_dismissed_at IS NULL
              AND homeowner_unfavourited_at IS NULL
            GROUP BY projectId`,
          ids,
        );
        const byId = new Map(
          countRows.map((row) => [Number(row.projectId), Number(row.c) || 0]),
        );
        for (const r of rows) {
          r.recommendationCount = byId.get(Number(r.id)) || 0;
        }
      } catch (e) {
        log.warn?.("[projects.get] recommendation count enrichment failed", {
          error: e?.message,
        });
        for (const r of rows) r.recommendationCount = 0;
      }
    }

    // Attach `matchedCount` and `waitingCount` so the homeowner card can
    // surface live activity ("1 matched · 2 waiting"). matched = both sides
    // swiped right; waiting = pending bilateral swipe (one side has acted).
    // Final-state rows (declined / expired) don't count - they're not
    // actionable for the homeowner.
    async function attachMatchCounts(rows) {
      if (!rows || rows.length === 0) return;
      const ids = rows.map((r) => r.id).filter((id) => Number.isFinite(id));
      if (ids.length === 0) {
        for (const r of rows) {
          r.matchedCount = 0;
          r.waitingCount = 0;
        }
        return;
      }
      try {
        const placeholders = ids.map(() => "?").join(",");
        const countRows = await mysqlQuery(
          `SELECT project_id, status, COUNT(*) AS c
             FROM swipe_interest
            WHERE project_id IN (${placeholders})
              AND status IN ('matched', 'pending')
            GROUP BY project_id, status`,
          ids,
        );
        const matchedById = new Map();
        const waitingById = new Map();
        for (const row of countRows) {
          const pid = Number(row.project_id);
          const c = Number(row.c) || 0;
          if (row.status === "matched") matchedById.set(pid, c);
          else if (row.status === "pending") waitingById.set(pid, c);
        }
        for (const r of rows) {
          r.matchedCount = matchedById.get(Number(r.id)) || 0;
          r.waitingCount = waitingById.get(Number(r.id)) || 0;
        }
      } catch (e) {
        log.warn?.("[projects.get] match count enrichment failed", {
          error: e?.message,
        });
        for (const r of rows) {
          r.matchedCount = 0;
          r.waitingCount = 0;
        }
      }
    }

    const respond = async (rows, total) => {
      rows.forEach((r) => {
        r.location = formatPostcode(r.location);
      });
      await attachRecommendationCounts(rows);
      await attachMatchCounts(rows);
      log.info?.("[projects.get] end");
      return res.json({ items: rows, total, page, pageSize });
    };

    const deriveAreaTokens = async () => {
      const tokens = [];

      const meRows = await mysqlQuery(
        `SELECT locationRaw, postcodeOutward, postcodeSector, postcode, city
         FROM users WHERE uid = ?`,
        [uid]
      );
      const me = meRows[0] || null;
      if (me) {
        const fields = [
          me.locationRaw,
          me.postcodeOutward,
          me.postcodeSector,
          me.postcode,
          me.city,
        ];
        for (const v of fields) {
          const s = String(v ?? "").trim();
          if (s) tokens.push(s);
        }
      }

      if (tokens.length === 0) {
        const tRows = await mysqlQuery(
          `SELECT service_areas FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [uid]
        );
        const t = tRows[0] || null;
        const sa = t ? String(t.service_areas || "") : "";
        if (sa) {
          for (const part of sa.split(/[,\s]+/)) {
            const v = part.trim();
            if (v) tokens.push(v);
          }
        }
      }

      if (tokens.length === 0 && qLocation) {
        tokens.push(qLocation);
      }

      const norm = (s) =>
        String(s || "")
          .toLowerCase()
          .replace(/\s+/g, "");

      return Array.from(new Set(tokens.map(norm))).filter(Boolean);
    };

    try {
      //
      // -------- TABS --------
      //

      // ********** MINE **********
      if (tab === "mine") {
        const baseParts = ["p.ownerUserId = ?"];
        const baseParams = [uid];

        if (rawStatus === "all") {
          // Show everything the user owns except projects archived without a
          // closure record. Projects closed via the close flow with No (or Yes
          // without a winner) end up archived but DO have a project_closures
          // row and should still appear in "All", consistent with the
          // Completed tab.
          baseParts.push(
            `(p.status <> 'archived' OR pc.projectId IS NOT NULL)`
          );
        } else {
          baseParts.push(`p.status = ?`);
          baseParams.push(rawStatus);
        }

        const { sql, params } = applyWhere(baseParts, baseParams);

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           ${sql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT p.*,
                  CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
                  0 AS canFavourite,
                  cls.structured AS classificationJson
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           LEFT JOIN project_classifications cls ON cls.id = (
             SELECT MAX(id) FROM project_classifications WHERE project_id = p.id
           )
           ${sql}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        enrichPricing(rows);
        return respond(rows, total);
      }

      // ********** ARCHIVED **********
      if (tab === "archived") {
        const baseParts = ["p.ownerUserId = ?", `p.status = 'archived'`];
        const baseParams = [uid];
        const { sql, params } = applyWhere(baseParts, baseParams);

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c FROM projects p ${sql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT p.*,
                  CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
                  0 AS canFavourite
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           ${sql}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // ********** COMPLETED (mine) **********
      if (tab === "completed") {
        const hasPublicId = await tradesmenHasPublicId();
        const publicIdSubquery = hasPublicId
          ? `(SELECT t.public_id FROM tradesmen t WHERE t.user_id = pc.winner_tradesman_uid LIMIT 1) AS _winnerTradesmanPublicId,`
          : `NULL AS _winnerTradesmanPublicId,`;

        const baseParts = ["p.ownerUserId = ?"];
        const baseParams = [uid];
        const { sql: baseSql, params } = applyWhere(baseParts, baseParams);

        // Show any project the homeowner actively closed via the close modal
        // (has a project_closures record), plus status=completed (winner selected).
        const statusFilter = `
          (p.status = 'completed'
           OR (p.status = 'archived' AND pc.projectId IS NOT NULL))
        `.trim();

        const completedSql = baseSql
          ? `${baseSql} AND ${statusFilter}`
          : `WHERE ${statusFilter}`;

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           ${completedSql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT
              p.*,

              pc.winnerRecommendationId AS _winnerRecommendationId,
              pc.winner_tradesman_uid AS _winnerTradesmanUid,
              ${publicIdSubquery}

              -- Best-effort label so UI can show something even if hook fails.
              -- 1) If winner is a recommendation → show recommendation.company (fallback to name)
              -- 2) Else if winner is a tradesman uid → show tradesmen.company_name
              COALESCE(
                (SELECT NULLIF(TRIM(r.company), '') FROM recommendations r WHERE r.id = pc.winnerRecommendationId LIMIT 1),
                (SELECT NULLIF(TRIM(r.name), '') FROM recommendations r WHERE r.id = pc.winnerRecommendationId LIMIT 1),
                (SELECT NULLIF(TRIM(t.company_name), '') FROM tradesmen t WHERE t.user_id = pc.winner_tradesman_uid LIMIT 1),
                NULL
              ) AS _winnerTradesmanName,

              EXISTS(
                SELECT 1 FROM project_closure_photos cpp
                WHERE cpp.projectId = p.id
              ) AS _hasClosurePhotos,

              CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
              0 AS canFavourite

           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           ${completedSql}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // ********** COMPLETED COMMUNITY **********
      if (tab === "completedcommunity") {
        const hasPublicId = await tradesmenHasPublicId();
        const publicIdSubquery = hasPublicId
          ? `(SELECT t.public_id FROM tradesmen t WHERE t.user_id = pc.winner_tradesman_uid LIMIT 1) AS _winnerTradesmanPublicId,`
          : `NULL AS _winnerTradesmanPublicId,`;

        const normTokens = await deriveAreaTokens();

        const baseParts = [`p.ownerUserId <> ?`];
        const baseParams = [uid];

        if (normTokens.length) {
          const areaOr = normTokens
            .map(
              () => `REPLACE(LOWER(p.location),' ','') LIKE CONCAT('%', ?, '%')`
            )
            .join(" OR ");
          baseParts.push(`(${areaOr})`);
          baseParams.push(...normTokens);
        }

        const { sql: baseSql, params } = applyWhere(baseParts, baseParams);

        const statusFilter = `
          (p.status = 'completed'
           OR (p.status = 'archived' AND pc.projectId IS NOT NULL))
        `.trim();

        const completedSql = baseSql
          ? `${baseSql} AND ${statusFilter}`
          : `WHERE ${statusFilter}`;

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           ${completedSql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT
              p.*,

              pc.winnerRecommendationId AS _winnerRecommendationId,
              pc.winner_tradesman_uid AS _winnerTradesmanUid,
              ${publicIdSubquery}

              COALESCE(
                (SELECT NULLIF(TRIM(r.company), '') FROM recommendations r WHERE r.id = pc.winnerRecommendationId LIMIT 1),
                (SELECT NULLIF(TRIM(r.name), '') FROM recommendations r WHERE r.id = pc.winnerRecommendationId LIMIT 1),
                (SELECT NULLIF(TRIM(t.company_name), '') FROM tradesmen t WHERE t.user_id = pc.winner_tradesman_uid LIMIT 1),
                NULL
              ) AS _winnerTradesmanName,

              EXISTS(
                SELECT 1 FROM project_closure_photos cpp
                WHERE cpp.projectId = p.id
              ) AS _hasClosurePhotos,

              CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
              0 AS canFavourite

           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           ${completedSql}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // ********** COMMUNITY **********
      if (tab === "community") {
        const normTokens = await deriveAreaTokens();

        const baseParts = [
          `p.status = 'live'`,
          `p.ownerUserId <> ?`,
          `NOT EXISTS (
             SELECT 1 FROM favourites fx
             WHERE fx.projectId = p.id AND fx.userId = ?
           )`,
        ];
        const baseParams = [uid, uid];

        if (normTokens.length) {
          const areaOr = normTokens
            .map(
              () => `REPLACE(LOWER(p.location),' ','') LIKE CONCAT('%', ?, '%')`
            )
            .join(" OR ");
          baseParts.push(`(${areaOr})`);
          baseParams.push(...normTokens);
        }

        const { sql, params } = applyWhere(baseParts, baseParams);

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c FROM projects p ${sql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT p.*,
                  0 AS isFavourite,
                  1 AS canFavourite,
                  cls.structured AS classificationJson
           FROM projects p
           LEFT JOIN project_classifications cls ON cls.id = (
             SELECT MAX(id) FROM project_classifications WHERE project_id = p.id
           )
           ${sql}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          params
        );

        enrichPricing(rows);
        return respond(rows, total);
      }

      // ********** FAVOURITES **********
      if (tab === "favourites") {
        const whereSQL = whereParts.length
          ? `AND ${whereParts.join(" AND ")}`
          : "";

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
           FROM favourites f
           JOIN projects p ON p.id = f.projectId
           WHERE f.userId = ?
           ${whereSQL}`,
          [uid, ...whereParams]
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT p.*,
                  1 AS isFavourite,
                  0 AS canFavourite,
                  cls.structured AS classificationJson
           FROM favourites f
           JOIN projects p ON p.id = f.projectId
           LEFT JOIN project_classifications cls ON cls.id = (
             SELECT MAX(id) FROM project_classifications WHERE project_id = p.id
           )
           WHERE f.userId = ?
           ${whereSQL}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...whereParams]
        );

        enrichPricing(rows);
        return respond(rows, total);
      }

      // ********** RECOMMENDED **********
      if (tab === "recommended") {
        const extra = [];
        const extraParams = [];
        if (rawStatus !== "all") {
          extra.push(`p.status = ?`);
          extraParams.push(rawStatus);
        }

        const allParts = [...extra, ...whereParts];
        const whereSql =
          allParts.length > 0 ? `AND ${allParts.join(" AND ")}` : "";

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
           WHERE r.recommenderUserId = ?
           ${whereSql}`,
          [uid, ...extraParams, ...whereParams]
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT p.*,
                  CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
                  0 AS canFavourite,
                  cls.structured AS classificationJson
           FROM recommendations r
           JOIN projects p ON p.id = r.projectId
           LEFT JOIN favourites f
           ON f.projectId = p.id AND f.userId = ?
           LEFT JOIN project_classifications cls ON cls.id = (
             SELECT MAX(id) FROM project_classifications WHERE project_id = p.id
           )
           WHERE r.recommenderUserId = ?
           ${whereSql}
           ORDER BY p.${sort} ${order}, p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, uid, ...extraParams, ...whereParams]
        );

        enrichPricing(rows);
        return respond(rows, total);
      }

      return respond([], 0);
    } catch (err) {
      log.error?.("[projects.get] error", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
