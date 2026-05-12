// server/routes/admin/tradesman-docs.get.js
//
// GET /api/admin/tradesmen/:uid/docs
// Admin-only. Returns the parsed `supporting_docs_json` array for one
// tradesman, plus a per-doc `verified` flag (false for entries that
// haven't been admin-reviewed yet).
//
// The actual file bytes are NOT included - the admin UI follows up
// with GET /api/admin/tradesmen/:uid/docs/:idx to fetch the file via
// a presigned R2 URL.
//
// Response shape:
//   { docs: [{ type, label, fileName, fileKey?, fileUrl?, verified }, ...] }

const { requireAdmin } = require("../../lib/roles");

function parseDocsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  const log = ctx.log || console;
  const TAG = "[admin/tradesman-docs.get]";
  const adminGuard = requireAdmin(ctx);

  router.get(
    "/admin/tradesmen/:uid/docs",
    auth,
    adminGuard,
    async (req, res) => {
      const uid = String(req.params.uid || "").trim();
      if (!uid) {
        return res.status(400).json({ ok: false, error: "bad_uid" });
      }

      try {
        const rows = await mysqlQuery(
          "SELECT supporting_docs_json FROM tradesmen WHERE user_id = ? LIMIT 1",
          [uid],
        );
        if (!rows || rows.length === 0) {
          return res
            .status(404)
            .json({ ok: false, error: "tradesman_not_found" });
        }

        const docs = parseDocsJson(rows[0].supporting_docs_json).map((d) => ({
          type: typeof d?.type === "string" ? d.type : "other",
          label: typeof d?.label === "string" ? d.label : "",
          customType: typeof d?.customType === "string" ? d.customType : null,
          fileName: typeof d?.fileName === "string" ? d.fileName : null,
          fileKey: typeof d?.fileKey === "string" ? d.fileKey : null,
          // Legacy field still returned so the UI can detect older rows
          // even though the download endpoint always resolves to a key.
          fileUrl: typeof d?.fileUrl === "string" ? d.fileUrl : null,
          // Per-doc admin verification - new flag, defaults false until
          // an admin clicks "Mark verified" on the doc.
          verified: d?.verified === true,
          verifiedAt: typeof d?.verifiedAt === "string" ? d.verifiedAt : null,
          verifiedBy: typeof d?.verifiedBy === "string" ? d.verifiedBy : null,
        }));

        return res.json({ ok: true, docs });
      } catch (err) {
        log.error?.(`${TAG} load failed`, {
          error: err?.message || err,
          uid,
        });
        return res.status(500).json({ ok: false, error: "load_failed" });
      }
    },
  );

  if (!ctx.__logged_admin_tradesman_docs_get) {
    ctx.__logged_admin_tradesman_docs_get = true;
    log.info?.(`[routes] mounted: GET /admin/tradesmen/:uid/docs`);
  }
};
