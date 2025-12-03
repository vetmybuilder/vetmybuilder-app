// server/routes/admin/tradesman-status.post.js

/**
 * POST /api/admin/tradesmen/:uid/status
 * Body: { status: "draft"|"active"|"inactive", assignTo?: "<real-firebase-uid>" }
 * Auth: admin
 *
 * Behaviour:
 * - If :uid is a real UID -> update that row.
 * - If :uid is a lead_*:
 *     - For status !== "active": just update the lead row.
 *     - For status === "active":
 *         • If assignTo provided, promote/clone to that UID.
 *         • Else try to auto-match the real UID by the lead’s email from the `users` table.
 *           If a single match is found, promote/clone to that UID.
 *           Otherwise return 400 with a helpful message.
 *
 * NEW:
 * - Whenever a tradesman row ends up with status='active', we:
 *     • call Google Places via googlePlaces.lookupBusiness(...)
 *     • persist google_place_id, google_rating, google_reviews_count
 *     • return the enriched row in the response
 */
module.exports = (router, ctx) => {
  const { mysqlQuery, auth, extractLocationTokens } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { requireAdmin } = require("../../lib/roles");

  console.log("[routes] mounted: POST /admin/tradesmen/:uid/status");

  const isLeadId = (s) => String(s || "").startsWith("lead_");

  // Google Places helper (fake or real, depending on your lib)
  const { lookupBusiness } = (() => {
    try {
      return require("../../lib/googlePlaces");
    } catch {
      return {
        lookupBusiness: async () => null,
      };
    }
  })();

  async function upsertRoleTradesman(uid) {
    await mysqlQuery(
      `INSERT INTO user_roles (uid, role)
       VALUES (?, 'tradesman')
       ON DUPLICATE KEY UPDATE role = 'tradesman'`,
      [uid]
    );
  }

  // Clone a lead row into a real uid in MySQL.
  // We explicitly list columns to match your MySQL tradesmen schema.
  async function cloneIntoUid(srcRow, targetUid) {
    // Use existing DB timestamps if present so we don't inject ISO strings
    const createdAt = srcRow.created_at || null;
    const updatedAt = srcRow.updated_at || null;

    await mysqlQuery(
      `INSERT INTO tradesmen (
        user_id,
        company_name,
        contact_name,
        phone,
        email,
        trade_types,
        service_areas,
        created_at,
        updated_at,
        subscription_status,
        contact_credits,
        plan,
        plan_update_at,
        purchased_plan,
        company_number,
        ch_status,
        ch_name,
        ch_checked_at,
        ch_match_score,
        photo_count,
        supporting_doc_count,
        offers_discount,
        warranty_months,
        web_verified,
        web_url,
        vmb_score,
        vmb_badge,
        discount_min_percent,
        discount_max_percent,
        social_links_json,
        likes_count,
        wins_count,
        status,
        plan_updated_at,
        google_place_id,
        google_rating,
        google_reviews_count
      ) VALUES (
        ?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?
      )`,
      [
        // user_id (override)
        targetUid,
        srcRow.company_name,
        srcRow.contact_name,
        srcRow.phone,
        srcRow.email,
        srcRow.trade_types,
        srcRow.service_areas,
        createdAt, // may be null -> use default
        updatedAt, // may be null -> use default

        // 🔁 SUBSCRIPTION: keep whatever the lead had, or default to 'inactive'
        srcRow.subscription_status || "inactive",

        srcRow.contact_credits ?? 0,
        srcRow.plan || null,
        srcRow.plan_update_at || null,
        srcRow.purchased_plan || null,
        srcRow.company_number || null,
        srcRow.ch_status || null,
        srcRow.ch_name || null,
        srcRow.ch_checked_at || null,
        srcRow.ch_match_score ?? 0,
        srcRow.photo_count ?? 0,
        srcRow.supporting_doc_count ?? 0,
        srcRow.offers_discount ?? 0,
        srcRow.warranty_months ?? 0,
        srcRow.web_verified ?? 0,
        srcRow.web_url || null,
        srcRow.vmb_score ?? 0,
        srcRow.vmb_badge || "bronze",
        srcRow.discount_min_percent ?? 0,
        srcRow.discount_max_percent ?? 0,
        srcRow.social_links_json || null,
        srcRow.likes_count ?? 0,
        srcRow.wins_count ?? 0,

        // business status is active, but subscription is *not* auto-activated
        "active", // status
        srcRow.plan_updated_at || null,
        srcRow.google_place_id || null,
        srcRow.google_rating ?? null,
        srcRow.google_reviews_count ?? 0,
      ]
    );
  }

  // When promoting an existing uid row, only flip the *business* status.
  async function activateUidRow(uid) {
    await mysqlQuery(
      `UPDATE tradesmen
          SET status = 'active',
              updated_at = NOW()
        WHERE user_id = ?`,
      [uid]
    );
  }

  function getLocationHint(row) {
    try {
      const svc = row?.service_areas || "";
      if (typeof extractLocationTokens !== "function") return null;
      const toks = extractLocationTokens(svc) || {};
      return toks.full || toks.sector || toks.outward || toks.city || null;
    } catch {
      return null;
    }
  }

  /**
   * Enrich a tradesman row with Google data if missing.
   * Returns the (potentially) updated row.
   */
  async function enrichTradesmanWithGoogle(row) {
    if (!row) return row;

    // If already has Google fields, leave them alone
    if (
      row.google_place_id &&
      row.google_rating !== null &&
      row.google_rating !== undefined
    ) {
      return row;
    }

    const name = row.ch_name || row.company_name;
    if (!name) return row;

    const locationHint = getLocationHint(row);
    const companyNumber = row.company_number || null;

    try {
      const place = await lookupBusiness({
        name,
        locationHint,
        companyNumber,
      });

      if (!place) return row;

      try {
        await mysqlQuery(
          `UPDATE tradesmen
              SET google_place_id = ?,
                  google_rating = ?,
                  google_reviews_count = ?
            WHERE user_id = ?`,
          [
            place.placeId || null,
            place.rating ?? null,
            place.userRatingsTotal ?? 0,
            row.user_id,
          ]
        );
      } catch (e) {
        // If columns don't exist yet in MySQL, just log + continue
        console.warn(
          "[admin/tradesmen-status] Google enrichment UPDATE failed:",
          e?.message || e
        );
        return row;
      }

      const rows = await mysqlQuery(
        `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
        [row.user_id]
      );
      return rows[0] || row;
    } catch (e) {
      console.warn(
        "[admin/tradesmen-status] Google enrichment failed:",
        e?.message || e
      );
      return row;
    }
  }

  router.post(
    "/admin/tradesmen/:uid/status",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      try {
        const srcUid = String(req.params.uid || "");
        const status = String(req.body?.status || "").toLowerCase();
        const explicitAssignTo = req.body?.assignTo
          ? String(req.body.assignTo)
          : null;

        if (!srcUid) return res.status(400).json({ error: "uid required" });
        if (!["draft", "active", "inactive"].includes(status)) {
          return res.status(400).json({ error: "invalid status" });
        }

        const srcRows = await mysqlQuery(
          `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [srcUid]
        );
        const srcRow = srcRows[0] || null;

        if (!srcRow) {
          return res.status(404).json({ error: "tradesman not found" });
        }

        // --- Non-lead rows: just update *status* and leave subscription as-is ---
        if (!isLeadId(srcUid)) {
          await mysqlQuery(
            `UPDATE tradesmen
                SET status = ?,
                    updated_at = NOW()
              WHERE user_id = ?`,
            [status, srcUid]
          );

          const rows = await mysqlQuery(
            `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [srcUid]
          );
          let row = rows[0] || null;

          if (status === "active" && row) {
            row = await enrichTradesmanWithGoogle(row);
          }

          return res.json({ ok: true, tradesman: row, promoted: false });
        }

        // --- lead_* rows, status !== active: just toggle status on the lead ---
        if (status !== "active") {
          await mysqlQuery(
            `UPDATE tradesmen
                SET status = ?,
                    updated_at = NOW()
              WHERE user_id = ?`,
            [status, srcUid]
          );

          const rows = await mysqlQuery(
            `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [srcUid]
          );
          const row = rows[0] || null;

          return res.json({ ok: true, tradesman: row, promoted: false });
        }

        // --- lead_* + status === active: need to promote/clone to a real UID ---
        let targetUid = explicitAssignTo;

        if (!targetUid) {
          const leadEmail = String(srcRow?.email || "")
            .trim()
            .toLowerCase();
          if (leadEmail) {
            const matches = await mysqlQuery(
              `SELECT uid
                 FROM users
                WHERE LOWER(COALESCE(email,'')) = ?
              `,
              [leadEmail]
            );
            const uids = matches.map((r) => r.uid);

            if (uids.length === 1) {
              targetUid = uids[0];
            } else if (uids.length > 1) {
              return res.status(400).json({
                error: "multiple users share that email; specify assignTo",
                code: "ASSIGN_AMBIGUOUS",
                count: uids.length,
              });
            }
            // else: 0 matches -> fall through to require assignTo
          }
        }

        if (!targetUid) {
          return res.status(400).json({
            error:
              "assignTo (real user UID) required to activate this lead — no unique user found by email",
            code: "ASSIGN_UID_REQUIRED",
          });
        }

        // --- Transaction: promote / activate + role + mark lead as draft ---
        try {
          await mysqlQuery("START TRANSACTION");

          const existingRows = await mysqlQuery(
            `SELECT 1 AS ok FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [targetUid]
          );
          const hasExisting = existingRows.length > 0;

          if (!hasExisting) {
            await cloneIntoUid(srcRow, targetUid);
          } else {
            await activateUidRow(targetUid);
          }

          await upsertRoleTradesman(targetUid);

          // Keep lead row out of active views
          await mysqlQuery(
            `UPDATE tradesmen
                SET status = 'draft',
                    updated_at = NOW()
              WHERE user_id = ?`,
            [srcUid]
          );

          await mysqlQuery("COMMIT");
        } catch (e) {
          try {
            await mysqlQuery("ROLLBACK");
          } catch {}
          console.error("[admin status] promote by email failed", e);
          return res.status(500).json({ error: "server_error" });
        }

        const newRows = await mysqlQuery(
          `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [targetUid]
        );
        let row = newRows[0] || null;

        if (row) {
          row = await enrichTradesmanWithGoogle(row);
        }

        return res.json({
          ok: true,
          tradesman: row,
          promoted: true,
          assignTo: targetUid,
        });
      } catch (err) {
        console.error("[admin/tradesmen-status] error:", err);
        // Slightly more helpful in dev, but still safe in prod
        if (process.env.NODE_ENV !== "production") {
          return res.status(500).json({
            error: "server_error",
            details: err?.message || String(err),
          });
        }
        return res.status(500).json({ error: "server_error" });
      }
    }
  );
};
