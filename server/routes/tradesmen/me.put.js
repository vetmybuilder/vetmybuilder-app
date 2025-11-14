// server/routes/tradesmen/me.put.js
module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  const TAG = "[me.put]";

  // Prefer ctx.matchByName; fall back to lib if not injected
  let matchByName = ctx.matchByName;
  let extractLocationTokens = ctx.extractLocationTokens;
  if (!matchByName || !extractLocationTokens) {
    try {
      const ch = require("../../lib/companiesHouse");
      matchByName = matchByName || ch.matchByName;
      extractLocationTokens =
        extractLocationTokens ||
        ch.extractLocationTokens ||
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
    } catch {}
  }

  // Idempotent ensure columns we use
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
  addColIfMissing("tradesmen", "photo_count INTEGER DEFAULT 0", "photo_count");
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
  addColIfMissing("tradesmen", "vmb_badge TEXT DEFAULT 'bronze'", "vmb_badge");
  // NEW: explicit min/max fields
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

  // NEW: ensure photos table exists (matches your schema)
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

  // scoring (same weights you’ve been using)
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

  // IMPORTANT: no API prefix here; mount happens in index.js
  router.put("/tradesmen/me", auth, async (req, res) => {
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

    // NEW: accept explicit min/max; keep legacy aggregate for back-compat
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
          `${TAG} CH => verdict=${verdict} num=${companyNumber || "-"} status=${
            chStatus || "-"
          } score=${chMatchScore}`
        );
      }
    } catch (e) {
      console.warn(`${TAG} CH error:`, e?.message || e);
    }

    const tx = db.transaction(() => {
      // Upsert core tradesman row
      db.prepare(
        `INSERT INTO tradesmen (
          user_id, company_name, contact_name, phone, email,
          trade_types, service_areas,
          web_verified, web_url, social_links_json,
          offers_discount, warranty_months, photo_count, supporting_doc_count,
          discount_min_percent, discount_max_percent,
          company_number, ch_status, ch_name, ch_checked_at, ch_match_score,
          vmb_score, vmb_badge, created_at, updated_at
        ) VALUES (
          @user_id, @company_name, @contact_name, @phone, @email,
          @trade_types, @service_areas,
          0, @web_url, @social_links_json,
          @offers_discount, @warranty_months, @photo_count, @supporting_doc_count,
          @discount_min_percent, @discount_max_percent,
          @company_number, @ch_status, @ch_name, @ch_checked_at, @ch_match_score,
          0, 'bronze', datetime('now'), datetime('now')
        )
        ON CONFLICT(user_id) DO UPDATE SET
          company_name=excluded.company_name,
          contact_name=excluded.contact_name,
          phone=excluded.phone,
          email=excluded.email,
          trade_types=excluded.trade_types,
          service_areas=excluded.service_areas,
          web_url=excluded.web_url,
          social_links_json=excluded.social_links_json,
          offers_discount=excluded.offers_discount,
          warranty_months=excluded.warranty_months,
          photo_count=excluded.photo_count,
          supporting_doc_count=excluded.supporting_doc_count,
          discount_min_percent=excluded.discount_min_percent,
          discount_max_percent=excluded.discount_max_percent,
          company_number=COALESCE(excluded.company_number, tradesmen.company_number),
          ch_status=COALESCE(excluded.ch_status, tradesmen.ch_status),
          ch_name=COALESCE(excluded.ch_name, tradesmen.ch_name),
          ch_checked_at=COALESCE(excluded.ch_checked_at, tradesmen.ch_checked_at),
          ch_match_score=COALESCE(excluded.ch_match_score, tradesmen.ch_match_score),
          updated_at=datetime('now')`
      ).run({
        user_id: uid,
        company_name: companyName,
        contact_name: contactName,
        phone,
        email,
        trade_types: tradeTypes,
        service_areas: serviceAreas,
        web_url: website,
        social_links_json: socialLinks,
        offers_discount: offersDiscount,
        warranty_months: warrantyMonths,
        photo_count: photoCount,
        supporting_doc_count: supportingDocCount,
        discount_min_percent: discountMinPercent,
        discount_max_percent: discountMaxPercent,
        company_number: companyNumber,
        ch_status: chStatus,
        ch_name: chName,
        ch_checked_at: chCheckedAt,
        ch_match_score: chMatchScore,
      });

      // NEW: sync tradesmen_photos from photoUrls
      db.prepare(
        `DELETE FROM tradesmen_photos WHERE tradesman_user_id = ?`
      ).run(uid);

      if (photoUrls.length > 0) {
        const insertPhoto = db.prepare(
          `INSERT INTO tradesmen_photos
             (tradesman_user_id, url, sort_order)
           VALUES (?, ?, ?)`
        );
        photoUrls.forEach((url, idx) => {
          insertPhoto.run(uid, url, idx);
        });
        console.log(
          `${TAG} inserted ${photoUrls.length} photos into tradesmen_photos for uid=${uid}`
        );
      } else {
        console.log(`${TAG} no photoUrls provided for uid=${uid}`);
      }

      // Recompute score + badge
      const r = db.prepare(`SELECT * FROM tradesmen WHERE user_id=?`).get(uid);
      const { score, badge } = computeScore(r);
      db.prepare(
        `UPDATE tradesmen SET vmb_score=?, vmb_badge=?, updated_at=datetime('now') WHERE user_id=?`
      ).run(score, badge, uid);
    });

    try {
      tx();
      const row = db
        .prepare(`SELECT * FROM tradesmen WHERE user_id=?`)
        .get(uid);
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
      console.error(`${TAG} db error:`, e?.message || e);
      return res.status(500).json({ error: "server_error" });
    }
  });

  if (!ctx.__logged_tradesmen_me_put) {
    ctx.__logged_tradesmen_me_put = true;
    console.log(`[routes] mounted: PUT /tradesmen/me`);
  }
};
