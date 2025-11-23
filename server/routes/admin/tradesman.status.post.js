/**
 * POST /api/admin/tradesmen/:uid/status
 * Body: { status: "draft"|"active"|"inactive", assignTo?: "<real-firebase-uid>" }
 * Auth: admin
 *
 * Behaviour:
 * - If :uid is a real UID -> update that row (as before).
 * - If :uid is a lead_*:
 *     - For status !== "active": just update the lead row (as before).
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
  const { db, auth, extractLocationTokens } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  console.log("[routes] mounted: POST /admin/tradesmen/:uid/status");

  const nowSql = `datetime('now')`;
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

  // Ensure minimal tables exist
  db.prepare(
    `CREATE TABLE IF NOT EXISTS user_roles (
      uid TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user'
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT,
      firstName TEXT, lastName TEXT, username TEXT,
      createdAt TEXT, updatedAt TEXT
    )`
  ).run();

  db.prepare(
    `CREATE TABLE IF NOT EXISTS tradesmen (
      user_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,
      trade_types TEXT DEFAULT '',
      service_areas TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      subscription_status TEXT DEFAULT 'free',
      status TEXT DEFAULT 'draft'
    )`
  ).run();

  function upsertRoleTradesman(uid) {
    db.prepare(
      `INSERT INTO user_roles (uid, role) VALUES (?, 'tradesman')
       ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
    ).run(uid);
  }

  function cloneIntoUid(srcRow, targetUid) {
    // Build a dynamic insert that respects whatever columns are present
    const cols = db
      .prepare(`PRAGMA table_info(tradesmen)`)
      .all()
      .map((r) => r.name);
    const clone = { ...srcRow, user_id: targetUid };

    // Adjust a few fields for the new owner
    clone.status = "active";
    clone.subscription_status = "active";
    clone.updated_at = new Date().toISOString();

    // Ensure all columns exist as keys
    cols.forEach((c) => {
      if (!(c in clone)) clone[c] = null;
    });

    const colList = cols.join(", ");
    const placeholders = cols.map((c) => `@${c}`).join(", ");
    db.prepare(
      `INSERT INTO tradesmen (${colList}) VALUES (${placeholders})`
    ).run(clone);
  }

  function activateUidRow(uid) {
    db.prepare(
      `UPDATE tradesmen
         SET status='active',
             subscription_status='active',
             updated_at=${nowSql}
       WHERE user_id=?`
    ).run(uid);
  }

  function getLocationHint(row) {
    try {
      const svc = row?.service_areas || "";
      if (!extractLocationTokens) return null;
      const toks = extractLocationTokens(svc) || {};
      return toks.full || toks.sector || toks.outward || null;
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
    if (row.google_place_id && row.google_rating != null) return row;

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

      db.prepare(
        `UPDATE tradesmen
           SET google_place_id = ?,
               google_rating = ?,
               google_reviews_count = ?
         WHERE user_id = ?`
      ).run(
        place.placeId || null,
        place.rating ?? null,
        place.userRatingsTotal ?? 0,
        row.user_id
      );

      // Return fresh row
      return db
        .prepare(`SELECT * FROM tradesmen WHERE user_id = ?`)
        .get(row.user_id);
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
      const srcUid = String(req.params.uid || "");
      const status = String(req.body?.status || "").toLowerCase();
      const explicitAssignTo = req.body?.assignTo
        ? String(req.body.assignTo)
        : null;

      if (!srcUid) return res.status(400).json({ error: "uid required" });
      if (!["draft", "active", "inactive"].includes(status)) {
        return res.status(400).json({ error: "invalid status" });
      }

      const srcRow = db
        .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
        .get(srcUid);
      if (!srcRow)
        return res.status(404).json({ error: "tradesman not found" });

      // Non-lead rows: just update and return (existing behaviour)
      if (!isLeadId(srcUid)) {
        db.prepare(
          `UPDATE tradesmen
             SET status = ?,
                 subscription_status = CASE WHEN ?='active' THEN 'active' ELSE subscription_status END,
                 updated_at = ${nowSql}
           WHERE user_id = ?`
        ).run(status, status, srcUid);

        let row = db
          .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
          .get(srcUid);

        // NEW: if now active, enrich with Google
        if (status === "active" && row) {
          row = await enrichTradesmanWithGoogle(row);
        }

        return res.json({ ok: true, tradesman: row, promoted: false });
      }

      // lead_* rows
      if (status !== "active") {
        db.prepare(
          `UPDATE tradesmen SET status = ?, updated_at = ${nowSql} WHERE user_id = ?`
        ).run(status, srcUid);

        const row = db
          .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
          .get(srcUid);
        return res.json({ ok: true, tradesman: row, promoted: false });
      }

      // status === "active" AND lead_* : promote/clone to a real UID
      let targetUid = explicitAssignTo;

      if (!targetUid) {
        const leadEmail = String(srcRow?.email || "")
          .trim()
          .toLowerCase();
        if (leadEmail) {
          const matches = db
            .prepare(
              `SELECT uid FROM users WHERE LOWER(COALESCE(email,'')) = ?`
            )
            .all(leadEmail)
            .map((r) => r.uid);

          if (matches.length === 1) {
            targetUid = matches[0];
          } else if (matches.length > 1) {
            return res.status(400).json({
              error: "multiple users share that email; specify assignTo",
              code: "ASSIGN_AMBIGUOUS",
              count: matches.length,
            });
          } else {
            // no user found for that email
          }
        }
      }

      if (!targetUid) {
        return res.status(400).json({
          error:
            "assignTo (real user UID) required to activate this lead — no unique user found by email",
          code: "ASSIGN_UID_REQUIRED",
        });
      }

      const tx = db.transaction(() => {
        const existing = db
          .prepare(`SELECT 1 FROM tradesmen WHERE user_id=?`)
          .get(targetUid);
        if (!existing) {
          cloneIntoUid(srcRow, targetUid);
        } else {
          activateUidRow(targetUid);
        }

        upsertRoleTradesman(targetUid);

        // Optional: keep the lead row out of active views
        db.prepare(
          `UPDATE tradesmen SET status='draft', updated_at=${nowSql} WHERE user_id=?`
        ).run(srcUid);
      });

      try {
        tx();
        let row = db
          .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
          .get(targetUid);

        // NEW: enrich promoted/activated tradesman with Google
        if (row) {
          row = await enrichTradesmanWithGoogle(row);
        }

        return res.json({
          ok: true,
          tradesman: row,
          promoted: true,
          assignTo: targetUid,
        });
      } catch (e) {
        console.error("[admin status] promote by email failed", e);
        return res.status(500).json({ error: "server_error" });
      }
    }
  );
};
