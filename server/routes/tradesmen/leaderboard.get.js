module.exports = (router, ctx) => {
  const { auth, mysqlQuery, extractLocationTokens } = ctx;
  const log = ctx.log || console;

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/tradesmen/leaderboard";
  const TAG = "[tradesmen/leaderboard.get]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

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

    try {
      const rows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      const role = String(rows?.[0]?.role || "user").toLowerCase();

      const allowlist = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();

      return role === "admin" || allowlist.includes(email);
    } catch (err) {
      log.warn(`${TAG} isAdmin lookup failed:`, err?.message || err);
      return false;
    }
  }

  // --------------------------------------------------------
  // Handler
  // --------------------------------------------------------
  const handler = async (req, res) => {
    log.info(`${TAG} request`, {
      uid: req.user?.uid || null,
      q: req.query.q || "",
      trade: req.query.trade || "",
      near: req.query.near || "",
    });

    try {
      if (!(await isAdmin(req))) {
        log.warn(`${TAG} forbidden – not admin`);
        return res.status(403).json({
          error: "forbidden",
          details: "admin role required",
        });
      }

      /* ---------------- Parse filters ---------------- */
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

      /* ---------------- Always-on filter: hide promoted lead shadows ----------------
       *
       * `POST /api/admin/tradesmen/:id/status` (the promotion endpoint)
       * deliberately keeps the original `lead_*` row around as an audit
       * shadow, marking it draft/unverified, while creating a new active
       * row keyed on the real Firebase uid. We don't want those shadows
       * cluttering the admin leaderboard, but we DO want un-promoted
       * leads (real triage candidates) to remain visible.
       *
       * A lead is treated as a shadow when there's a non-lead row sharing
       * either the same email OR the same company_name. The email match
       * is the primary signal (the promotion clones email across), but
       * some fixtures have NULL email so we fall back to company_name to
       * avoid leaving emailless shadows visible. False positives (two
       * unrelated leads with the same company name) cost only a missed
       * row on this admin screen — admins can still triage them via
       * other tooling. See server/routes/admin/tradesman.status.post.js.
       */
      where.push(`
        NOT (
          t.user_id LIKE 'lead\\_%'
          AND EXISTS (
            SELECT 1 FROM tradesmen t2
             WHERE t2.user_id NOT LIKE 'lead\\_%'
               AND (
                 (
                   COALESCE(t2.email, '') <> ''
                   AND LOWER(t2.email) = LOWER(t.email)
                 )
                 OR
                 (
                   COALESCE(t2.company_name, '') <> ''
                   AND LOWER(t2.company_name) = LOWER(t.company_name)
                 )
               )
          )
        )
      `);

      /* ---------------- Search filters ---------------- */
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

      if (webVerifiedOnly) where.push(`COALESCE(t.web_verified, 0) = 1`);
      if (chVerifiedOnly)
        where.push(`LOWER(COALESCE(t.ch_status,'')) = 'verified'`);
      if (hasPhotos) where.push(`COALESCE(t.photo_count, 0) >= 3`);
      if (hasDocs) where.push(`COALESCE(t.supporting_doc_count, 0) >= 2`);
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

      /* ---------------- NEAR filter ---------------- */
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
        } catch (err) {
          log.warn(`${TAG} extractLocationTokens error:`, err?.message || err);
          where.push(`LOWER(t.service_areas) LIKE ?`);
          params.push(`%${near.toLowerCase()}%`);
        }
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      /* ---------------- UNLOCK SELECTS ---------------- */
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

      /* ---------------- COUNT ---------------- */
      const countRows = await mysqlQuery(
        `SELECT COUNT(*) AS c FROM tradesmen t ${whereSql}`,
        params
      );
      const total = Number(countRows?.[0]?.c || 0);

      log.info(`${TAG} total=${total} limit=${limit} offset=${offset}`);

      /* ---------------- FETCH ---------------- */
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

          COALESCE(t.status, 'draft') AS status,
          COALESCE(t.plan, 'free') AS plan,
          t.purchased_plan,

          (
            SELECT s.status
            FROM payments_subscription s
            WHERE s.buyer_uid = t.user_id
            ORDER BY s.id DESC
            LIMIT 1
          ) AS subscription_status,

          (
            SELECT s.plan_id
            FROM payments_subscription s
            WHERE s.buyer_uid = t.user_id
            ORDER BY s.id DESC
            LIMIT 1
          ) AS latest_subscription_plan,

          -- Live tier-model subscription (builder_subscriptions) - the
          -- source of truth for the swipe gate. NULL when not subscribed
          -- or the row is canceled / expired.
          bs.tier_id              AS builder_sub_tier,
          bs.current_period_end   AS builder_sub_period_end,

          ${unlockSelect},

          COALESCE(hs.total,    0) AS hires_total,
          COALESCE(hs.accepted, 0) AS hires_accepted,
          COALESCE(hs.declined, 0) AS hires_declined,
          COALESCE(hs.pending,  0) AS hires_pending,

          t.created_at,
          t.updated_at
        FROM tradesmen t
        LEFT JOIN (
          SELECT
            tradesmanUserId,
            COUNT(*)                                           AS total,
            SUM(status = 'accepted')                            AS accepted,
            SUM(status = 'declined')                            AS declined,
            SUM(status IN ('pending','pending_invite'))        AS pending
          FROM hires
          WHERE tradesmanUserId IS NOT NULL
          GROUP BY tradesmanUserId
        ) hs ON hs.tradesmanUserId = t.user_id
        LEFT JOIN builder_subscriptions bs
          ON bs.user_id = t.user_id
         AND bs.status = 'active'
         AND bs.current_period_end > NOW()
        ${whereSql}
        ORDER BY t.vmb_score DESC, t.updated_at DESC, t.company_name ASC
        LIMIT ${limit} OFFSET ${offset}
        `,
        params
      );

      /* ---------------- MAP TO UI FORMAT ---------------- */
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

        const subStatus = (r.subscription_status || "").toLowerCase().trim();

        let pendingPlan = null;
        if (subStatus === "pending_admin") {
          pendingPlan = r.latest_subscription_plan || null;
        }
        if (subStatus === "active") pendingPlan = null;

        const hasGlobalContact = plan === "gold" && subStatus === "active";

        return {
          userId: r.user_id,
          company: r.company_name,
          status: String(r.status || "draft"),

          plan,
          purchasedPlan: r.purchased_plan || null,
          pendingPlan,
          hasGlobalContact,

          openFlags: 0,
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

          hires: {
            total: Number(r.hires_total || 0),
            accepted: Number(r.hires_accepted || 0),
            declined: Number(r.hires_declined || 0),
            pending: Number(r.hires_pending || 0),
          },

          createdAt: r.created_at,
          updatedAt: r.updated_at,

          oneOffUnlocks: isGold ? 0 : Number(r.approved_unlocks || 0),
          oneOffUnlocksPending: isGold ? 0 : Number(r.pending_unlocks || 0),
          pendingUnlockProjectIds: isGold ? [] : pendingIds,

          // New tier-model subscription (week_1 / week_2 / month_1) -
          // null when not currently subscribed via the new flow. Drives
          // the swipe gate and the admin Subscription action group.
          subscriptionTierId: r.builder_sub_tier || null,
          subscriptionPeriodEnd: r.builder_sub_period_end || null,
        };
      });

      log.info(`${TAG} returning ${items.length} items`);

      return res.json({ items, total, offset, limit });
    } catch (e) {
      log.error(`${TAG} server error`, e);
      return res.status(500).json({ error: "server_error" });
    }
  };

  router.get(PATH, auth, handler);

  if (!ctx.__logged_tradesmen_leaderboard_get) {
    ctx.__logged_tradesmen_leaderboard_get = true;
    log.info(`[routes] mounted: GET ${API_BASE}${PATH}`);
  }
};
