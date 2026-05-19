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
      500,
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
          r.unreadCount = 0;
        }
        return;
      }
      try {
        const placeholders = ids.map(() => "?").join(",");
        // A "true" match requires both sides to have right-swiped, so
        // we filter on homeowner_swiped_at IS NOT NULL. Without this
        // filter, paid_unlock rows (which jump straight to
        // status='matched' but only have the builder's swipe set) would
        // be counted as matches even though the homeowner hasn't
        // reciprocated yet. Those rows belong on the INTERESTS pill
        // until the homeowner actually swipes back.
        const countRows = await mysqlQuery(
          `SELECT project_id, status, COUNT(*) AS c
             FROM swipe_interest
            WHERE project_id IN (${placeholders})
              AND (
                (status = 'matched' AND homeowner_swiped_at IS NOT NULL)
                OR status = 'pending'
              )
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

      // Interested / paid-priority counts per project. These power the
      // amber "N interested" + emerald "N priority" pills on the
      // homeowner's /projects list (S1 / S3 in the messaging model).
      // "Interested" = trades who right-swiped but the homeowner hasn't
      // reciprocated yet. "Priority" is the subset where the trade paid
      // for paid_unlock placement. No bell notification fires for these
      // events; this pill is the only signal that there's something
      // worth opening in the shortlist.
      try {
        const placeholders = ids.map(() => "?").join(",");
        // We count rows where the trade has swiped right but the
        // homeowner hasn't yet acted. Filtering on the timestamp fields
        // (not the status column) covers both paths:
        //   - status='pending' for subscribed/recommended right-swipes
        //   - status='matched' for paid_unlock, which skips the pending
        //     state because the trade paid to jump the queue
        // Declined/expired rows are excluded.
        const interestRows = await mysqlQuery(
          `SELECT project_id,
                  SUM(CASE WHEN source = 'paid_unlock' THEN 1 ELSE 0 END) AS paidCount,
                  COUNT(*) AS totalCount
             FROM swipe_interest
            WHERE project_id IN (${placeholders})
              AND builder_swiped_at IS NOT NULL
              AND homeowner_swiped_at IS NULL
              AND status IN ('pending', 'matched')
            GROUP BY project_id`,
          ids,
        );
        const interestById = new Map();
        const paidById = new Map();
        for (const row of interestRows) {
          const pid = Number(row.project_id);
          interestById.set(pid, Number(row.totalCount) || 0);
          paidById.set(pid, Number(row.paidCount) || 0);
        }
        for (const r of rows) {
          r.interestCount = interestById.get(Number(r.id)) || 0;
          r.paidPriorityCount = paidById.get(Number(r.id)) || 0;
        }
      } catch (e) {
        log.warn?.("[projects.get] interest count enrichment failed", {
          error: e?.message,
        });
        for (const r of rows) {
          r.interestCount = 0;
          r.paidPriorityCount = 0;
        }
      }

      // Unread chat-messages per project. Unread = a message from the
      // other party (sender_uid <> homeowner uid) that's newer than the
      // most recent message the homeowner sent on that thread. Same rule
      // /api/matches uses for the bell, just rolled up per project_id.
      // chat_messages may be absent in older test mocks, so we degrade
      // to 0 across the board on any error.
      try {
        const placeholders = ids.map(() => "?").join(",");
        const unreadRows = await mysqlQuery(
          `SELECT si.project_id AS projectId, COUNT(*) AS c
             FROM chat_messages cm
             JOIN swipe_interest si ON si.id = cm.match_id
             LEFT JOIN (
               SELECT match_id, MAX(created_at) AS myLast
                 FROM chat_messages
                WHERE sender_uid = ?
                GROUP BY match_id
             ) mine ON mine.match_id = cm.match_id
            WHERE si.project_id IN (${placeholders})
              AND si.status = 'matched'
              AND cm.sender_uid <> ?
              AND (mine.myLast IS NULL OR cm.created_at > mine.myLast)
            GROUP BY si.project_id`,
          [uid, ...ids, uid],
        );
        const unreadById = new Map();
        for (const row of unreadRows) {
          unreadById.set(Number(row.projectId), Number(row.c) || 0);
        }
        for (const r of rows) {
          r.unreadCount = unreadById.get(Number(r.id)) || 0;
        }
      } catch (e) {
        log.warn?.("[projects.get] unread count enrichment failed", {
          error: e?.message,
        });
        for (const r of rows) {
          r.unreadCount = 0;
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

        // Archived projects (closed with didGoAhead=false) are invisible
        // to the owner across every tab — they live in the DB for
        // analytics only.
        baseParts.push(`p.status <> 'archived'`);

        if (rawStatus !== "all") {
          baseParts.push(`p.status = ?`);
          baseParams.push(rawStatus);
        } else {
          // Completed projects belong in the Completed tab, not the
          // generic "my jobs" / Live view. Only hide them when the
          // caller hasn't explicitly asked for them via ?status=completed.
          baseParts.push(`p.status <> 'completed'`);
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

        // Mine-tab ordering: matched-count first, then the caller's
        // chosen sort, then id as a stable tiebreaker. Putting matched
        // projects ahead of unmatched ones means a new mutual swipe
        // bubbles a card to the top of the homeowner's list on the
        // next refresh - matches what the user expects when activity
        // is happening.
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
           ORDER BY
             (SELECT COUNT(*) FROM swipe_interest si
               WHERE si.project_id = p.id AND si.status = 'matched') DESC,
             p.${sort} ${order},
             p.id ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        enrichPricing(rows);
        return respond(rows, total);
      }

      // ********** ARCHIVED **********
      // Archived projects are invisible to the owner. The tab itself
      // doesn't surface in the UI any more, but if a stale URL hits
      // /api/projects?tab=archived we return an empty page rather than
      // 404 so the client gracefully renders the empty state.
      if (tab === "archived") {
        return respond([], 0);
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

        // Only true completions (didGoAhead = Yes) appear in Completed.
        // Archived projects are hidden from the owner everywhere.
        const statusFilter = `p.status = 'completed'`;

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
