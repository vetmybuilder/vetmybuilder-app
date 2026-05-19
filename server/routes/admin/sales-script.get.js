// server/routes/admin/sales-script.get.js
//
// GET /api/admin/sales-script - returns the singleton sales-script row.
// First call seeds the row with the default primer so the page is
// usable on a fresh install.

const { DEFAULT_PRIMER } = require("../../lib/sales/defaultPrimer");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.get(
    "/admin/sales-script",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      let rows = await mysqlQuery(
        `SELECT id, primer, script_json, generated_at, updated_at
           FROM sales_script
          WHERE id = 1
          LIMIT 1`,
      );
      if (!rows || rows.length === 0) {
        await mysqlQuery(
          `INSERT INTO sales_script (id, primer) VALUES (1, ?)`,
          [DEFAULT_PRIMER],
        );
        rows = await mysqlQuery(
          `SELECT id, primer, script_json, generated_at, updated_at
             FROM sales_script
            WHERE id = 1
            LIMIT 1`,
        );
      }
      const row = rows[0];
      return res.json({
        primer: row.primer,
        script_json: row.script_json,
        generated_at: row.generated_at,
        updated_at: row.updated_at,
      });
    },
  );
};
