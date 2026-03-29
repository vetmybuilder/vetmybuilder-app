// server/routes/tradesmen/me.put.js

module.exports = (router, ctx) => {
  const { db, auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[tradesmen/me.put]";

  if (!db && !mysqlQuery) {
    throw new Error("db or mysqlQuery must be attached to ctx");
  }

  const hasMysql = typeof mysqlQuery === "function";
  const isBetter = !!db?.prepare;

  // ---------- helpers ----------
  const queryAll = async (sql, params = []) => {
    if (hasMysql) return mysqlQuery(sql, params);
    if (isBetter) return db.prepare(sql).all(...[].concat(params));
    const [rows] = await db.execute(sql, params);
    return rows;
  };

  const queryOne = async (sql, params = []) => {
    const rows = await queryAll(sql, params);
    return rows?.[0] || null;
  };

  const run = async (sql, params = []) => {
    if (hasMysql) return mysqlQuery(sql, params);
    if (isBetter) return db.prepare(sql).run(...[].concat(params));
    const [result] = await db.execute(sql, params);
    return result;
  };

  function mysqlNow() {
    const d = new Date();
    return d.toISOString().slice(0, 19).replace("T", " ");
  }

  const beginTx = () => {
    if (!hasMysql && db?.exec) db.exec("BEGIN");
  };

  const commitTx = () => {
    if (!hasMysql && db?.exec) db.exec("COMMIT");
  };

  const rollbackTx = () => {
    if (!hasMysql && db?.exec) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
    }
  };

  // ---- CH + location helpers ----
  let matchByName = ctx.matchByName;
  let extractLocationTokens = ctx.extractLocationTokens;

  if (!extractLocationTokens) {
    try {
      const loc = require("../../lib/location");
      extractLocationTokens =
        loc.extractLocationTokens || extractLocationTokens;
    } catch {}
  }

  if (!matchByName) {
    try {
      const ch = require("../../lib/companiesHouse");
      matchByName = ch.matchByName || matchByName;
    } catch {}
  }

  // ---- ensure tradesmen_photos (MySQL/SQLite safe) ----
  let photosEnsured = false;
  async function ensurePhotosTable() {
    if (photosEnsured) return;
    photosEnsured = true;
    log.info(`${TAG} ensuring tradesmen_photos table...`);

    if (hasMysql) {
      await run(`
        CREATE TABLE IF NOT EXISTS tradesmen_photos (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tradesman_user_id VARCHAR(255) NOT NULL,
          url TEXT NOT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_tradesmen_photos_user (tradesman_user_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      return;
    }

    if (isBetter) {
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS tradesmen_photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tradesman_user_id TEXT NOT NULL,
          url TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `
      ).run();

      db.prepare(
        `
        CREATE INDEX IF NOT EXISTS idx_tradesmen_photos_user
          ON tradesmen_photos(tradesman_user_id, sort_order)
      `
      ).run();
    }
  }

  // ---- small utilities ----
  const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const toCSV = (arr) => (Array.isArray(arr) ? arr.join(",") : arr || "");
  const toArr = (x) =>
    Array.isArray(x)
      ? x
      : typeof x === "string"
      ? x
          .split(/[,;|]/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const toPhotoArray = (body) => {
    if (!body) return [];
    const buckets = [];
    if (Array.isArray(body.workPhotos)) buckets.push(body.workPhotos);
    if (Array.isArray(body.photos)) buckets.push(body.photos);
    if (Array.isArray(body.photoUrls)) buckets.push(body.photoUrls);
    return buckets
      .flat()
      .filter(Boolean)
      .map((u) => String(u).trim());
  };

  // ---- scoring ----
  const WEIGHTS = {
    serviceAreasMin3: 10,
    webPresenceAny: 5,
    chVerified: 25,
    tradesMin3: 15,
    photosMin3: 15,
    discountAny: 5,
    docsMin2: 10,
    warrantyMax: 15,
  };
  const toBadge = (s) =>
    s >= 85 ? "platinum" : s >= 70 ? "gold" : s >= 50 ? "silver" : "bronze";

  const lerpWarranty = (m) => {
    const v = Math.max(0, int(m, 0));
    if (v >= 36) return 20;
    return Math.round((v / 36) * 20);
  };

  function computeScore(row) {
    const saCount = toArr(row.service_areas).length;
    const tradeCount = toArr(row.trade_types).length;
    const photos = Math.max(0, int(row.photo_count, 0));
    const hasDiscount =
      Math.max(
        int(row.offers_discount, 0),
        int(row.discount_min_percent, 0),
        int(row.discount_max_percent, 0)
      ) > 0;
    const wPts = lerpWarranty(row.warranty_months);
    const chOK = String(row.ch_status || "").toLowerCase() === "verified";
    const webOK = int(row.web_verified, 0) === 1;

    let score =
      (saCount >= 3 ? WEIGHTS.serviceAreasMin3 : 0) +
      (webOK ? WEIGHTS.webPresenceAny : 0) +
      (chOK ? WEIGHTS.chVerified : 0) +
      (tradeCount >= 3 ? WEIGHTS.tradesMin3 : 0) +
      (photos >= 3 ? WEIGHTS.photosMin3 : 0) +
      (hasDiscount ? WEIGHTS.discountAny : 0) +
      Math.min(wPts, WEIGHTS.warrantyMax) +
      (int(row.supporting_doc_count, 0) >= 2 ? WEIGHTS.docsMin2 : 0);

    return { score: Math.max(0, Math.min(100, score)), badge: toBadge(score) };
  }

  // ---------- ROUTE ----------
  router.put("/tradesmen/me", auth, async (req, res) => {
    const uid = req.user.uid;

    log.info(`${TAG} incoming update`, {
      uid,
      companyName: req.body?.companyName,
      tradeTypes: req.body?.tradeTypes,
      serviceAreas: req.body?.serviceAreas,
    });

    try {
      await ensurePhotosTable();

      const body = req.body || {};
      const companyName = (body.companyName || "").trim();

      if (!companyName) {
        log.warn(`${TAG} missing companyName`, { uid });
        return res.status(400).json({ error: "companyName_required" });
      }

      const contactName = body.contactName || null;
      const phone = body.phone || null;
      const email = body.email || null;

      const tradeTypes = toCSV(body.tradeTypes);
      const serviceAreas = toCSV(body.serviceAreas);
      const website = (body.website || "").trim() || null;
      const socialLinks = JSON.stringify(toArr(body.socialLinks));

      const photoUrls = toPhotoArray(body);
      const photoCount =
        (photoUrls && photoUrls.length) || int(body.photoCount, 0);

      const supportingDocCount = int(body.supportingDocCount, 0);

      const discountMinPercent = int(
        body.discountMinPercent ?? body.discountMin,
        0
      );
      const discountMaxPercent = int(
        body.discountMaxPercent ?? body.discountMax,
        0
      );
      const offersDiscount = int(
        body.offersDiscount,
        Math.max(discountMinPercent, discountMaxPercent)
      );

      const warrantyMonths = int(body.warrantyMonths, 0);

      const rawProfilePictureUrl =
        typeof body.profilePictureUrl === "string"
          ? body.profilePictureUrl.trim() || null
          : null;

      let companyNumber = (body.companyNumber || "").trim() || null;
      let chStatus = body.chStatus || null;
      let chName = null;
      let chCheckedAt = null;
      let chMatchScore = 0;

      // --- Companies House auto-fill ---
      if (!companyNumber && typeof matchByName === "function") {
        try {
          const toks = extractLocationTokens?.(serviceAreas || "") || {};
          const hint =
            toks.sector ||
            toks.outward ||
            (serviceAreas.split(",")[0] || "").trim() ||
            null;

          const result = await matchByName({
            name: companyName,
            locationHint: hint,
          });

          chCheckedAt = hasMysql ? mysqlNow() : new Date().toISOString();
          const verdict = String(result?.verdict || "").toLowerCase();

          chStatus =
            chStatus ||
            (["verified", "good", "exact"].includes(verdict)
              ? "verified"
              : verdict || "ambiguous");

          if (result?.best) {
            companyNumber = result.best.number || null;
            chName = result.best.name || null;
            chMatchScore = Number(result.best.score || 0);
          }

          log.info(`${TAG} CH match`, {
            uid,
            verdict,
            companyNumber,
            chStatus,
            chMatchScore,
          });
        } catch (e) {
          log.warn(`${TAG} CH lookup failed`, {
            uid,
            error: e?.message || e,
          });
        }
      }

      // ---------- DB transaction ----------
      beginTx();
      try {
        // UPSERT main row…
        if (hasMysql) {
          await run(
            `
            INSERT INTO tradesmen (
              user_id, company_name, contact_name, phone, email,
              trade_types, service_areas,
              web_verified, web_url, social_links_json,
              offers_discount, warranty_months, photo_count, supporting_doc_count,
              discount_min_percent, discount_max_percent,
              company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
              vmb_score, vmb_badge, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?,
              ?, ?,
              0, ?, ?,
              ?, ?, ?, ?,
              ?, ?,
              ?, ?, ?, ?, ?,
              0, 'bronze', NOW(), NOW()
            )
            ON DUPLICATE KEY UPDATE
              company_name        = VALUES(company_name),
              contact_name        = VALUES(contact_name),
              phone               = VALUES(phone),
              email               = VALUES(email),
              trade_types         = VALUES(trade_types),
              service_areas       = VALUES(service_areas),
              web_url             = VALUES(web_url),
              social_links_json   = VALUES(social_links_json),
              offers_discount     = VALUES(offers_discount),
              warranty_months     = VALUES(warranty_months),
              photo_count         = VALUES(photo_count),
              supporting_doc_count= VALUES(supporting_doc_count),
              discount_min_percent= VALUES(discount_min_percent),
              discount_max_percent= VALUES(discount_max_percent),
              company_number      = COALESCE(VALUES(company_number), company_number),
              ch_status           = COALESCE(VALUES(ch_status), ch_status),
              ch_name             = COALESCE(VALUES(ch_name), ch_name),
              ch_checked_at       = COALESCE(VALUES(ch_checked_at), ch_checked_at),
              ch_match_score      = COALESCE(VALUES(ch_match_score), ch_match_score),
              updated_at          = NOW()
          `,
            [
              uid,
              companyName,
              contactName,
              phone,
              email,
              tradeTypes,
              serviceAreas,
              website,
              socialLinks,
              offersDiscount,
              warrantyMonths,
              photoCount,
              supportingDocCount,
              discountMinPercent,
              discountMaxPercent,
              companyNumber,
              chStatus,
              chName,
              chCheckedAt,
              chMatchScore,
            ]
          );
        } else {
          // SQLite path
          await run(
            `
            INSERT INTO tradesmen (
              user_id, company_name, contact_name, phone, email,
              trade_types, service_areas,
              web_verified, web_url, social_links_json,
              offers_discount, warranty_months, photo_count, supporting_doc_count,
              discount_min_percent, discount_max_percent,
              company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
              vmb_score, vmb_badge, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?,
              ?, ?,
              0, ?, ?,
              ?, ?, ?, ?,
              ?, ?,
              ?, ?, ?, ?, ?,
              0, 'bronze', datetime('now'), datetime('now')
            )
            ON CONFLICT(user_id) DO UPDATE SET
              company_name        = excluded.company_name,
              contact_name        = excluded.contact_name,
              phone               = excluded.phone,
              email               = excluded.email,
              trade_types         = excluded.trade_types,
              service_areas       = excluded.service_areas,
              web_url             = excluded.web_url,
              social_links_json   = excluded.social_links_json,
              offers_discount     = excluded.offers_discount,
              warranty_months     = excluded.warranty_months,
              photo_count         = excluded.photo_count,
              supporting_doc_count= excluded.supporting_doc_count,
              discount_min_percent= excluded.discount_min_percent,
              discount_max_percent= excluded.discount_max_percent,
              company_number      = COALESCE(excluded.company_number, company_number),
              ch_status           = COALESCE(excluded.ch_status, ch_status),
              ch_name             = COALESCE(excluded.ch_name, ch_name),
              ch_checked_at       = COALESCE(excluded.ch_checked_at, ch_checked_at),
              ch_match_score      = COALESCE(excluded.ch_match_score, ch_match_score),
              updated_at          = datetime('now')
          `,
            [
              uid,
              companyName,
              contactName,
              phone,
              email,
              tradeTypes,
              serviceAreas,
              website,
              socialLinks,
              offersDiscount,
              warrantyMonths,
              photoCount,
              supportingDocCount,
              discountMinPercent,
              discountMaxPercent,
              companyNumber,
              chStatus,
              chName,
              chCheckedAt,
              chMatchScore,
            ]
          );
        }

        log.info(`${TAG} upserted tradesmen row`, { uid });

        // SYNC PHOTOS
        await run(`DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`, [
          uid,
        ]);

        if (photoUrls.length > 0) {
          let idx = 0;
          for (const url of photoUrls) {
            await run(
              `
              INSERT INTO tradesmen_photos
                (tradesman_user_id, url, sort_order)
              VALUES (?, ?, ?)
            `,
              [uid, url, idx++]
            );
          }
          log.info(`${TAG} synced photos`, {
            uid,
            count: photoUrls.length,
          });
        } else {
          log.info(`${TAG} no photos provided`, { uid });
        }

        // PROFILE PICTURE — only keep if still present in the saved photo set
        const photoUrlSet = new Set(photoUrls);
        const effectiveProfilePicUrl =
          rawProfilePictureUrl && photoUrlSet.has(rawProfilePictureUrl)
            ? rawProfilePictureUrl
            : null;

        await run(
          `UPDATE tradesmen SET profile_picture_url = ? WHERE user_id = ?`,
          [effectiveProfilePicUrl, uid]
        );

        // RECOMPUTE SCORE
        const row = await queryOne(
          `SELECT * FROM tradesmen WHERE user_id = ?`,
          [uid]
        );
        const { score, badge } = computeScore(row);

        if (hasMysql) {
          await run(
            `
            UPDATE tradesmen
               SET vmb_score = ?, vmb_badge = ?, updated_at = NOW()
             WHERE user_id = ?
          `,
            [score, badge, uid]
          );
        } else {
          await run(
            `
            UPDATE tradesmen
               SET vmb_score = ?, vmb_badge = ?, updated_at = datetime('now')
             WHERE user_id = ?
          `,
            [score, badge, uid]
          );
        }

        commitTx();

        log.info(`${TAG} saved successfully`, {
          uid,
          score,
          badge,
          companyNumber,
          chStatus,
        });

        const finalRow = await queryOne(
          `SELECT * FROM tradesmen WHERE user_id = ?`,
          [uid]
        );

        return res.json({ ok: true, profile: finalRow });
      } catch (e) {
        rollbackTx();
        log.error(`${TAG} db error`, {
          uid,
          error: e?.message || e,
        });
        return res.status(500).json({ error: "server_error" });
      }
    } catch (outer) {
      log.error(`${TAG} unexpected error`, {
        uid,
        error: outer?.message || outer,
      });
      return res.status(500).json({ error: "server_error" });
    }
  });

  if (!ctx.__logged_tradesmen_me_put) {
    ctx.__logged_tradesmen_me_put = true;
    log.info("[routes] mounted: PUT /tradesmen/me");
  }
};
