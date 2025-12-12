/**
 * POST /api/auth/check-email
 * Body: { email: string }
 * Returns:
 *   { ok: true, exists: boolean, existsNormalized: boolean, projectId: string }
 *
 * Checks Firebase Auth for email existence, including normalized Gmail variants.
 */

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth } = ctx; // route does NOT require auth, kept for consistency

  // Firebase Admin lazy-init
  let admin;
  try {
    admin = require("firebase-admin");
  } catch (e) {
    logger.error(
      { err: e?.message },
      "[check-email] firebase-admin not installed"
    );
  }

  function getAdmin() {
    if (!admin) {
      throw new Error("firebase-admin not available");
    }
    if (admin.apps && admin.apps.length) return admin;

    admin.initializeApp(); // safe default init
    return admin;
  }

  const normalizeGmail = (raw) => {
    const email = String(raw || "")
      .trim()
      .toLowerCase();

    const m = email.match(/^([^@]+)@(gmail\.com|googlemail\.com)$/i);
    if (!m) return email;

    let local = m[1];
    local = local.replace(/\+.*/, ""); // remove +tag
    local = local.replace(/\./g, ""); // remove dots

    return `${local}@gmail.com`;
  };

  router.post("/auth/check-email", async (req, res) => {
    const log = withRequest(req).child({ route: "auth.check-email" });

    try {
      const raw = String(req.body?.email || "").trim();
      if (!raw) {
        log.warn("Missing email in request");
        return res.status(400).json({ ok: false, error: "email required" });
      }

      const email = raw.toLowerCase();
      const norm = normalizeGmail(email);

      log.info(
        { email, normalized: norm },
        "Checking email existence in Firebase Auth"
      );

      const adm = getAdmin();

      const projectId =
        adm?.app?.().options?.projectId || process.env.GCLOUD_PROJECT || "";

      async function hit(addr) {
        try {
          const user = await adm.auth().getUserByEmail(addr);
          return !!user?.uid;
        } catch (e) {
          if (e?.code === "auth/user-not-found") {
            return false;
          }

          log.error(
            {
              lookupEmail: addr,
              errCode: e?.code,
              errMsg: e?.message,
            },
            "Failed Firebase getUserByEmail call"
          );

          // Something wrong with Firebase — treat as provider error
          throw e;
        }
      }

      const exists = await hit(email);
      let existsNormalized = exists;

      if (!exists && norm !== email) {
        existsNormalized = await hit(norm);
      }

      log.info(
        {
          email,
          exists,
          existsNormalized,
          normalized: norm,
          projectId,
        },
        "Email lookup complete"
      );

      return res.json({
        ok: true,
        exists,
        existsNormalized,
        projectId,
      });
    } catch (e) {
      log.error(
        {
          err: e?.message,
          stack: e?.stack,
        },
        "Unhandled error in check-email endpoint"
      );

      return res.status(502).json({
        ok: false,
        error: e?.message || "provider_error",
      });
    }
  });
};
