module.exports = (router, ctx) => {
  const { auth, mysqlQuery, extractLocationTokens } = ctx;

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/tradesmen/leaderboard";
  const TAG = "[tradesmen/leaderboard.get]";

  const int = (v, d = 0) => {
    const n = Number.parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : d;
  };

  const truthy = (v) =>
    v === 1 ||
    v === true ||
    String(v).toLowerCase() === "1" ||
    String(v).toLowerCase() === "true";

  async function isAdmin(req) {
    const uid = req.user?.uid;
    if (!uid) return false;

    let role = "user";
    try {
      const rows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      role = String(rows?.[0]?.role || "user").toLowerCase();
    } catch (_) {}

    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const email = String(req.user?.email || "")
      .trim()
      .toLowerCase();

    return role === "admin" || allowlist.includes(email);
  }

  const handler = async (req, res) => {
    try {
      if (!(await isAdmin(req))) {
        return res.status(403).json({
          error: "forbidden",
          details: "admin role required",
        });
      }

      const q = String(req.query.q || "").trim();
      const trade = String(req.query.trade || "").trim();
      const near = String(req.query.near || "").trim();

      const webVerifiedOnly = truthy(req.query.webVerifiedOnly);
      const chVerifiedOnly = truthy(req.query.chVerifiedOnly);
      const hasPhotos = truthy(req.query.hasPhotos);
      const hasDocs = truthy(req.query.hasDocs);
      const hasDiscount = truthy(req.query.hasDiscount);
      const hasWebsites = truthy(req.query.hasWebsites);

      const limit = Math.max(1, Math.min(200, int(req.query.limit, 25)));
      const offset = Math.max(0, int(req.query.offset, 0));

      const where = [];
      const params = [];

      if (q) {
        const qLower = q.toLowerCase();
        where.push(`
          (
            LOWER(t.company_name) LIKE ?
            OR REPLACE(LOWER(COALESCE(t.company_number,'')), ' ', '') LIKE ?
          )
        `);
        params.push(`%${qLower}%`, `%${qLower.replace(/\s+/g, "")}%`);
      }

      if (trade) {
        where.push(`
          INSTR(
            CONCAT(',', LOWER(REPLACE(REPLACE(REPLACE(t.trade_types,';','|'),'|',','),' ','')), ','),
            ?
          ) > 0
        `);
        params.push(`,${trade.toLowerCase()},`);
      }

      if (webVerifiedOnly) {
        where.push(`COALESCE(t.web_verified, 0) = 1`);
      }

      if (chVerifiedOnly) {
        where.push(`LOWER(COALESCE(t.ch_status,'')) = 'verified'`);
      }

      if (hasPhotos) {
        where.push(`COALESCE(t.photo_count, 0) >= 3`);
      }

      if (hasDocs) {
        where.push(`COALESCE(t.supporting_doc_count, 0) >= 2`);
      }

      if (hasDiscount) {
        where.push(`
          (
            COALESCE(t.discount_min_percent, 0) > 0 OR
            COALESCE(t.discount_max_percent, 0) > 0
          )
        `);
      }

      if (hasWebsites) {
        where.push(`
          (
            COALESCE(t.web_url,'') <> '' OR
            INSTR(COALESCE(t.social_links_json,''), 'http') > 0
          )
        `);
      }

      if (near) {
        try {
          const tok = extractLocationTokens?.(near);
          const ors = [];
          if (tok?.full) {
            ors.push(`INSTR(CONCAT(',', t.service_areas, ','), ?) > 0`);
            params.push(`,${tok.full},`);
          }
          if (tok?.sector) {
            ors.push(`INSTR(CONCAT(',', t.service_areas, ','), ?) > 0`);
            params.push(`,${tok.sector},`);
          }
          if (tok?.outward) {
            ors.push(`INSTR(CONCAT(',', t.service_areas, ','), ?) > 0`);
            params.push(`,${tok.outward},`);
          }
          if (tok?.city) {
            ors.push(`LOWER(t.service_areas) LIKE ?`);
            params.push(`%${tok.city.toLowerCase()}%`);
          }
          if (ors.length) where.push(`(${ors.join(" OR ")})`);
        } catch (_) {
          where.push(`LOWER(t.service_areas) LIKE ?`);
          params.push(`%${near.toLowerCase()}%`);
        }
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      // ====== UNLOCK SELECTS ======
      const unlockSelect = `
        (
          SELECT COUNT(*)
          FROM payments_oneoff p
          WHERE p.user_id = t.user_id
            AND p.type = 'unlock_contact'
            AND LOWER(p.status) = 'active'
        ) AS approved_unlocks,

        (
          SELECT COUNT(*)
          FROM payments_oneoff p
          WHERE p.user_id = t.user_id
            AND p.type = 'unlock_contact'
            AND LOWER(p.status) = 'pending_admin'
        ) AS pending_unlocks,

        (
          SELECT GROUP_CONCAT(entity_id)
          FROM payments_oneoff p
          WHERE p.user_id = t.user_id
            AND p.type = 'unlock_contact'
            AND LOWER(p.status) = 'pending_admin'
        ) AS pending_ids
      `;

      // === total count ===
      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM tradesmen t ${whereSql}`,
        params
      );
      const total = Number(countRows?.[0]?.c || 0);

      // === fetch rows ===
      const rows = await mysqlQuery(
        `
        SELECT
          t.user_id,
          t.company_name,
          t.contact_name,
          t.phone,
          t.email,
          t.trade_types,
          t.service_areas,
          t.vmb_score,
          t.company_number,
          t.ch_status,
          t.web_verified,
          t.web_url,
          t.social_links_json,
          t.photo_count,
          t.discount_min_percent,
          t.discount_max_percent,
          t.warranty_months,
          t.supporting_doc_count,
          t.likes_count,
          t.wins_count,
          COALESCE(t.status, t.subscription_status, 'draft') AS status,
          COALESCE(t.plan, 'free') AS plan,
          t.purchased_plan,   -- RESTORED FOR UI
          ${unlockSelect},
          t.created_at,
          t.updated_at
        FROM tradesmen t
        ${whereSql}
        ORDER BY t.vmb_score DESC, t.updated_at DESC, t.company_name ASC
        LIMIT ${limit} OFFSET ${offset}
        `,
        params
      );

      // === map rows to UI shape ===
      const items = rows.map((r) => {
        let social = [];
        try {
          const parsed = JSON.parse(r.social_links_json || "[]");
          if (Array.isArray(parsed)) social = parsed.filter(Boolean);
        } catch (_) {}

        const urls = [];
        if (r.web_url) urls.push(r.web_url);
        urls.push(...social);

        const pendingIds = (r.pending_ids || "")
          .split(",")
          .map((x) => Number(x))
          .filter((n) => n > 0);

        const plan = r.plan || "free";
        const isGold = plan === "gold";

        return {
          userId: r.user_id,
          company: r.company_name,
          status: String(r.status || "draft"),
          plan,
          purchasedPlan: r.purchased_plan || null, // 🔥 RESTORED

          openFlags: 0, // still unused for now

          urls,
          score: Number(r.vmb_score || 0),
          companyNumber: r.company_number || null,
          chStatus: r.ch_status || null,
          webVerified: Number(r.web_verified || 0) === 1,
          website: r.web_url || null,
          trades: r.trade_types || "",
          areas: r.service_areas || "",
          photos: Number(r.photo_count || 0),
          discountMin: Number(r.discount_min_percent || 0),
          discountMax: Number(r.discount_max_percent || 0),
          warrantyMonths: Number(r.warranty_months || 0),
          docs: Number(r.supporting_doc_count || 0),
          likes: Number(r.likes_count || 0),
          wins: Number(r.wins_count || 0),
          createdAt: r.created_at,
          updatedAt: r.updated_at,

          oneOffUnlocks: isGold ? 0 : Number(r.approved_unlocks || 0),
          oneOffUnlocksPending: isGold ? 0 : Number(r.pending_unlocks || 0),
          pendingUnlockProjectIds: isGold ? [] : pendingIds,
        };
      });

      return res.json({ items, total, offset, limit });
    } catch (e) {
      console.error(TAG, e);
      return res.status(500).json({ error: "server_error" });
    }
  };

  router.get(PATH, auth, handler);

  if (!ctx.__logged_tradesmen_leaderboard_get) {
    ctx.__logged_tradesmen_leaderboard_get = true;
    console.log(`[routes] mounted: GET ${API_BASE}${PATH}`);
  }
};
