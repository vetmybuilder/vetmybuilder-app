// server/routes/admin/users.put.js
const { logger, withRequest } = require("../../lib/logger");
const { updateUserLocationMysql } = require("../../lib/location");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, admin: firebaseAdmin } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.put("/admin/users/:uid", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.users.update" });
    const uid = req.params.uid;

    try {
      const { email, password, firstName, lastName, location, role, tradesman } = req.body || {};

      const fbUpdate = {};
      if (email) fbUpdate.email = email;
      if (password) fbUpdate.password = password;
      if (firstName || lastName) {
        fbUpdate.displayName = `${firstName || ""} ${lastName || ""}`.trim();
      }
      if (Object.keys(fbUpdate).length > 0) {
        try {
          await firebaseAdmin.auth().updateUser(uid, fbUpdate);
        } catch (err) {
          log.warn({ err: err?.message, uid }, "Firebase user update failed");
          if (err?.code === "auth/user-not-found") {
            return res.status(404).json({ error: "user_not_found" });
          }
          return res.status(500).json({ error: "firebase_error", message: err?.message });
        }
      }

      const sets = [];
      const params = [];
      if (email) { sets.push("email = ?"); params.push(email); }
      if (firstName) { sets.push("firstName = ?"); params.push(firstName.trim()); }
      if (lastName) { sets.push("lastName = ?"); params.push(lastName.trim()); }
      if (location !== undefined) { sets.push("locationRaw = ?"); params.push(location || null); }

      if (sets.length > 0) {
        params.push(uid);
        await mysqlQuery(`UPDATE users SET ${sets.join(", ")} WHERE uid = ?`, params);
      }

      if (location) {
        await updateUserLocationMysql(mysqlQuery, uid, location);
      }

      if (role && ["user", "tradesman", "admin"].includes(role)) {
        await mysqlQuery(
          `INSERT INTO user_roles (uid, role) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role)`,
          [uid, role],
        );
      }

      if (role === "tradesman" && tradesman) {
        await mysqlQuery(
          `INSERT INTO tradesmen (user_id, company_name, trade_types, service_areas, status, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             company_name = VALUES(company_name), trade_types = VALUES(trade_types),
             service_areas = VALUES(service_areas), status = VALUES(status)`,
          [uid, tradesman.companyName || "", tradesman.tradeTypes || "", tradesman.serviceAreas || "", tradesman.status || "draft"],
        );
      }

      log.info({ uid, role }, "admin updated user");
      return res.json({ ok: true });
    } catch (err) {
      log.error({ err: err?.message, uid }, "admin update user failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
