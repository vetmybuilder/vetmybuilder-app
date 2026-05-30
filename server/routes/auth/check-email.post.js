/**
 * POST /api/auth/check-email
 * Body: { email: string }
 * Returns:
 *   { ok: true, exists: boolean, existsNormalized: boolean, projectId: string }
 *
 * Checks Firebase Auth for email existence, including normalized Gmail variants.
 */

const { logger, withRequest } = require("../../lib/logger");
const { signupLimiter } = require("../../lib/rateLimiters");
const { isFlagEnabled } = require("../../lib/featureFlags");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx; // route does NOT require auth, kept for consistency

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

  router.post("/auth/check-email", signupLimiter, async (req, res) => {
    const log = withRequest(req).child({ route: "auth.check-email" });

    const role = String(req.body?.role || "").toLowerCase();
    const isTrader =
      role === "trader" || role === "tradesman" || role === "tradesperson";

    // Master switch: homeowner signup must be enabled. Traders are exempt.
    if (!isTrader && mysqlQuery) {
      const signupOpen = await isFlagEnabled(mysqlQuery, "homeowner_signup");
      if (!signupOpen) {
        return res.status(403).json({ ok: false, error: "signup_closed" });
      }
    }

    // Beta access code check - per-role admin flag, both default off.
    // `beta_code_homeowner` controls homeowner signup (email + SSO);
    // `beta_code_trader` controls trader signup (email + SSO). Code
    // value lives in BETA_CODE env; if the flag is on but env is
    // missing/empty, no provided code can match, so we 403.
    if (mysqlQuery) {
      const betaCodeFlag = isTrader
        ? "beta_code_trader"
        : "beta_code_homeowner";
      const betaCodeRequired = await isFlagEnabled(mysqlQuery, betaCodeFlag);
      if (betaCodeRequired) {
        const expected = String(process.env.BETA_CODE || "").trim();
        const provided = String(req.body?.betaCode || "").trim();
        if (!expected || provided !== expected) {
          return res
            .status(403)
            .json({ ok: false, error: "invalid_beta_code" });
        }
      }
    }

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
