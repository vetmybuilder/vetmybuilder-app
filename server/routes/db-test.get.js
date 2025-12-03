// server/routes/db-test.get.js
const { query } = require("../lib/mysql");

module.exports = (router, ctx) => {
  router.get("/db-test", async (req, res) => {
    try {
      const rows = await query("SELECT COUNT(*) AS count FROM users");
      res.json({
        ok: true,
        message: "MySQL connection working",
        userCount: rows[0].count,
      });
    } catch (err) {
      console.error("MySQL test error:", err);
      res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });
};
