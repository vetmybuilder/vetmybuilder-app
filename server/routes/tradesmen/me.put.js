/**
 * PUT {API_PREFIX}/tradesmen/me
 * Body: { companyName, contactName?, phone?, email?, tradeTypes?, serviceAreas? }
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  const BASE = (ctx.API_PREFIX || "/api").replace(/\/+$/, "");
  const at = (p) => `${BASE}${p.startsWith("/") ? p : `/${p}`}`;

  // ensure tables
  db.prepare(`CREATE TABLE IF NOT EXISTS user_roles (uid TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user')`).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS tradesmen (
      user_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT, phone TEXT, email TEXT,
      trade_types TEXT DEFAULT '', service_areas TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      subscription_status TEXT DEFAULT 'free',
      contact_credits INTEGER DEFAULT 0
    )
  `).run();

  router.put(at("/tradesmen/me"), auth, (req, res) => {
    const uid = req.user.uid;
    const {
      companyName,
      contactName = null,
      phone = null,
      email = null,
      tradeTypes = "",
      serviceAreas = "",
    } = req.body || {};

    if (!companyName || !String(companyName).trim()) {
      return res.status(400).json({ error: "companyName is required" });
    }

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO tradesmen (user_id, company_name, contact_name, phone, email, trade_types, service_areas)
         VALUES (@uid, @company_name, @contact_name, @phone, @email, @trade_types, @service_areas)
         ON CONFLICT(user_id) DO UPDATE SET
           company_name=excluded.company_name,
           contact_name=excluded.contact_name,
           phone=excluded.phone,
           email=excluded.email,
           trade_types=excluded.trade_types,
           service_areas=excluded.service_areas,
           updated_at=datetime('now')`
      ).run({
        uid,
        company_name: String(companyName).trim(),
        contact_name: contactName,
        phone,
        email,
        trade_types: String(tradeTypes || "").trim(),
        service_areas: String(serviceAreas || "").trim(),
      });

      db.prepare(
        `INSERT INTO user_roles (uid, role) VALUES (?, 'tradesman')
         ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
      ).run(uid);
    });
    tx();

    const profile = db.prepare(`SELECT * FROM tradesmen WHERE user_id=?`).get(uid);
    res.json({ ok: true, profile });
  });

  if (!ctx.__logged_tradesmen_me_put) {
    ctx.__logged_tradesmen_me_put = true;
    console.log(`[routes] mounted: PUT ${at("/tradesmen/me")}`);
  }
};
