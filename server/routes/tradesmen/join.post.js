// server/routes/tradesmen/join.post.js
/**
 * POST /tradesmen/join   (no auth)
 * Body:
 *  {
 *    companyName, contactName?, phone?, email?, tradeTypes?, serviceAreas?,
 *    discountMinPercent, discountMaxPercent, warrantyMonths, docs?
 *  }
 * Writes a DRAFT vendor row (user_id = lead_*), and (if table exists) a draft offer row.
 */
module.exports = (router, ctx) => {
  const { db } = ctx;
  const ROUTE = "/tradesmen/join";

  // ----- helpers -----
  const tblExists = (name) => {
    try {
      return !!db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
    } catch {
      return false;
    }
  };

  const tblCols = (name) => {
    try {
      return new Set(
        db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((r) => r.name)
      );
    } catch {
      return new Set();
    }
  };

  // Log on boot so you can confirm mount
  if (!ctx.__mounted_join_post) {
    ctx.__mounted_join_post = true;
    const base = ctx.API_PREFIX || "/api";
    console.log(`[routes] mounted: POST ${base}${ROUTE}`);
  }

  // Ensure minimal tables if they somehow don't exist (safe no-ops if they do)
  try {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS tradesmen (
        user_id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        trade_types TEXT DEFAULT '',
        service_areas TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        subscription_status TEXT DEFAULT 'draft',
        contact_credits INTEGER DEFAULT 0
      )
    `
    ).run();
  } catch (e) {
    console.error("[join] failed ensure tradesmen table", e);
  }

  router.post(ROUTE, (req, res) => {
    const ip =
      req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const now = new Date().toISOString();

    console.log(`[join] --> request @ ${now} ip=${ip}`);
    console.log("[join] body =", req.body);

    const {
      companyName,
      contactName = null,
      phone = null,
      email = null,
      tradeTypes = "",
      serviceAreas = "",
      discountMinPercent = 0,
      discountMaxPercent = 0,
      warrantyMonths = 0, // 0|3|6|12|24
    } = req.body || {};

    if (!companyName || !String(companyName).trim()) {
      console.warn("[join] 400 missing companyName");
      return res.status(400).json({ error: "companyName is required" });
    }

    // clamp and normalise
    const minPct = Math.max(
      0,
      Math.min(30, Math.round(Number(discountMinPercent) || 0))
    );
    const maxPct = Math.max(
      0,
      Math.min(30, Math.round(Number(discountMaxPercent) || 0))
    );
    const wMonths = [0, 3, 6, 12, 24].includes(Number(warrantyMonths))
      ? Number(warrantyMonths)
      : 0;

    // make a lead id (draft user_id)
    const leadId =
      "lead_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8);

    try {
      const tx = db.transaction(() => {
        // upsert draft vendor
        db.prepare(
          `
          INSERT INTO tradesmen
            (user_id, company_name, contact_name, phone, email, trade_types, service_areas, subscription_status)
          VALUES
            (@user_id, @company_name, @contact_name, @phone, @email, @trade_types, @service_areas, 'draft')
          ON CONFLICT(user_id) DO UPDATE SET
            company_name=excluded.company_name,
            contact_name=excluded.contact_name,
            phone=excluded.phone,
            email=excluded.email,
            trade_types=excluded.trade_types,
            service_areas=excluded.service_areas,
            updated_at=datetime('now'),
            subscription_status='draft'
        `
        ).run({
          user_id: leadId,
          company_name: String(companyName).trim(),
          contact_name: contactName,
          phone,
          email,
          trade_types: String(tradeTypes || "").trim(),
          service_areas: String(serviceAreas || "").trim(),
        });

        // optional: draft offer, only if table + needed cols exist
        if (tblExists("tradesmen_offers")) {
          const cols = tblCols("tradesmen_offers");

          const has = (c) => cols.has(c);
          const colMin = has("discount_min_percent")
            ? "discount_min_percent"
            : has("discount_min_perce")
            ? "discount_min_perce"
            : null;
          const colMax = has("discount_max_percent")
            ? "discount_max_percent"
            : has("discount_max_perce")
            ? "discount_max_perce"
            : null;

          // Build a flexible insert based on available columns
          const fields = [
            "user_id",
            "kind",
            "title",
            "value_type",
            "value_numeric",
            "is_active",
            "priority",
          ];
          const params = [
            "@user_id",
            "@kind",
            "@title",
            "@value_type",
            "@value_numeric",
            1,
            0,
          ];

          if (has("value_currency")) {
            fields.push("value_currency");
            params.push("'GBP'");
          }
          if (colMin) {
            fields.push(colMin);
            params.push("@discount_min");
          }
          if (colMax) {
            fields.push(colMax);
            params.push("@discount_max");
          }
          if (has("created_at")) {
            fields.push("created_at");
            params.push("datetime('now')");
          }
          if (has("updated_at")) {
            fields.push("updated_at");
            params.push("datetime('now')");
          }
          if (has("description")) {
            fields.push("description");
            params.push("@desc");
          }
          if (has("terms_url")) {
            fields.push("terms_url");
            params.push("@terms");
          }
          if (has("warranty_months")) {
            fields.push("warranty_months");
            params.push("@wmonths");
          }

          const sql = `
            INSERT INTO tradesmen_offers (${fields.join(",")})
            VALUES (${params.join(",")})
          `;

          db.prepare(sql).run({
            user_id: leadId,
            kind: "discount",
            title: "Signup discount",
            value_type: "percent",
            value_numeric: maxPct, // headline value
            discount_min: minPct,
            discount_max: maxPct,
            desc: "Automatically created on signup.",
            terms: "",
            wmonths: wMonths,
          });
        }
      });

      tx();

      console.log("[join] 201 created draft vendor", {
        leadId,
        minPct,
        maxPct,
        wMonths,
      });
      return res.status(201).json({ ok: true, id: leadId, created: true });
    } catch (e) {
      console.error("[join] 500 failure", e);
      return res.status(500).json({ error: "Failed to save vendor draft" });
    }
  });
};
