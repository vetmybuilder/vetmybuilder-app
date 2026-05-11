// server/routes/tradesmen/docs.get.js
//
// Authed proxy for supporting-document downloads. Replaces direct public
// R2 URLs - the docs bucket is private, and only the owning tradesperson
// (their own docs) or an admin (any tradesperson's docs) can request a
// short-lived presigned URL.
//
// Two routes:
//
//   GET /api/tradesmen/me/docs/:idx          - owner-only (req.user.uid)
//   GET /api/admin/tradesmen/:uid/docs/:idx  - admin-only
//
// `:idx` is the zero-based index into `tradesmen.supporting_docs_json`.
// On hit, the server resolves the entry's `fileKey` (or legacy
// `fileUrl`), mints a 5-minute presigned R2 URL, and 302s the client to
// it. The browser fetches the file direct from R2 - the server doesn't
// proxy bytes.

const {
  getPresignedReadUrl,
  publicUrlToKey,
  isR2Configured,
} = require("../../lib/r2");
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

// Pick the key to fetch from a doc entry. Newer rows store `fileKey`
// directly; older rows still carry a `fileUrl` pointing at the public
// bucket - extract the key from the URL so legacy uploads keep working.
function resolveKey(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.fileKey === "string" && entry.fileKey) return entry.fileKey;
  if (typeof entry.fileUrl === "string" && entry.fileUrl) {
    return publicUrlToKey(entry.fileUrl);
  }
  return null;
}

async function streamPresigned(res, key, log, TAG) {
  try {
    const signedUrl = await getPresignedReadUrl(key);
    // No-store on the 302 itself - we never want a CDN or browser to
    // cache the redirect since the signed URL inside expires.
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.redirect(302, signedUrl);
  } catch (e) {
    log.error?.(`${TAG} presign failed`, { error: e?.message || e, key });
    return res.status(500).json({ ok: false, error: "presign_failed" });
  }
}

async function loadDocs(mysqlQuery, ownerUid) {
  const rows = await mysqlQuery(
    "SELECT supporting_docs_json FROM tradesmen WHERE user_id = ? LIMIT 1",
    [ownerUid],
  );
  if (!rows || !rows.length) return null;
  return parseDocsJson(rows[0].supporting_docs_json);
}

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  const log = ctx.log || console;
  const TAG = "[tradesmen/docs.get]";
  const adminGuard = requireAdmin(ctx);

  if (!isR2Configured) {
    log.info?.(
      `${TAG} R2 not configured - presigned downloads will return 503 until R2_* env is set`,
    );
  }

  // ---- Owner endpoint ----
  router.get("/tradesmen/me/docs/:idx", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!isR2Configured) {
      return res.status(503).json({ ok: false, error: "r2_not_configured" });
    }

    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0) {
      return res.status(400).json({ ok: false, error: "bad_idx" });
    }

    const docs = await loadDocs(mysqlQuery, uid);
    if (!docs) return res.status(404).json({ ok: false, error: "no_profile" });

    const entry = docs[idx];
    const key = resolveKey(entry);
    if (!key) return res.status(404).json({ ok: false, error: "not_found" });

    return streamPresigned(res, key, log, TAG);
  });

  // ---- Admin endpoint ----
  // requireAdmin already gates on the admin role; we deliberately keep
  // the route under /admin/* so route-tree audits can grep for admin-only
  // paths in one place.
  router.get(
    "/admin/tradesmen/:uid/docs/:idx",
    auth,
    adminGuard,
    async (req, res) => {
      if (!isR2Configured) {
        return res.status(503).json({ ok: false, error: "r2_not_configured" });
      }

      const targetUid = String(req.params.uid || "").trim();
      const idx = Number(req.params.idx);
      if (!targetUid) {
        return res.status(400).json({ ok: false, error: "bad_uid" });
      }
      if (!Number.isInteger(idx) || idx < 0) {
        return res.status(400).json({ ok: false, error: "bad_idx" });
      }

      const docs = await loadDocs(mysqlQuery, targetUid);
      if (!docs) {
        return res.status(404).json({ ok: false, error: "tradesman_not_found" });
      }

      const entry = docs[idx];
      const key = resolveKey(entry);
      if (!key) return res.status(404).json({ ok: false, error: "not_found" });

      log.info?.(`${TAG} admin viewed doc`, {
        admin: req.user?.uid,
        targetUid,
        idx,
      });
      return streamPresigned(res, key, log, TAG);
    },
  );

  if (!ctx.__logged_tradesmen_docs_get) {
    ctx.__logged_tradesmen_docs_get = true;
    log.info?.(
      `[routes] mounted: GET /tradesmen/me/docs/:idx, GET /admin/tradesmen/:uid/docs/:idx`,
    );
  }
};
