/**
 * GET /api/v2/projects   (also /api/projects if you mounted v2 there)
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
  const { db, auth, touchUserMw } = ctx;

  router.get("/projects", auth, touchUserMw, (req, res) => {
    const uid = req.user.uid;

    const allowedTabs = new Set([
      "mine",
      "community",
      "favourites",
      "archived",
      "completed",
      "completedCommunity", // NEW
      "recommended",
    ]);
    const tabRaw = String(req.query.tab || "mine").toLowerCase();
    const tab = allowedTabs.has(tabRaw) ? tabRaw : "mine";

    // Filters
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

    // Common WHERE builder (free text filters)
    const whereParts = [];
    const whereParams = [];

    if (qName) {
      whereParts.push(`p.name LIKE ? COLLATE NOCASE`);
      whereParams.push(`%${qName}%`);
    }
    if (qType) {
      whereParts.push(`p.type LIKE ? COLLATE NOCASE`);
      whereParams.push(`%${qType}%`);
    }
    if (qLocation) {
      whereParts.push(`p.location LIKE ? COLLATE NOCASE`);
      whereParams.push(`%${qLocation}%`);
    }
    if (qProperty) {
      whereParts.push(`p.propertyType LIKE ? COLLATE NOCASE`);
      whereParams.push(`%${qProperty}%`);
    }

    const applyWhere = (extraParts = [], extraParams = []) => {
      const parts = [...extraParts, ...whereParts];
      const sql = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
      const params = [...extraParams, ...whereParams];
      return { sql, params };
    };

    const respond = (rows, total) =>
      res.json({ items: rows, total, page, pageSize });

    // --- MINE ---
    if (tab === "mine") {
      const extra = [];
      const extraParams = [];

      // Exclude archived by default from My Projects
      if (rawStatus === "all") {
        extra.push(`p.status <> 'archived'`);
      } else {
        extra.push(`p.status = ?`);
        extraParams.push(rawStatus);
      }

      const { sql, params } = applyWhere(extra, extraParams);

      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM projects p
            ${
              sql
                ? sql.replace("WHERE", "WHERE p.ownerUserId = ? AND")
                : "WHERE p.ownerUserId = ?"
            }`
        )
        .get(uid, ...params);

      const rows = db
        .prepare(
          `SELECT p.*,
                  CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
                  0 AS canFavourite
             FROM projects p
             LEFT JOIN project_closures pc ON pc.projectId = p.id
             LEFT JOIN favourites f
               ON f.projectId = p.id AND f.userId = ?
            ${
              sql
                ? sql.replace("WHERE", "WHERE p.ownerUserId = ? AND")
                : "WHERE p.ownerUserId = ?"
            }
            ORDER BY p.${sort} ${order}
            LIMIT ? OFFSET ?`
        )
        .all(uid, uid, ...params, pageSize, offset);

      return respond(rows, countRow.c);
    }

    // --- ARCHIVED (mine only) ---
    if (tab === "archived") {
      const extra = [`p.ownerUserId = ?`, `p.status = 'archived'`];
      const extraParams = [uid];
      const { sql, params } = applyWhere(extra, extraParams);

      const countRow = db
        .prepare(`SELECT COUNT(*) AS c FROM projects p ${sql}`)
        .get(...params);

      const rows = db
        .prepare(
          `SELECT p.*,
                  CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
                  0 AS canFavourite
             FROM projects p
             LEFT JOIN project_closures pc ON pc.projectId = p.id
             LEFT JOIN favourites f
               ON f.projectId = p.id AND f.userId = ?
            ${sql}
            ORDER BY p.${sort} ${order}
            LIMIT ? OFFSET ?`
        )
        .all(uid, ...params, pageSize, offset);

      return respond(rows, countRow.c);
    }

    // --- COMPLETED (mine only) ---
    if (tab === "completed") {
      const extra = [`p.ownerUserId = ?`, `p.status = 'completed'`];
      const extraParams = [uid];
      const { sql, params } = applyWhere(extra, extraParams);

      const countRow = db
        .prepare(`SELECT COUNT(*) AS c FROM projects p ${sql}`)
        .get(...params);

      const rows = db
        .prepare(
          `SELECT
              p.*,
              pc.winnerRecommendationId AS _winnerRecommendationId,
              /* resolve winner builder id for UI linking (best-effort if present) */
              COALESCE(r.builderUserId, r.builderId, r.tradesmanId, r.tradesmanUserId, r.userId) AS _winnerBuilderId,
              /* tell UI whether there are any closure photos */
              EXISTS(SELECT 1 FROM project_closure_photos cpp WHERE cpp.projectId = p.id) AS _hasClosurePhotos,
              /* favourites info (legacy fields kept for UI compatibility) */
              CASE WHEN f.userId IS NULL THEN 0 ELSE 1 END AS isFavourite,
              0 AS canFavourite
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           LEFT JOIN recommendations r ON r.id = pc.winnerRecommendationId
           LEFT JOIN favourites f ON f.projectId = p.id AND f.userId = ?
           ${sql}
           ORDER BY p.${sort} ${order}
           LIMIT ? OFFSET ?`
        )
        .all(uid, ...params, pageSize, offset);

      return respond(rows, countRow.c);
    }

    // --- COMPLETED COMMUNITY (same area, not mine) ---
    if (tab === "completedCommunity") {
      // Pull viewer location tokens
      const me =
        db.prepare(`SELECT * FROM users WHERE uid = ?`).get(uid) || null;

      const candidateKeys = [
        "location",
        "postcodeOutward",
        "postcodeSector",
        "postcode",
        "city",
      ];
      const tokens = [];
      if (me && typeof me === "object") {
        for (const k of candidateKeys) {
          if (Object.prototype.hasOwnProperty.call(me, k)) {
            const v = String(me[k] ?? "").trim();
            if (v) tokens.push(v);
          }
        }
      }
      if (tokens.length === 0) return respond([], 0);

      const norm = (s) =>
        String(s || "")
          .toLowerCase()
          .replace(/\s+/g, "");
      const normTokens = Array.from(new Set(tokens.map(norm))).filter(Boolean);

      const areaOr = normTokens
        .map(() => `REPLACE(LOWER(p.location),' ','') LIKE '%' || ? || '%'`)
        .join(" OR ");
      const areaParams = normTokens;

      // Base: completed, not mine, IN AREA
      const baseParts = [`p.status = 'completed'`, `p.ownerUserId <> ?`];
      const baseParams = [uid];

      if (areaOr) {
        baseParts.push(`(${areaOr})`);
        baseParams.push(...areaParams);
      }

      const { sql, params } = applyWhere(baseParts, baseParams);

      const countRow = db
        .prepare(`SELECT COUNT(*) AS c FROM projects p ${sql}`)
        .get(...params);

      // Return similar fields as "completed" for UI parity
      const rows = db
        .prepare(
          `SELECT
              p.*,
              pc.winnerRecommendationId AS _winnerRecommendationId,
              EXISTS(SELECT 1 FROM project_closure_photos cpp WHERE cpp.projectId = p.id) AS _hasClosurePhotos,
              0 AS isFavourite,
              0 AS canFavourite
           FROM projects p
           LEFT JOIN project_closures pc ON pc.projectId = p.id
           ${sql}
           ORDER BY p.${sort} ${order}
           LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset);

      return respond(rows, countRow.c);
    }

    // --- COMMUNITY ---
    if (tab === "community") {
      const me =
        db.prepare(`SELECT * FROM users WHERE uid = ?`).get(uid) || null;

      const candidateKeys = [
        "location",
        "postcodeOutward",
        "postcodeSector",
        "postcode",
        "city",
      ];
      const tokens = [];
      if (me && typeof me === "object") {
        for (const k of candidateKeys) {
          if (Object.prototype.hasOwnProperty.call(me, k)) {
            const v = String(me[k] ?? "").trim();
            if (v) tokens.push(v);
          }
        }
      }
      if (tokens.length === 0) return respond([], 0);

      const norm = (s) =>
        String(s || "")
          .toLowerCase()
          .replace(/\s+/g, "");
      const normTokens = Array.from(new Set(tokens.map(norm))).filter(Boolean);

      const areaOr = normTokens
        .map(() => `REPLACE(LOWER(p.location),' ','') LIKE '%' || ? || '%'`)
        .join(" OR ");
      const areaParams = normTokens;

      const baseParts = [
        `p.status = 'live'`,
        `p.ownerUserId <> ?`,
        `NOT EXISTS (SELECT 1 FROM favourites fx WHERE fx.projectId = p.id AND fx.userId = ?)`,
      ];
      const baseParams = [uid, uid];

      if (areaOr) {
        baseParts.push(`(${areaOr})`);
        baseParams.push(...areaParams);
      }

      const { sql, params } = applyWhere(baseParts, baseParams);

      const countRow = db
        .prepare(`SELECT COUNT(*) AS c FROM projects p ${sql}`)
        .get(...params);

      const rows = db
        .prepare(
          `SELECT p.*,
                  0 AS isFavourite,
                  1 AS canFavourite
             FROM projects p
            ${sql}
            ORDER BY p.${sort} ${order}
            LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset);

      return respond(rows, countRow.c);
    }

    // --- FAVOURITES ---
    if (tab === "favourites") {
      const whereSQL = whereParts.length
        ? `AND ${whereParts.join(" AND ")}`
        : "";

      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM favourites f
             JOIN projects p ON p.id = f.projectId
            WHERE f.userId = ?
              ${whereSQL}`
        )
        .get(uid, ...whereParams);

      const rows = db
        .prepare(
          `SELECT p.*,
                  1 AS isFavourite,
                  0 AS canFavourite
             FROM favourites f
             JOIN projects p ON p.id = f.projectId
            WHERE f.userId = ?
              ${whereSQL}
            ORDER BY p.${sort} ${order}
            LIMIT ? OFFSET ?`
        )
        .all(uid, ...whereParams, pageSize, offset);

      return respond(rows, countRow.c);
    }

    // --- RECOMMENDED ---
    if (tab === "recommended") {
      const extra = [];
      if (rawStatus !== "all") {
        extra.push(`p.status = ?`);
        whereParams.push(rawStatus);
      }
      const whereSql =
        whereParts.length || extra.length
          ? `AND ${[...extra, ...whereParts].join(" AND ")}`
          : "";

      const countRow = db
        .prepare(
          `SELECT COUNT(*) AS c
             FROM recommendations r
             JOIN projects p ON p.id = r.projectId
            WHERE r.recommenderUserId = ?
              ${whereSql}`
        )
        .get(uid, ...whereParams);

      const rows = db
        .prepare(
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
            LIMIT ? OFFSET ?`
        )
        .all(uid, uid, ...whereParams, pageSize, offset);

      return respond(rows, countRow.c);
    }

    return respond([], 0);
  });
};
