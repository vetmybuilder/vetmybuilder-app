/**
 * POST /api/auth/check-email
 * Body: { email: string }
 * Returns:
 *   { ok: true, exists: boolean, existsNormalized: boolean, projectId: string }
 *
 * Notes:
 * - Checks Firebase Auth (not your DB).
 * - Normalizes Gmail-style aliases (dots and "+tag") when checking.
 * - Safe to use in both dev and prod; shows projectId for sanity checks.
 */
module.exports = (router, ctx) => {
  const { auth } = ctx; // your API auth middleware (if any); this route usually does NOT require login

  // Lazy init Firebase Admin if your app hasn't already
  let admin;
  try {
    admin = require("firebase-admin");
  } catch (e) {
    console.error("[check-email] firebase-admin not installed");
  }

  // ensure admin app
  function getAdmin() {
    if (!admin) throw new Error("firebase-admin not available");
    if (admin.apps && admin.apps.length) return admin;
    // Init if not already initialized; use default credentials / env
    admin.initializeApp();
    return admin;
  }

  const normalizeGmail = (raw) => {
    const email = String(raw || "")
      .trim()
      .toLowerCase();
    const m = email.match(/^([^@]+)@(gmail\.com|googlemail\.com)$/i);
    if (!m) return email;
    let local = m[1];
    // strip +tag
    local = local.replace(/\+.*/, "");
    // remove dots
    local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  };

  router.post("/auth/check-email", async (req, res) => {
    try {
      const raw = String(req.body?.email || "").trim();
      if (!raw)
        return res.status(400).json({ ok: false, error: "email required" });

      const email = raw.toLowerCase();
      const norm = normalizeGmail(email);

      const adm = getAdmin();
      const projectId =
        (adm.app && adm.app().options && adm.app().options.projectId) ||
        process.env.GCLOUD_PROJECT ||
        "";

      const hit = async (addr) => {
        try {
          const user = await adm.auth().getUserByEmail(addr);
          return !!user?.uid;
        } catch (e) {
          // auth/user-not-found is expected → not exists
          if (e?.code === "auth/user-not-found") return false;
          // any other error: surface as 502 to reveal misconfig
          console.error(
            "[check-email] getUserByEmail error:",
            e?.code || e?.message || e
          );
          throw e;
        }
      };

      const exists = await hit(email);
      let existsNormalized = exists;

      if (!exists && norm !== email) {
        existsNormalized = await hit(norm);
      }

      return res.json({ ok: true, exists, existsNormalized, projectId });
    } catch (e) {
      return res
        .status(502)
        .json({ ok: false, error: e?.message || "provider_error" });
    }
  });
};
