// server/routes/tradesmen/me.put.js
module.exports = (router, ctx) => {
  const { db, auth, mysqlQuery } = ctx;
  const TAG = "[me.put]";

  if (!db && !mysqlQuery) {
    throw new Error("db or mysqlQuery must be attached to ctx");
  }

  const hasMysql = typeof mysqlQuery === "function";
  const isBetter = !!db?.prepare; // better-sqlite3

  // ---------- small dialect helpers ----------
  const queryAll = async (sql, params = []) => {
    if (hasMysql) {
      const rows = await mysqlQuery(sql, params);
      return rows;
    }
    if (isBetter) {
      return db.prepare(sql).all(...[].concat(params));
    }
    const [rows] = await db.execute(sql, params);
    return rows;
  };

  const queryOne = async (sql, params = []) => {
    const rows = await queryAll(sql, params);
    return rows && rows[0] ? rows[0] : null;
  };

  const run = async (sql, params = []) => {
    if (hasMysql) {
      await mysqlQuery(sql, params);
      return;
    }
    if (isBetter) {
      return db.prepare(sql).run(...[].concat(params));
    }
    const [result] = await db.execute(sql, params);
    return result;
  };

  const beginTx = () => {
    if (hasMysql) return; // rely on autocommit; ops are small
    if (db?.exec) db.exec("BEGIN");
  };

  const commitTx = () => {
    if (hasMysql) return;
    if (db?.exec) db.exec("COMMIT");
  };

  const rollbackTx = () => {
    if (hasMysql) return;
    try {
      db?.exec && db.exec("ROLLBACK");
    } catch (_) {}
  };

  // ---------- CH + location helpers ----------
  let matchByName = ctx.matchByName;
  let extractLocationTokens = ctx.extractLocationTokens;

  // Prefer ctx.extractLocationTokens; fall back to lib/location
  if (!extractLocationTokens) {
    try {
      const loc = require("../../lib/location");
      extractLocationTokens =
        loc.extractLocationTokens || extractLocationTokens;
    } catch {
      // last-resort fallback (very rough)
      extractLocationTokens =
        extractLocationTokens ||
        ((s) => {
          const v = String(s || "").toUpperCase();
          const first = v.split(/[,;|]/)[0].trim();
          const out = first.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\b/);
          const sec = first.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d)\b/);
          return {
            full: first || null,
            outward: out ? out[1] : null,
            sector: sec ? sec[1].replace(/\s+/, "") : null,
          };
        });
    }
  }

  if (!matchByName) {
    try {
      const ch = require("../../lib/companiesHouse");
      matchByName = ch.matchByName || matchByName;
    } catch {
      // ok, CH matching just won't run
    }
  }

  // ---------- SQLite-only schema safety (dev) ----------
  if (isBetter && !hasMysql) {
    const tblCols = (name) =>
      new Set(
        db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((r) => r.name)
      );
    const addColIfMissing = (tbl, colDef, colName) => {
      const cols = tblCols(tbl);
      if (!cols.has(colName)) {
        console.log(`${TAG} ALTER TABLE ${tbl} ADD COLUMN ${colDef}`);
        db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${colDef}`).run();
      }
    };

    addColIfMissing("tradesmen", "company_number TEXT", "company_number");
    addColIfMissing("tradesmen", "ch_status TEXT", "ch_status");
    addColIfMissing("tradesmen", "ch_name TEXT", "ch_name");
    addColIfMissing("tradesmen", "ch_checked_at TEXT", "ch_checked_at");
    addColIfMissing(
      "tradesmen",
      "ch_match_score INTEGER DEFAULT 0",
      "ch_match_score"
    );
    addColIfMissing(
      "tradesmen",
      "photo_count INTEGER DEFAULT 0",
      "photo_count"
    );
    addColIfMissing(
      "tradesmen",
      "supporting_doc_count INTEGER DEFAULT 0",
      "supporting_doc_count"
    );
    addColIfMissing(
      "tradesmen",
      "offers_discount INTEGER DEFAULT 0",
      "offers_discount"
    );
    addColIfMissing(
      "tradesmen",
      "warranty_months INTEGER DEFAULT 0",
      "warranty_months"
    );
    addColIfMissing(
      "tradesmen",
      "web_verified INTEGER DEFAULT 0",
      "web_verified"
    );
    addColIfMissing("tradesmen", "web_url TEXT", "web_url");
    addColIfMissing("tradesmen", "vmb_score INTEGER DEFAULT 0", "vmb_score");
    addColIfMissing(
      "tradesmen",
      "vmb_badge TEXT DEFAULT 'bronze'",
      "vmb_badge"
    );
    addColIfMissing(
      "tradesmen",
      "discount_min_percent INTEGER DEFAULT 0",
      "discount_min_percent"
    );
    addColIfMissing(
      "tradesmen",
      "discount_max_percent INTEGER DEFAULT 0",
      "discount_max_percent"
    );
  }

  // ---------- tradesmen_photos table (dialect-safe) ----------
  let photosEnsured = false;
  async function ensurePhotosTable() {
    if (photosEnsured) return;
    if (hasMysql) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS tradesmen_photos (
          id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tradesman_user_id VARCHAR(255) NOT NULL,
          url               TEXT NOT NULL,
          sort_order        INT NOT NULL DEFAULT 0,
          created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_tradesmen_photos_user (tradesman_user_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
      );
    } else if (isBetter) {
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS tradesmen_photos (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          tradesman_user_id TEXT NOT NULL,
          url               TEXT NOT NULL,
          sort_order        INTEGER NOT NULL DEFAULT 0,
          created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `
      ).run();
      db.prepare(
        `
        CREATE INDEX IF NOT EXISTS idx_tradesmen_photos_user
          ON tradesmen_photos(tradesman_user_id, sort_order)
      `
      ).run();
    } else {
      // generic sqlite via db.execute
      await run(
        `
        CREATE TABLE IF NOT EXISTS tradesmen_photos (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          tradesman_user_id TEXT NOT NULL,
          url               TEXT NOT NULL,
          sort_order        INTEGER NOT NULL DEFAULT 0,
          created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `
      );
      await run(
        `
        CREATE INDEX IF NOT EXISTS idx_tradesmen_photos_user
          ON tradesmen_photos(tradesman_user_id, sort_order)
      `
      );
    }
    photosEnsured = true;
  }

  // ---------- helpers ----------
  const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const toCSV = (arr) =>
    Array.isArray(arr) ? arr.join(",") : typeof arr === "string" ? arr : "";
  const toArr = (x) =>
    Array.isArray(x)
      ? x
      : typeof x === "string"
      ? x
          .split(/[,;|]/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  // scoring (same weights)
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

  // Normalise photos from body: workPhotos | photos | photoUrls
  const toPhotoArray = (body) => {
    if (!body) return [];
    const buckets = [];
    if (Array.isArray(body.workPhotos)) buckets.push(body.workPhotos);
    if (Array.isArray(body.photos)) buckets.push(body.photos);
    if (Array.isArray(body.photoUrls)) buckets.push(body.photoUrls);

    const flat = buckets.flat().filter(Boolean);
    return flat.map((u) => String(u).trim()).filter((u) => u.length > 0);
  };

  // ---------- ROUTE ----------
  router.put("/tradesmen/me", auth, async (req, res) => {
    try {
      await ensurePhotosTable();

      const uid = req.user.uid;
      const body = req.body || {};

      const companyName = (body.companyName || "").trim();
      if (!companyName)
        return res.status(400).json({ error: "companyName_required" });

      const contactName = body.contactName || null;
      const phone = body.phone || null;
      const email = body.email || null;
      const tradeTypes = toCSV(body.tradeTypes);
      const serviceAreas = toCSV(body.serviceAreas);
      const website = (body.website || "").trim() || null;
      const socialLinks = JSON.stringify(toArr(body.socialLinks));

      // NEW: pull actual photo URLs
      const photoUrls = toPhotoArray(body);
      const photoCount =
        (photoUrls && photoUrls.length) || int(body.photoCount, 0);

      const supportingDocCount = int(body.supportingDocCount, 0);

      // NEW: explicit min/max; keep legacy aggregate for back-compat
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

      let companyNumber = (body.companyNumber || "").trim() || null;
      let chStatus = body.chStatus || null;
      let chName = null;
      let chCheckedAt = null;
      let chMatchScore = 0;

      console.log(
        `${TAG} uid=${uid} name="${companyName}" areas="${serviceAreas}" trades="${tradeTypes}" ` +
          `preCH={num:${companyNumber || "-"}, status:${chStatus || "-"}} ` +
          `discounts={min:${discountMinPercent}, max:${discountMaxPercent}, agg:${offersDiscount}} ` +
          `photos=${photoCount}, urls=${photoUrls.length}`
      );

      // fill from CH if needed
      try {
        if (!companyNumber && typeof matchByName === "function") {
          const toks = extractLocationTokens
            ? extractLocationTokens(serviceAreas || "")
            : {};
          const locationHint =
            toks?.sector ||
            toks?.outward ||
            (serviceAreas.split(",")[0] || "").trim() ||
            null;

          const r = await Promise.resolve(
            matchByName({ name: companyName, locationHint })
          );
          chCheckedAt = new Date().toISOString();
          const verdict = String(r?.verdict || "").toLowerCase();
          chStatus =
            chStatus ||
            (["verified", "good", "exact"].includes(verdict)
              ? "verified"
              : verdict || "ambiguous");
          if (r?.best) {
            companyNumber = r.best.number || null;
            chName = r.best.name || null;
            chMatchScore = Number(r.best.score || 0);
          }
          console.log(
            `${TAG} CH => verdict=${verdict} num=${
              companyNumber || "-"
            } status=${chStatus || "-"} score=${chMatchScore}`
          );
        }
      } catch (e) {
        console.warn(`${TAG} CH error:`, e?.message || e);
      }

      // ---------- transaction ----------
      beginTx();
      try {
        const nowIso = new Date().toISOString();

        // Upsert core tradesman row
        if (hasMysql) {
          // MySQL: use ON DUPLICATE KEY UPDATE on PK user_id
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
              company_number      = COALESCE(VALUES(company_number), tradesmen.company_number),
              ch_status           = COALESCE(VALUES(ch_status), tradesmen.ch_status),
              ch_name             = COALESCE(VALUES(ch_name), tradesmen.ch_name),
              ch_checked_at       = COALESCE(VALUES(ch_checked_at), tradesmen.ch_checked_at),
              ch_match_score      = COALESCE(VALUES(ch_match_score), tradesmen.ch_match_score),
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
          // SQLite path (better-sqlite3 or generic)
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
              company_number      = COALESCE(excluded.company_number, tradesmen.company_number),
              ch_status           = COALESCE(excluded.ch_status, tradesmen.ch_status),
              ch_name             = COALESCE(excluded.ch_name, tradesmen.ch_name),
              ch_checked_at       = COALESCE(excluded.ch_checked_at, tradesmen.ch_checked_at),
              ch_match_score      = COALESCE(excluded.ch_match_score, tradesmen.ch_match_score),
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

        // Sync tradesmen_photos from photoUrls
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
          console.log(
            `${TAG} inserted ${photoUrls.length} photos into tradesmen_photos for uid=${uid}`
          );
        } else {
          console.log(`${TAG} no photoUrls provided for uid=${uid}`);
        }

        // Recompute score + badge
        const r = await queryOne(`SELECT * FROM tradesmen WHERE user_id = ?`, [
          uid,
        ]);
        const { score, badge } = computeScore(r);

        if (hasMysql) {
          await run(
            `
            UPDATE tradesmen
               SET vmb_score = ?,
                   vmb_badge = ?,
                   updated_at = NOW()
             WHERE user_id = ?
          `,
            [score, badge, uid]
          );
        } else {
          await run(
            `
            UPDATE tradesmen
               SET vmb_score = ?,
                   vmb_badge = ?,
                   updated_at = datetime('now')
             WHERE user_id = ?
          `,
            [score, badge, uid]
          );
        }

        commitTx();

        const row = await queryOne(
          `SELECT * FROM tradesmen WHERE user_id = ?`,
          [uid]
        );
        console.log(
          `${TAG} saved uid=${uid} -> company_number=${
            row.company_number || "-"
          } ch_status=${row.ch_status || "-"} score=${row.vmb_score} badge=${
            row.vmb_badge
          } min=${row.discount_min_percent} max=${
            row.discount_max_percent
          } photos=${row.photo_count}`
        );
        return res.json({ ok: true, profile: row });
      } catch (e) {
        rollbackTx();
        console.error(`${TAG} db error:`, e?.message || e);
        return res.status(500).json({ error: "server_error" });
      }
    } catch (outer) {
      console.error(`${TAG} outer error:`, outer?.message || outer);
      return res.status(500).json({ error: "server_error" });
    }
  });

  if (!ctx.__logged_tradesmen_me_put) {
    ctx.__logged_tradesmen_me_put = true;
    console.log(`[routes] mounted: PUT /tradesmen/me`);
  }
};
