// server/routes/admin/users.post.js
const { logger, withRequest } = require("../../lib/logger");
const { updateUserLocationMysql } = require("../../lib/location");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, admin: firebaseAdmin } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.post("/admin/users", auth, requireAdmin(ctx), async (req, res) => {
    const log = withRequest(req).child({ route: "admin.users.create" });

    try {
      const {
        email, password, firstName, lastName, location,
        role = "user",
        tradesman,
      } = req.body || {};

      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          error: "missing_fields",
          message: "Email, password, first name, and last name are required.",
        });
      }

      if (!["user", "tradesman", "admin"].includes(role)) {
        return res.status(400).json({ error: "invalid_role" });
      }

      if (role === "tradesman" && !tradesman?.companyName) {
        return res.status(400).json({
          error: "missing_fields",
          message: "Company name is required for tradesmen.",
        });
      }

      let fbUser;
      try {
        fbUser = await firebaseAdmin.auth().createUser({
          email,
          password,
          displayName: `${firstName} ${lastName}`.trim(),
        });
      } catch (err) {
        log.warn({ err: err?.message, email }, "Firebase user creation failed");
        if (err?.code === "auth/email-already-exists") {
          return res.status(409).json({ error: "email_exists", message: "Email already in use." });
        }
        return res.status(500).json({ error: "firebase_error", message: err?.message });
      }

      const uid = fbUser.uid;

      try {
        await mysqlQuery(
          `INSERT INTO users (uid, email, firstName, lastName, locationRaw, createdAt)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             email = VALUES(email), firstName = VALUES(firstName),
             lastName = VALUES(lastName), locationRaw = VALUES(locationRaw)`,
          [uid, email, firstName.trim(), lastName.trim(), location || null],
        );
        if (location) {
          await updateUserLocationMysql(mysqlQuery, uid, location);
        }
      } catch (err) {
        log.error({ err: err?.message, uid }, "MySQL user insert failed");
        return res.status(500).json({ error: "db_error" });
      }

      try {
        await mysqlQuery(
          `INSERT INTO user_roles (uid, role) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role)`,
          [uid, role],
        );
      } catch (err) {
        log.error({ err: err?.message, uid }, "role insert failed");
      }

      if (role === "tradesman" && tradesman) {
        try {
          await mysqlQuery(
            `INSERT INTO tradesmen (user_id, company_name, trade_types, service_areas, status, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               company_name = VALUES(company_name), trade_types = VALUES(trade_types),
               service_areas = VALUES(service_areas), status = VALUES(status)`,
            [uid, tradesman.companyName, tradesman.tradeTypes || "", tradesman.serviceAreas || "", tradesman.status || "draft"],
          );
        } catch (err) {
          log.error({ err: err?.message, uid }, "tradesman insert failed");
        }
      }

      log.info({ uid, email, role }, "admin created user");
      return res.status(201).json({
        ok: true,
        user: { uid, email, firstName, lastName, location, role },
      });
    } catch (err) {
      log.error({ err: err?.message }, "admin create user failed");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
