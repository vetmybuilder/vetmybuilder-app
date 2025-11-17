/**
 * GET /api/tradesmen/me
 * Auth: required
 *
 * Returns 200 in all cases:
 *  - { role: "tradesman", profile: { ...row } }  when a profile exists (or was just auto-claimed)
 *  - { role: "user",       profile: null }       when nothing to return
 */
module.exports = (router, ctx) => {
  const { db, auth } = ctx;

  const tblExists = (name) => {
    try {
      return !!db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
    } catch {
      return false;
    }
  };

  const hasCol = (table, col) => {
    try {
      const rows = db.prepare(`PRAGMA table_info(${table})`).all();
      return rows.some((r) => r.name === col);
    } catch {
      return false;
    }
  };

  const ensureRoleTradesman = (uid) => {
    try {
      if (!tblExists("user_roles")) {
        db.prepare(
          `CREATE TABLE IF NOT EXISTS user_roles (uid TEXT PRIMARY KEY, role TEXT NOT NULL)`
        ).run();
      }
      db.prepare(
        `INSERT INTO user_roles(uid, role) VALUES(?, 'tradesman')
         ON CONFLICT(uid) DO UPDATE SET role='tradesman'`
      ).run(uid);
    } catch {}
  };

  function getProfileByUid(uid) {
    if (!tblExists("tradesmen")) return null;
    const key = hasCol("tradesmen", "user_id")
      ? "user_id"
      : hasCol("tradesmen", "uid")
      ? "uid"
      : null;
    if (!key) return null;
    return (
      db.prepare(`SELECT * FROM tradesmen WHERE ${key}=? LIMIT 1`).get(uid) ||
      null
    );
  }

  function claimDraftByEmail(uid, email) {
    if (!email || !tblExists("tradesmen")) return null;

    // Strategy A: claim an existing tradesmen row with matching email and no user binding yet
    const bindableCol = hasCol("tradesmen", "user_id")
      ? "user_id"
      : hasCol("tradesmen", "uid")
      ? "uid"
      : null;
    if (!bindableCol) return null;

    let row = null;
    try {
      // email column must exist to match
      if (hasCol("tradesmen", "email")) {
        row = db
          .prepare(
            `SELECT * FROM tradesmen WHERE email=? AND (${bindableCol} IS NULL OR ${bindableCol}='') LIMIT 1`
          )
          .get(email);
        if (row) {
          db.prepare(
            `UPDATE tradesmen
               SET ${bindableCol}=?, updated_at=datetime('now')
             WHERE rowid IN (SELECT rowid FROM tradesmen WHERE email=? AND (${bindableCol} IS NULL OR ${bindableCol}='') LIMIT 1)`
          ).run(uid, email);
          ensureRoleTradesman(uid);
          return getProfileByUid(uid);
        }
      }
    } catch {}

    // Strategy B: if you kept a leads table, migrate the newest lead
    if (tblExists("tradesmen_leads")) {
      try {
        const lead = db
          .prepare(
            `SELECT * FROM tradesmen_leads WHERE email=? AND (claimed_at IS NULL OR claimed_at='') ORDER BY created_at DESC LIMIT 1`
          )
          .get(email);
        if (lead) {
          // create a bound tradesmen row
          const hasStatus = hasCol("tradesmen", "status");
          const hasCompany = hasCol("tradesmen", "company_name");
          const hasContact = hasCol("tradesmen", "contact_name");
          const hasPhone = hasCol("tradesmen", "phone");
          const hasEmail = hasCol("tradesmen", "email");
          const hasTrades = hasCol("tradesmen", "trade_types");
          const hasAreas = hasCol("tradesmen", "service_areas");

          const cols = [
            bindableCol,
            hasCompany && "company_name",
            hasContact && "contact_name",
            hasPhone && "phone",
            hasEmail && "email",
            hasTrades && "trade_types",
            hasAreas && "service_areas",
            hasStatus && "status",
          ].filter(Boolean);
          const vals = [
            uid,
            hasCompany && lead.company_name,
            hasContact && lead.contact_name,
            hasPhone && lead.phone,
            hasEmail && lead.email,
            hasTrades && (lead.trade_types || ""),
            hasAreas && (lead.service_areas || ""),
            hasStatus && "draft",
          ].filter((v) => v !== false);

          db.prepare(
            `INSERT INTO tradesmen (${cols.join(",")}) VALUES (${cols
              .map(() => "?")
              .join(",")})`
          ).run(vals);

          db.prepare(
            `UPDATE tradesmen_leads SET claimed_at=datetime('now') WHERE id=?`
          ).run(lead.id);
          ensureRoleTradesman(uid);
          return getProfileByUid(uid);
        }
      } catch {}
    }

    return null;
  }

  // NEW: pull existing photo URLs from tradesmen_photos, if present
  function getPhotoUrls(uid) {
    if (!tblExists("tradesmen_photos")) return [];
    try {
      const rows = db
        .prepare(
          `SELECT url
             FROM tradesmen_photos
            WHERE tradesman_user_id = ?
            ORDER BY sort_order ASC, id ASC`
        )
        .all(uid);
      return rows.map((r) => r.url).filter(Boolean);
    } catch {
      return [];
    }
  }

  router.get("/tradesmen/me", auth, (req, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || null;

      // existing?
      let profile = getProfileByUid(uid);

      // no profile yet? try to auto-claim by email
      if (!profile && email) {
        profile = claimDraftByEmail(uid, email);
      }

      if (profile) {
        // Attach photo_urls for front-end edit/view flows
        const photos = getPhotoUrls(uid);
        profile.photo_urls = photos;

        return res
          .set("Cache-Control", "no-store")
          .json({ role: "tradesman", profile });
      }
      return res
        .set("Cache-Control", "no-store")
        .json({ role: "user", profile: null });
    } catch (e) {
      return res
        .set("Cache-Control", "no-store")
        .json({ role: "user", profile: null });
    }
  });
};