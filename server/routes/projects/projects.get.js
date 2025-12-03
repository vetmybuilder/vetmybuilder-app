// server/routes/projects/projects.get.js
/**
 * GET /api/projects
 * Auth: required
 * Query:
 *   tab=mine|community|favourites|archived|recommended|completed|completedCommunity (default: mine)
 *   name, type, location, property
 *   status=all|pending|live|archived (default: all)   -- only affects "mine"
 *   sort=createdAt|name (default: createdAt)
 *   order=asc|desc (default: desc)
 *   page=1.., pageSize=1..50 (defaults: 1, 10)
 * Response: { items, total, page, pageSize }
 */
module.exports = (router, ctx) => {
  const { auth, touchUserMw, mysqlQuery } = ctx;

  router.get("/projects", auth, touchUserMw, async (req, res) => {
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

    // Filters (free-text)
    const qName = String(req.query.name ?? "").trim();
    const qType = String(req.query.type ?? "").trim();
    const qLocation = String(req.query.location ?? "").trim();
    const qProperty = String(req.query.property ?? "").trim();
    const rawStatus = String(req.query.status ?? "all").toLowerCase();

    // Sorting
    const allowedSort = new Set(["createdAt", "name"]);
    const sort = allowedSort.has(String(req.query.sort))
      ? String(req.query.sort)
      : "createdAt";
    const order =
      String(req.query.order).toLowerCase() === "asc" ? "ASC" : "DESC";

    // Paging
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10))
    );
    const offset = (page - 1) * pageSize;

    // -------- helpers --------
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

    const respond = (rows, total) =>
      res.json({ items: rows, total, page, pageSize });

    // deriveAreaTokens now uses MySQL
    const deriveAreaTokens = async () => {
      const tokens = [];

      // 1) users table
      const meRows = await mysqlQuery(
        `SELECT locationRaw, postcodeOutward, postcodeSector, postcode, city
           FROM users
          WHERE uid = ?`,
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

      // 2) fall back to tradesmen.service_areas (comma/space separated)
      if (tokens.length === 0) {
        const tRows = await mysqlQuery(
          `SELECT service_areas
             FROM tradesmen
            WHERE user_id = ?
            LIMIT 1`,
          [uid]
        );
        const t = tRows[0] || null;
        const sa =
          t && typeof t === "object" ? String(t.service_areas || "") : "";
        if (sa) {
          for (const part of sa.split(/[,\s]+/)) {
            const v = part.trim();
            if (v) tokens.push(v);
          }
        }
      }

      // 3) final fallback: the explicit location filter (qLocation)
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
      // -------- tabs --------

      // MINE
      if (tab === "mine") {
        const baseParts = ["p.ownerUserId = ?"];
        const baseParams = [uid];

        if (rawStatus === "all") {
          baseParts.push(`p.status <> 'archived'`);
        } else {
          baseParts.push(`p.status = ?`);
          baseParams.push(rawStatus);
        }

        const { sql, params } = applyWhere(baseParts, baseParams);

        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
             FROM projects p
            ${sql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        const rows = await mysqlQuery(
          `SELECT p.*,
                  CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
                  0 AS canFavourite
             FROM projects p
             LEFT JOIN project_closures pc ON pc.projectId = p.id
             LEFT JOIN favourites f
               ON f.projectId = p.id AND f.userId = ?
            ${sql}
            ORDER BY p.${sort} ${order}
            LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // ARCHIVED (mine)
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
             LEFT JOIN favourites f
               ON f.projectId = p.id AND f.userId = ?
            ${sql}
            ORDER BY p.${sort} ${order}
            LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // COMPLETED (mine) – includes archived+didGoAhead
      if (tab === "completed") {
        // owner filter only; status is handled via statusFilter
        const baseParts = ["p.ownerUserId = ?"];
        const baseParams = [uid];
        const { sql: baseSql, params } = applyWhere(baseParts, baseParams);

        const statusFilter = `
          (p.status = 'completed'
           OR (p.status = 'archived' AND pc.didGoAhead = 1))
        `.trim();

        const completedSql = baseSql
          ? `${baseSql} AND ${statusFilter}`
          : `WHERE ${statusFilter}`;

        // total
        const countRows = await mysqlQuery(
          `SELECT COUNT(*) AS c
             FROM projects p
             LEFT JOIN project_closures pc ON pc.projectId = p.id
            ${completedSql}`,
          params
        );
        const total = countRows[0]?.c || 0;

        // rows
        const rows = await mysqlQuery(
          `SELECT
              p.*,
              pc.winnerRecommendationId AS _winnerRecommendationId,
              EXISTS(
                SELECT 1
                  FROM project_closure_photos cpp
                 WHERE cpp.projectId = p.id
              ) AS _hasClosurePhotos,
              CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
              0 AS canFavourite
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           ${completedSql}
           ORDER BY p.${sort} ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // COMPLETED COMMUNITY (others in my area) – includes archived+didGoAhead
      if (tab === "completedcommunity") {
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
           OR (p.status = 'archived' AND pc.didGoAhead = 1))
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
              EXISTS(
                SELECT 1
                  FROM project_closure_photos cpp
                 WHERE cpp.projectId = p.id
              ) AS _hasClosurePhotos,
              CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
              0 AS canFavourite
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           ${completedSql}
           ORDER BY p.${sort} ${order}
           LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...params]
        );

        return respond(rows, total);
      }

      // COMMUNITY (live, not mine, area-aware)
      if (tab === "community") {
        const normTokens = await deriveAreaTokens();

        const baseParts = [
          `p.status = 'live'`,
          `p.ownerUserId <> ?`,
          `NOT EXISTS (
             SELECT 1
               FROM favourites fx
              WHERE fx.projectId = p.id
                AND fx.userId = ?
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
                  1 AS canFavourite
             FROM projects p
            ${sql}
            ORDER BY p.${sort} ${order}
            LIMIT ${pageSize} OFFSET ${offset}`,
          params
        );

        return respond(rows, total);
      }

      // FAVOURITES
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
                  0 AS canFavourite
             FROM favourites f
             JOIN projects p ON p.id = f.projectId
            WHERE f.userId = ?
              ${whereSQL}
            ORDER BY p.${sort} ${order}
            LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, ...whereParams]
        );

        return respond(rows, total);
      }

      // RECOMMENDED (legacy)
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
                  0 AS canFavourite
             FROM recommendations r
             JOIN projects p ON p.id = r.projectId
             LEFT JOIN favourites f
               ON f.projectId = p.id AND f.userId = ?
            WHERE r.recommenderUserId = ?
              ${whereSql}
            ORDER BY p.${sort} ${order}
            LIMIT ${pageSize} OFFSET ${offset}`,
          [uid, uid, ...extraParams, ...whereParams]
        );

        return respond(rows, total);
      }

      // default
      return respond([], 0);
    } catch (err) {
      console.error("Error in /api/projects (MySQL):", err);
      return res.status(500).json({ error: "internal_error" });
    }
  });
};

// // server/routes/projects/projects.get.js
// /**
//  * GET /api/projects
//  * Auth: required
//  * Query:
//  *   tab=mine|community|favourites|archived|recommended|completed|completedCommunity (default: mine)
//  *   name, type, location, property
//  *   status=all|pending|live|archived (default: all)   -- only affects "mine"
//  *   sort=createdAt|name (default: createdAt)
//  *   order=asc|desc (default: desc)
//  *   page=1.., pageSize=1..50 (defaults: 1, 10)
//  * Response: { items, total, page, pageSize }
//  */
// module.exports = (router, ctx) => {
//   const { auth, touchUserMw, mysqlQuery } = ctx;

//   router.get("/projects", auth, touchUserMw, async (req, res) => {
//     const uid = req.user.uid;

//     res.set("Cache-Control", "no-store");
//     res.set("Vary", "Authorization, Cookie");

//     const allowedTabs = new Set([
//       "mine",
//       "community",
//       "favourites",
//       "archived",
//       "completed",
//       "completedcommunity",
//       "recommended",
//     ]);
//     const tabRaw = String(req.query.tab || "mine").toLowerCase();
//     const tab = allowedTabs.has(tabRaw) ? tabRaw : "mine";

//     // Filters (free-text)
//     const qName = String(req.query.name ?? "").trim();
//     const qType = String(req.query.type ?? "").trim();
//     const qLocation = String(req.query.location ?? "").trim();
//     const qProperty = String(req.query.property ?? "").trim();
//     const rawStatus = String(req.query.status ?? "all").toLowerCase();

//     // Sorting
//     const allowedSort = new Set(["createdAt", "name"]);
//     const sort = allowedSort.has(String(req.query.sort))
//       ? String(req.query.sort)
//       : "createdAt";
//     const order =
//       String(req.query.order).toLowerCase() === "asc" ? "ASC" : "DESC";

//     // Paging
//     const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
//     const pageSize = Math.min(
//       50,
//       Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10))
//     );
//     const offset = (page - 1) * pageSize;

//     // -------- helpers --------
//     const whereParts = [];
//     const whereParams = [];

//     if (qName) {
//       whereParts.push(`p.name LIKE ?`);
//       whereParams.push(`%${qName}%`);
//     }
//     if (qType) {
//       whereParts.push(`p.type LIKE ?`);
//       whereParams.push(`%${qType}%`);
//     }
//     if (qLocation) {
//       whereParts.push(`p.location LIKE ?`);
//       whereParams.push(`%${qLocation}%`);
//     }
//     if (qProperty) {
//       whereParts.push(`p.propertyType LIKE ?`);
//       whereParams.push(`%${qProperty}%`);
//     }

//     const applyWhere = (baseParts = [], baseParams = []) => {
//       const parts = [...baseParts, ...whereParts];
//       const sql = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
//       const params = [...baseParams, ...whereParams];
//       return { sql, params };
//     };

//     const respond = (rows, total) =>
//       res.json({ items: rows, total, page, pageSize });

//     // deriveAreaTokens now uses MySQL
//     const deriveAreaTokens = async () => {
//       const tokens = [];

//       // 1) users table
//       const meRows = await mysqlQuery(
//         `SELECT locationRaw, postcodeOutward, postcodeSector, postcode, city
//            FROM users
//           WHERE uid = ?`,
//         [uid]
//       );
//       const me = meRows[0] || null;
//       if (me) {
//         const fields = [
//           me.locationRaw,
//           me.postcodeOutward,
//           me.postcodeSector,
//           me.postcode,
//           me.city,
//         ];
//         for (const v of fields) {
//           const s = String(v ?? "").trim();
//           if (s) tokens.push(s);
//         }
//       }

//       // 2) fall back to tradesmen.service_areas (comma/space separated)
//       if (tokens.length === 0) {
//         const tRows = await mysqlQuery(
//           `SELECT service_areas
//              FROM tradesmen
//             WHERE user_id = ?
//             LIMIT 1`,
//           [uid]
//         );
//         const t = tRows[0] || null;
//         const sa =
//           t && typeof t === "object" ? String(t.service_areas || "") : "";
//         if (sa) {
//           for (const part of sa.split(/[,\s]+/)) {
//             const v = part.trim();
//             if (v) tokens.push(v);
//           }
//         }
//       }

//       // 3) final fallback: the explicit location filter (qLocation)
//       if (tokens.length === 0 && qLocation) {
//         tokens.push(qLocation);
//       }

//       const norm = (s) =>
//         String(s || "")
//           .toLowerCase()
//           .replace(/\s+/g, "");
//       return Array.from(new Set(tokens.map(norm))).filter(Boolean);
//     };

//     try {
//       // -------- tabs --------

//       // MINE
//       if (tab === "mine") {
//         const baseParts = ["p.ownerUserId = ?"];
//         const baseParams = [uid];

//         if (rawStatus === "all") {
//           baseParts.push(`p.status <> 'archived'`);
//         } else {
//           baseParts.push(`p.status = ?`);
//           baseParams.push(rawStatus);
//         }

//         const { sql, params } = applyWhere(baseParts, baseParams);

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c
//              FROM projects p
//             ${sql}`,
//           params
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT p.*,
//                   CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
//                   0 AS canFavourite
//              FROM projects p
//              LEFT JOIN project_closures pc ON pc.projectId = p.id
//              LEFT JOIN favourites f
//                ON f.projectId = p.id AND f.userId = ?
//             ${sql}
//             ORDER BY p.${sort} ${order}
//             LIMIT ${pageSize} OFFSET ${offset}`,
//           [uid, ...params]
//         );

//         return respond(rows, total);
//       }

//       // ARCHIVED (mine)
//       if (tab === "archived") {
//         const baseParts = ["p.ownerUserId = ?", `p.status = 'archived'`];
//         const baseParams = [uid];
//         const { sql, params } = applyWhere(baseParts, baseParams);

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c FROM projects p ${sql}`,
//           params
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT p.*,
//                   CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
//                   0 AS canFavourite
//              FROM projects p
//              LEFT JOIN project_closures pc ON pc.projectId = p.id
//              LEFT JOIN favourites f
//                ON f.projectId = p.id AND f.userId = ?
//             ${sql}
//             ORDER BY p.${sort} ${order}
//             LIMIT ${pageSize} OFFSET ${offset}`,
//           [uid, ...params]
//         );

//         return respond(rows, total);
//       }

//       // COMPLETED (mine)
//       if (tab === "completed") {
//         const baseParts = ["p.ownerUserId = ?", `p.status = 'completed'`];
//         const baseParams = [uid];
//         const { sql, params } = applyWhere(baseParts, baseParams);

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c FROM projects p ${sql}`,
//           params
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT
//               p.*,
//               pc.winnerRecommendationId AS _winnerRecommendationId,
//               EXISTS(
//                 SELECT 1
//                   FROM project_closure_photos cpp
//                  WHERE cpp.projectId = p.id
//               ) AS _hasClosurePhotos,
//               CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
//               0 AS canFavourite
//            FROM projects p
//            LEFT JOIN project_closures pc ON pc.projectId = p.id
//            LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
//            ${sql}
//            ORDER BY p.${sort} ${order}
//            LIMIT ${pageSize} OFFSET ${offset}`,
//           [uid, ...params]
//         );

//         return respond(rows, total);
//       }

//       // COMPLETED COMMUNITY (others in my area)
//       if (tab === "completedcommunity") {
//         const normTokens = await deriveAreaTokens();

//         const baseParts = [`p.status = 'completed'`, `p.ownerUserId <> ?`];
//         const baseParams = [uid];

//         if (normTokens.length) {
//           const areaOr = normTokens
//             .map(
//               () => `REPLACE(LOWER(p.location),' ','') LIKE CONCAT('%', ?, '%')`
//             )
//             .join(" OR ");
//           baseParts.push(`(${areaOr})`);
//           baseParams.push(...normTokens);
//         }

//         const { sql, params } = applyWhere(baseParts, baseParams);

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c FROM projects p ${sql}`,
//           params
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT
//               p.*,
//               pc.winnerRecommendationId AS _winnerRecommendationId,
//               EXISTS(
//                 SELECT 1
//                   FROM project_closure_photos cpp
//                  WHERE cpp.projectId = p.id
//               ) AS _hasClosurePhotos,
//               CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
//               0 AS canFavourite
//            FROM projects p
//            LEFT JOIN project_closures pc ON pc.projectId = p.id
//            LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
//            ${sql}
//            ORDER BY p.${sort} ${order}
//            LIMIT ${pageSize} OFFSET ${offset}`,
//           [uid, ...params]
//         );

//         return respond(rows, total);
//       }

//       // COMMUNITY (live, not mine, area-aware)
//       if (tab === "community") {
//         const normTokens = await deriveAreaTokens();

//         const baseParts = [
//           `p.status = 'live'`,
//           `p.ownerUserId <> ?`,
//           `NOT EXISTS (
//              SELECT 1
//                FROM favourites fx
//               WHERE fx.projectId = p.id
//                 AND fx.userId = ?
//            )`,
//         ];
//         const baseParams = [uid, uid];

//         if (normTokens.length) {
//           const areaOr = normTokens
//             .map(
//               () => `REPLACE(LOWER(p.location),' ','') LIKE CONCAT('%', ?, '%')`
//             )
//             .join(" OR ");
//           baseParts.push(`(${areaOr})`);
//           baseParams.push(...normTokens);
//         }

//         const { sql, params } = applyWhere(baseParts, baseParams);

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c FROM projects p ${sql}`,
//           params
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT p.*,
//                   0 AS isFavourite,
//                   1 AS canFavourite
//              FROM projects p
//             ${sql}
//             ORDER BY p.${sort} ${order}
//             LIMIT ${pageSize} OFFSET ${offset}`,
//           params
//         );

//         return respond(rows, total);
//       }

//       // FAVOURITES
//       if (tab === "favourites") {
//         const whereSQL = whereParts.length
//           ? `AND ${whereParts.join(" AND ")}`
//           : "";

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c
//              FROM favourites f
//              JOIN projects p ON p.id = f.projectId
//             WHERE f.userId = ?
//               ${whereSQL}`,
//           [uid, ...whereParams]
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT p.*,
//                   1 AS isFavourite,
//                   0 AS canFavourite
//              FROM favourites f
//              JOIN projects p ON p.id = f.projectId
//             WHERE f.userId = ?
//               ${whereSQL}
//             ORDER BY p.${sort} ${order}
//             LIMIT ${pageSize} OFFSET ${offset}`,
//           [uid, ...whereParams]
//         );

//         return respond(rows, total);
//       }

//       // RECOMMENDED (legacy)
//       if (tab === "recommended") {
//         const extra = [];
//         const extraParams = [];
//         if (rawStatus !== "all") {
//           extra.push(`p.status = ?`);
//           extraParams.push(rawStatus);
//         }

//         const allParts = [...extra, ...whereParts];
//         const whereSql =
//           allParts.length > 0 ? `AND ${allParts.join(" AND ")}` : "";

//         const countRows = await mysqlQuery(
//           `SELECT COUNT(*) AS c
//              FROM recommendations r
//              JOIN projects p ON p.id = r.projectId
//             WHERE r.recommenderUserId = ?
//               ${whereSql}`,
//           [uid, ...extraParams, ...whereParams]
//         );
//         const total = countRows[0]?.c || 0;

//         const rows = await mysqlQuery(
//           `SELECT p.*,
//                   CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
//                   0 AS canFavourite
//              FROM recommendations r
//              JOIN projects p ON p.id = r.projectId
//              LEFT JOIN favourites f
//                ON f.projectId = p.id AND f.userId = ?
//             WHERE r.recommenderUserId = ?
//               ${whereSql}
//             ORDER BY p.${sort} ${order}
//             LIMIT ${pageSize} OFFSET ${offset}`,
//           [uid, uid, ...extraParams, ...whereParams]
//         );

//         return respond(rows, total);
//       }

//       // default
//       return respond([], 0);
//     } catch (err) {
//       console.error("Error in /api/projects (MySQL):", err);
//       return res.status(500).json({ error: "internal_error" });
//     }
//   });
// };
