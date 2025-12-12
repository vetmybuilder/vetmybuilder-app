// server/routes/admin/tradesman-status.post.js

/**
 * POST /api/admin/tradesmen/:uid/status
 *
 * Body: { status: "draft"|"active"|"inactive", assignTo?: "<real-firebase-uid>" }
 *
 * NEW:
 * - When row becomes active → we treat this as verification approved:
 *     verification_status = 'approved'
 * - When row becomes draft → reset verification to 'unverified'
 *
 * When row becomes active → call Google Places and store:
 *   google_place_id, google_rating, google_reviews_count
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { mysqlQuery, auth, extractLocationTokens } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { requireAdmin } = require("../../lib/roles");
  const TAG = "admin.tradesmen.status";

  if (!ctx.__logged_status_route) {
    ctx.__logged_status_route = true;
    logger.info(
      { route: "/admin/tradesmen/:uid/status" },
      "Mounted tradesman-status route"
    );
  }

  const isLeadId = (s) => String(s || "").startsWith("lead_");

  // Google Places helper
  const { lookupBusiness } = (() => {
    try {
      return require("../../lib/googlePlaces");
    } catch {
      return { lookupBusiness: async () => null };
    }
  })();

  async function upsertRoleTradesman(uid, log) {
    try {
      await mysqlQuery(
        `INSERT INTO user_roles (uid, role)
         VALUES (?, 'tradesman')
         ON DUPLICATE KEY UPDATE role = 'tradesman'`,
        [uid]
      );
      log.info({ uid }, "Tradesman role upserted");
    } catch (e) {
      log.error({ err: e?.message }, "Failed to upsert tradesman role");
      throw e;
    }
  }

  /**
   * Clone lead row into a real UID
   */
  async function cloneIntoUid(srcRow, targetUid, log) {
    log.info({ targetUid }, "Cloning lead row into real UID");

    const createdAt = srcRow.created_at || null;
    const updatedAt = srcRow.updated_at || null;

    try {
      await mysqlQuery(
        `INSERT INTO tradesmen (
          user_id, company_name, contact_name, phone, email,
          trade_types, service_areas, created_at, updated_at,
          subscription_status, verification_status, contact_credits, plan, plan_update_at,
          purchased_plan, company_number, ch_status, ch_name,
          ch_checked_at, ch_match_score, photo_count,
          supporting_doc_count, offers_discount, warranty_months,
          web_verified, web_url, vmb_score, vmb_badge,
          discount_min_percent, discount_max_percent,
          social_links_json, likes_count, wins_count,
          status, plan_updated_at, google_place_id,
          google_rating, google_reviews_count
        ) VALUES (
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,?
        )`,
        [
          targetUid,
          srcRow.company_name,
          srcRow.contact_name,
          srcRow.phone,
          srcRow.email,
          srcRow.trade_types,
          srcRow.service_areas,
          createdAt,
          updatedAt,
          srcRow.subscription_status || "inactive",
          // New tradesman promoted & activated by admin → treated as verified
          "approved",
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
          "active",
          srcRow.plan_updated_at || null,
          srcRow.google_place_id || null,
          srcRow.google_rating ?? null,
          srcRow.google_reviews_count ?? 0,
        ]
      );
    } catch (e) {
      log.error({ err: e?.message }, "Failed cloning lead row");
      throw e;
    }
  }

  async function activateUidRow(uid, log) {
    try {
      await mysqlQuery(
        `UPDATE tradesmen
            SET status = 'active',
                verification_status = 'approved',
                updated_at = NOW()
          WHERE user_id = ?`,
        [uid]
      );
      log.info({ uid }, "Activated existing tradesman row (verified approved)");
    } catch (e) {
      log.error({ err: e?.message }, "Failed to activate row");
      throw e;
    }
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
   * Enrich tradesman row with Google data if missing.
   */
  async function enrichTradesman(row, log) {
    if (!row) return row;

    if (row.google_place_id && row.google_rating !== null) {
      return row;
    }

    const name = row.ch_name || row.company_name;
    if (!name) return row;

    const companyNumber = row.company_number || null;
    const locationHint = getLocationHint(row);

    log.info(
      { uid: row.user_id, name, locationHint, companyNumber },
      "Calling Google Places API for enrichment"
    );

    let place = null;
    try {
      place = await lookupBusiness({ name, locationHint, companyNumber });
    } catch (e) {
      log.error({ err: e?.message }, "Google lookup failed");
      return row;
    }

    if (!place) {
      log.info("No Google match found");
      return row;
    }

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
      log.info(
        {
          uid: row.user_id,
          placeId: place.placeId,
          rating: place.rating,
          reviews: place.userRatingsTotal,
        },
        "Google enrichment saved"
      );
    } catch (e) {
      log.error({ err: e?.message }, "Failed saving google enrichment");
      return row;
    }

    const updated = await mysqlQuery(
      `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
      [row.user_id]
    );

    return updated[0] || row;
  }

  // -------------------------------------------------------------------------
  // MAIN ROUTE HANDLER
  // -------------------------------------------------------------------------

  router.post(
    "/admin/tradesmen/:uid/status",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: TAG });
      const srcUid = String(req.params.uid || "");
      const status = String(req.body?.status || "").toLowerCase();
      const assignTo = req.body?.assignTo ? String(req.body.assignTo) : null;

      log.info({ srcUid, status, assignTo }, "Status update request");

      try {
        if (!srcUid) return res.status(400).json({ error: "uid required" });
        if (!["draft", "active", "inactive"].includes(status)) {
          log.warn({ status }, "Invalid status");
          return res.status(400).json({ error: "invalid status" });
        }

        const srcRows = await mysqlQuery(
          `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [srcUid]
        );
        const srcRow = srcRows[0];

        if (!srcRow) {
          log.warn("Tradesman not found");
          return res.status(404).json({ error: "tradesman not found" });
        }

        // ==========================================================
        // Case 1: REAL UID → simple status + verification update
        // ==========================================================
        if (!isLeadId(srcUid)) {
          if (status === "active") {
            await mysqlQuery(
              `UPDATE tradesmen
                  SET status = 'active',
                      verification_status = 'approved',
                      updated_at = NOW()
                WHERE user_id = ?`,
              [srcUid]
            );
          } else if (status === "draft") {
            await mysqlQuery(
              `UPDATE tradesmen
                  SET status = 'draft',
                      verification_status = 'unverified',
                      updated_at = NOW()
                WHERE user_id = ?`,
              [srcUid]
            );
          } else {
            // inactive: don't change verification record, just disable
            await mysqlQuery(
              `UPDATE tradesmen
                  SET status = 'inactive',
                      updated_at = NOW()
                WHERE user_id = ?`,
              [srcUid]
            );
          }

          const [updated] = await mysqlQuery(
            `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [srcUid]
          );

          let row = updated;

          if (status === "active") {
            log.info("Real UID activated, enriching with Google");
            row = await enrichTradesman(row, log);
          }

          return res.json({ ok: true, tradesman: row, promoted: false });
        }

        // ==========================================================
        // Case 2: lead_* but NOT being activated
        // ==========================================================
        if (status !== "active") {
          if (status === "draft") {
            await mysqlQuery(
              `UPDATE tradesmen
                  SET status = 'draft',
                      verification_status = 'unverified',
                      updated_at = NOW()
                WHERE user_id = ?`,
              [srcUid]
            );
          } else {
            await mysqlQuery(
              `UPDATE tradesmen
                  SET status = 'inactive',
                      updated_at = NOW()
                WHERE user_id = ?`,
              [srcUid]
            );
          }

          const [row] = await mysqlQuery(
            `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [srcUid]
          );

          log.info({ srcUid, status }, "Updated lead status, not promoted");

          return res.json({ ok: true, tradesman: row, promoted: false });
        }

        // ==========================================================
        // Case 3: lead_* AND activation requested
        // → must promote to real UID
        // ==========================================================

        let targetUid = assignTo;

        if (!targetUid) {
          const email = (srcRow.email || "").trim().toLowerCase();

          if (email) {
            const matches = await mysqlQuery(
              `SELECT uid
                 FROM users
                WHERE LOWER(COALESCE(email,'')) = ?`,
              [email]
            );

            if (matches.length === 1) {
              targetUid = matches[0].uid;
              log.info({ targetUid }, "Auto-matched user by email");
            } else if (matches.length > 1) {
              log.warn(
                { email, count: matches.length },
                "Ambiguous email results"
              );
              return res.status(400).json({
                error: "multiple users share that email; specify assignTo",
                code: "ASSIGN_AMBIGUOUS",
                count: matches.length,
              });
            }
          }
        }

        if (!targetUid) {
          log.warn("Activation requires assignTo");
          return res.status(400).json({
            error:
              "assignTo (real user UID) required — couldn't uniquely match by email",
            code: "ASSIGN_UID_REQUIRED",
          });
        }

        // ==========================================================
        // Transaction: promote lead → target UID
        // ==========================================================

        log.info({ srcUid, targetUid }, "Promoting lead to real UID");

        try {
          await mysqlQuery("START TRANSACTION");

          const exists = await mysqlQuery(
            `SELECT 1 FROM tradesmen WHERE user_id = ? LIMIT 1`,
            [targetUid]
          );

          if (!exists.length) {
            await cloneIntoUid(srcRow, targetUid, log);
          } else {
            await activateUidRow(targetUid, log);
          }

          await upsertRoleTradesman(targetUid, log);

          // Keep the lead row around but mark as draft/unverified
          await mysqlQuery(
            `UPDATE tradesmen
                SET status = 'draft',
                    verification_status = 'unverified',
                    updated_at = NOW()
              WHERE user_id = ?`,
            [srcUid]
          );

          await mysqlQuery("COMMIT");
        } catch (e) {
          log.error({ err: e?.message }, "Promotion failed, rolling back");
          try {
            await mysqlQuery("ROLLBACK");
          } catch {}

          return res.status(500).json({ error: "server_error" });
        }

        const [newRow] = await mysqlQuery(
          `SELECT * FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [targetUid]
        );

        let enriched = newRow;
        if (enriched) {
          log.info("Enriching promoted tradesman with Google");
          enriched = await enrichTradesman(enriched, log);
        }

        return res.json({
          ok: true,
          tradesman: enriched,
          promoted: true,
          assignTo: targetUid,
        });
      } catch (err) {
        log.error({ err: err?.message, stack: err?.stack }, "Unhandled error");
        return res.status(500).json({
          error: "server_error",
          details:
            process.env.NODE_ENV !== "production"
              ? err?.message || String(err)
              : undefined,
        });
      }
    }
  );
};
