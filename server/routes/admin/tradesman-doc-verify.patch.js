// server/routes/admin/tradesman-doc-verify.patch.js
//
// PATCH /api/admin/tradesmen/:uid/docs/:idx
// Body: { verified: boolean }
//
// Admin-only. Toggles the `verified` flag on a single entry inside
// `tradesmen.supporting_docs_json`. Used by the admin drawer's "Mark
// verified" / "Unverify" buttons.
//
// We write the whole JSON array back rather than try to surgically
// update the entry - the array is tiny (typically <= 6 docs) and the
// race window is acceptable since only admin writes here.

const { requireAdmin } = require("../../lib/roles");
const { logAdminAction } = require("../../lib/adminAuditLog");

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
  const TAG = "[admin/tradesman-doc-verify.patch]";
  const adminGuard = requireAdmin(ctx);

  router.patch(
    "/admin/tradesmen/:uid/docs/:idx",
    auth,
    adminGuard,
    async (req, res) => {
      const uid = String(req.params.uid || "").trim();
      const idx = Number(req.params.idx);
      const verified = !!req.body?.verified;

      if (!uid) return res.status(400).json({ ok: false, error: "bad_uid" });
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ ok: false, error: "bad_idx" });
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

        const docs = parseDocsJson(rows[0].supporting_docs_json);
        if (idx >= docs.length) {
          return res.status(404).json({ ok: false, error: "doc_not_found" });
        }

        docs[idx] = {
          ...docs[idx],
          verified,
          verifiedAt: verified ? new Date().toISOString() : null,
          verifiedBy: verified ? req.user?.uid || null : null,
        };

        await mysqlQuery(
          "UPDATE tradesmen SET supporting_docs_json = ? WHERE user_id = ?",
          [JSON.stringify(docs), uid],
        );

        log.info?.(`${TAG} doc verification updated`, {
          admin: req.user?.uid,
          uid,
          idx,
          verified,
        });

        await logAdminAction({
          mysqlQuery,
          actorUid: req.user?.uid,
          targetUid: uid,
          action: verified ? "doc_verify" : "doc_unverify",
          details: {
            docIdx: idx,
            docType: docs[idx]?.type || null,
            docLabel: docs[idx]?.label || null,
          },
          log,
        });

        return res.json({ ok: true, doc: docs[idx] });
      } catch (err) {
        log.error?.(`${TAG} update failed`, {
          error: err?.message || err,
          uid,
          idx,
        });
        return res.status(500).json({ ok: false, error: "update_failed" });
      }
    },
  );

  if (!ctx.__logged_admin_tradesman_doc_verify_patch) {
    ctx.__logged_admin_tradesman_doc_verify_patch = true;
    log.info?.(`[routes] mounted: PATCH /admin/tradesmen/:uid/docs/:idx`);
  }
};
