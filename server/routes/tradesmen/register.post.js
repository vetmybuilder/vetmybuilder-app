/**
 * POST /tradesmen/register          (PUBLIC – no auth)
 *
 * Body:
 *   { companyName, contactName?, phone?, email?, tradeTypes?, serviceAreas? }
 *
 * Saves a “tradesman lead” so vendors can submit details without signing in.
 * Response: { ok: true, id, created: boolean }
 */
module.exports = (router, ctx) => {
  const { db } = ctx;

  // ---- Schema (once) --------------------------------------------------------
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tradesmen_leads (
      id              TEXT PRIMARY KEY,
      company_name    TEXT NOT NULL,
      contact_name    TEXT,
      phone           TEXT,
      email           TEXT,
      trade_types     TEXT NOT NULL DEFAULT '',
      service_areas   TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_by_uid  TEXT
    )
  `
  ).run();

  db.prepare(
    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tradesmen_leads_email_company
    ON tradesmen_leads(email, company_name)
  `
  ).run();

  const genId = () =>
    `lead_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  // IMPORTANT: no API prefix here; the app mounts the router at /api already
  router.post("/tradesmen/register", (req, res) => {
    const {
      companyName,
      contactName = null,
      phone = null,
      email = null,
      tradeTypes = "",
      serviceAreas = "",
    } = req.body || {};

    const company = String(companyName || "").trim();
    const emailTrim = email ? String(email).trim() : null;

    if (!company)
      return res.status(400).json({ error: "companyName is required" });

    try {
      if (emailTrim) {
        const existing = db
          .prepare(
            `SELECT id FROM tradesmen_leads WHERE email=? AND company_name=? LIMIT 1`
          )
          .get(emailTrim, company);

        if (existing?.id) {
          db.prepare(
            `UPDATE tradesmen_leads SET
               contact_name=@contact_name,
               phone=@phone,
               trade_types=@trade_types,
               service_areas=@service_areas,
               updated_at=datetime('now')
             WHERE id=@id`
          ).run({
            id: existing.id,
            contact_name: contactName,
            phone,
            trade_types: String(tradeTypes || "").trim(),
            service_areas: String(serviceAreas || "").trim(),
          });

          return res
            .set("Cache-Control", "no-store")
            .json({ ok: true, id: existing.id, created: false });
        }
      }

      const id = genId();
      db.prepare(
        `INSERT INTO tradesmen_leads
           (id, company_name, contact_name, phone, email, trade_types, service_areas)
         VALUES
           (@id, @company_name, @contact_name, @phone, @email, @trade_types, @service_areas)`
      ).run({
        id,
        company_name: company,
        contact_name: contactName,
        phone,
        email: emailTrim,
        trade_types: String(tradeTypes || "").trim(),
        service_areas: String(serviceAreas || "").trim(),
      });

      return res
        .status(201)
        .set("Cache-Control", "no-store")
        .json({ ok: true, id, created: true });
    } catch (e) {
      console.error("[tradesmen/register] failed", e);
      return res.status(500).json({ error: "Failed to save" });
    }
  });

  if (!ctx.__logged_tradesmen_register_post) {
    ctx.__logged_tradesmen_register_post = true;
    console.log(`[routes] mounted: POST /tradesmen/register`);
  }
};
