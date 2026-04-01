// server/routes/tradesmen/shares.get.js

/**
 * GET /api/tradesmen/shares
 * Auth: required (homeowner or tradesman).
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, PUBLIC_API_BASE = "" } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/shares.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  // ---- Helpers ----
  async function tableExists(name) {
    try {
      const pattern = String(name)
        .replace(/\\/g, "\\\\")
        .replace(/_/g, "\\_")
        .replace(/%/g, "\\%")
        .replace(/'/g, "\\'");
      const sql = `SHOW TABLES LIKE '${pattern}'`;
      const rows = await mysqlQuery(sql);
      return rows.length > 0;
    } catch (e) {
      log.warn(`${TAG} tableExists(${name}) failed`, { error: e?.message });
      return false;
    }
  }

  const ABS_BASE = String(PUBLIC_API_BASE || "").replace(/\/+$/g, "");
  const toRelUrl = (filename) => (filename ? `/uploads/${filename}` : "");
  const toAbsUrl = (rel) => (rel ? `${ABS_BASE}${rel}` : "");

  const normalisePhotos = (photosJson) => {
    if (!photosJson) return [];

    let raw = photosJson;
    try {
      if (typeof photosJson === "string") raw = JSON.parse(photosJson);
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];

    return raw
      .map((p) => {
        const filename = p.filename || "";
        let rel = p.url || (filename ? toRelUrl(filename) : "");
        rel = rel.replace(/^\/api\/uploads\//, "/uploads/");
        const abs = p.absoluteUrl
          ? p.absoluteUrl.replace(/\/api\/uploads\//, "/uploads/")
          : toAbsUrl(rel);

        return { ...p, filename, url: rel, absoluteUrl: abs };
      })
      .filter((p) => p.url || p.absoluteUrl);
  };

  // ---- Route ----
  router.get("/tradesmen/shares", auth, async (req, res) => {
    const uid = req.user?.uid || req.user?.id;

    log.info(`${TAG} request`, {
      viewerUid: uid,
      query: req.query,
    });

    try {
      if (!uid) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Ensure tables exist
      const hasTradeShares = await tableExists("trade_shares");
      const hasProjects = await tableExists("projects");

      if (!hasTradeShares || !hasProjects) {
        log.warn(`${TAG} missing required tables`, {
          hasTradeShares,
          hasProjects,
        });
        return res.json({ shares: [], total: 0 });
      }

      const hasTradesmenTable = await tableExists("tradesmen");

      // Parse filters
      const rawProjectId =
        req.query.projectId || req.query.pid || req.query.project_id || null;
      const rawShareId = req.query.shareId || req.query.id || null;
      const rawTradesman =
        req.query.tradesmanUid ||
        req.query.tradesmanId ||
        req.query.builderId ||
        null;

      const projectId = rawProjectId
        ? Number(String(rawProjectId).trim())
        : NaN;
      const shareId = rawShareId ? Number(String(rawShareId).trim()) : NaN;
      const tradesmanUid =
        rawTradesman && String(rawTradesman).trim().length > 0
          ? String(rawTradesman).trim()
          : null;

      const limitReq = parseInt(String(req.query.limit ?? "50"), 10);
      const limit = Math.min(
        200,
        Math.max(1, Number.isFinite(limitReq) ? limitReq : 50)
      );

      log.info(`${TAG} parsed filters`, {
        projectId,
        shareId,
        tradesmanUid,
        limit,
      });

      // Visibility
      const where = ["(p.ownerUserId = ? OR ts.tradesman_uid = ?)"];
      const params = [String(uid), String(uid)];

      if (Number.isFinite(projectId)) {
        where.push("ts.project_id = ?");
        params.push(projectId);
      }
      if (Number.isFinite(shareId)) {
        where.push("ts.id = ?");
        params.push(shareId);
      }
      if (tradesmanUid) {
        where.push("ts.tradesman_uid = ?");
        params.push(tradesmanUid);
      }

      // Select cols
      const selectCols = [
        "ts.id",
        "ts.project_id",
        "ts.tradesman_uid",
        "ts.photos_json",
        "ts.message",
        "ts.created_at",
        "p.name AS project_name",
      ];
      const joinTradesmen = hasTradesmenTable
        ? "LEFT JOIN tradesmen t ON t.user_id = ts.tradesman_uid"
        : "";

      if (hasTradesmenTable) {
        selectCols.push("t.company_name AS tradesman_company_name");
        selectCols.push("t.profile_picture_url AS tradesman_profile_picture_url");
      }

      const sql = `
        SELECT
          ${selectCols.join(", ")}
        FROM trade_shares ts
        JOIN projects p
          ON p.id = ts.project_id
        ${joinTradesmen}
        WHERE ${where.join(" AND ")}
        ORDER BY ts.created_at DESC, ts.id DESC
        LIMIT ${limit}
      `;

      const rows = await mysqlQuery(sql, params);

      const shares = rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project_name || null,
        tradesmanUid: r.tradesman_uid,
        companyName: r.tradesman_company_name || null,
        primaryPhotoUrl: r.tradesman_profile_picture_url || null,
        photos: normalisePhotos(r.photos_json),
        message: r.message || "",
        createdAt: r.created_at,
      }));

      log.info(`${TAG} returning shares`, {
        count: shares.length,
        viewerUid: uid,
      });

      return res.json({
        shares,
        total: shares.length,
      });
    } catch (e) {
      log.error(`${TAG} failed`, {
        error: e?.message,
        stack: e?.stack,
      });
      return res.status(500).json({
        error: "TRADESMAN_SHARES_FETCH_FAILED",
        message: e?.message || String(e),
      });
    }
  });
};
