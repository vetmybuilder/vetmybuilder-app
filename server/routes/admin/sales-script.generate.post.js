// server/routes/admin/sales-script.generate.post.js
//
// POST /api/admin/sales-script/generate - regenerate the script
// markdown from the current primer via the LLM (stub in dev/test, real
// Claude when ANTHROPIC_API_KEY is set). Persists on success. Leaves
// existing script_content untouched on LLM failure.

const realGenerate = require("../../lib/sales/generateSalesScript").generateSalesScript;

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");
  const log = ctx.log || console;
  const TAG = "[admin.sales-script.generate]";

  // ctx._generateSalesScript is a test seam - production code calls the
  // real implementation from lib/sales/generateSalesScript.
  const generate = ctx._generateSalesScript || realGenerate;

  router.post(
    "/admin/sales-script/generate",
    auth,
    requireAdmin(ctx),
    async (_req, res) => {
      const rows = await mysqlQuery(
        `SELECT primer FROM sales_script WHERE id = 1 LIMIT 1`,
      );
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: "not_seeded" });
      }
      const primer = rows[0].primer;

      let text;
      try {
        text = await generate({ primer, mysqlQuery, log });
      } catch (err) {
        log.warn?.(`${TAG} llm failure`, { err: err?.message });
        return res.status(502).json({
          error: "llm_failed",
          message: err?.message || String(err),
        });
      }

      await mysqlQuery(
        `UPDATE sales_script
            SET script_json = ?, generated_at = NOW()
          WHERE id = 1`,
        [text],
      );

      return res.json({ ok: true, script_json: text });
    },
  );
};
