// server/routes/admin/sales-script.put.js
//
// PUT /api/admin/sales-script - update the primer and/or script_content
// on the singleton row. At least one of the two fields must be present
// in the body.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  router.put(
    "/admin/sales-script",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const { primer, script_json } = req.body || {};
      const hasPrimer = typeof primer === "string";
      const hasScript = typeof script_json === "string";

      if (!hasPrimer && !hasScript) {
        return res.status(400).json({ error: "no_fields_to_update" });
      }

      // If script_json is supplied, validate it parses as JSON with a
      // categories[] array - otherwise the Read tab + teleprompter break.
      if (hasScript) {
        try {
          const parsed = JSON.parse(script_json);
          if (!parsed || !Array.isArray(parsed.categories)) {
            return res.status(400).json({ error: "script_json_shape_invalid" });
          }
        } catch (e) {
          return res.status(400).json({ error: "script_json_not_parseable" });
        }
      }

      const sets = [];
      const params = [];
      if (hasPrimer) {
        sets.push("primer = ?");
        params.push(primer);
      }
      if (hasScript) {
        sets.push("script_json = ?");
        params.push(script_json);
      }

      await mysqlQuery(
        `UPDATE sales_script SET ${sets.join(", ")} WHERE id = 1`,
        params,
      );

      return res.json({ ok: true });
    },
  );
};
