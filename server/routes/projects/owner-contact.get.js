// server/routes/projects/owner-contact.get.js
//
// UPDATED ENTITLEMENT + VERIFICATION MODEL:
//
// 1) Verification is REQUIRED before any payment really "counts":
//    - tradesmen.verification_status:
//        "unverified" | "pending" | "approved" | "rejected"
//
// 2) Entitlement rules:
//    ✔ Gold (active subscription) + verification = global unlock
//    ✔ One-off unlocks with APPROVED or ACTIVE state give access (per project)
//    ✔ Spotlight does NOT unlock contact
//
// 3) Non-entitled responses are always 200 with ok:false / unlocked:false
//    so the UI can branch without noisy 4xx errors.
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  router.get("/projects/:id/owner-contact", auth, async (req, res) => {
    const viewerUid = req.user?.uid;
    const projectId = Number(req.params.id);

    const log = withRequest(req, logger).child({
      route: "/projects/:id/owner-contact",
      viewerUid,
      projectId,
      action: "owner_contact_check",
    });

    try {
      // --------------------------------------
      // 0. Auth
      // --------------------------------------
      if (!viewerUid) {
        log.warn("Unauthorized viewer");
        return res.status(401).json({ error: "unauthorized" });
      }

      // --------------------------------------
      // 1. Validate project ID
      // --------------------------------------
      if (!Number.isFinite(projectId) || projectId <= 0) {
        log.warn("Invalid project ID");
        return res.status(400).json({ error: "invalid_project_id" });
      }

      // --------------------------------------
      // 2. Load project
      // --------------------------------------
      let project;
      try {
        const rows = await mysqlQuery(
          `
          SELECT id,
                 ownerUserId,
                 LOWER(COALESCE(status,'')) AS status
          FROM projects
          WHERE id = ?
          `,
          [projectId]
        );
        project = rows[0] || null;
      } catch (err) {
        log.error({ err }, "Failed loading project");
        return res.status(500).json({ error: "internal_error" });
      }

      if (!project) {
        log.info("Project not found");
        return res.status(404).json({ error: "project_not_found" });
      }

      // --------------------------------------
      // 3. Project must be live
      // --------------------------------------
      if (project.status !== "live") {
        log.info("Contact not available because project not live");
        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: "project_not_live",
          state: "project_not_live",
        });
      }

      // --------------------------------------
      // 4. Owner cannot request their own contact
      // --------------------------------------
      if (project.ownerUserId === viewerUid) {
        log.info("Owner attempted to fetch own contact – blocked");
        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: "owner_cannot_request_own_contact",
          state: "owner_cannot_request_own_contact",
        });
      }

      // --------------------------------------
      // 5. Fetch plan + verification info
      // --------------------------------------
      async function getPlanAndVerification(uid) {
        try {
          const rows = await mysqlQuery(
            `
            SELECT
              LOWER(COALESCE(subscription_status,'inactive')) AS subscription_status,
              LOWER(COALESCE(plan,'free'))                    AS plan,
              LOWER(COALESCE(verification_status,'unverified')) AS verification_status
            FROM tradesmen
            WHERE user_id = ?
            LIMIT 1
            `,
            [uid]
          );
          const row = rows[0] || null;
          return row
            ? {
                planId: row.plan,
                subscriptionStatus: row.subscription_status,
                verificationStatus: row.verification_status,
              }
            : {
                planId: "free",
                subscriptionStatus: "inactive",
                verificationStatus: "unverified",
              };
        } catch (err) {
          log.warn({ err }, "getPlanAndVerification failed");
          // Fail safe to most restrictive interpretation
          return {
            planId: "free",
            subscriptionStatus: "inactive",
            verificationStatus: "unverified",
          };
        }
      }

      const { planId, subscriptionStatus, verificationStatus } =
        await getPlanAndVerification(viewerUid);

      const paymentsEnabled = process.env.ENABLE_PAYMENTS === "true";

      // --------------------------------------
      // 6. One-off unlock status (per project)
      // Skip when payments are disabled — no unlock records needed.
      // --------------------------------------
      async function getUnlockStatus(projectId, uid) {
        try {
          const rows = await mysqlQuery(
            `
            SELECT status
            FROM project_contact_unlocks
            WHERE project_id = ?
              AND buyer_uid  = ?
            LIMIT 1
            `,
            [projectId, uid]
          );
          const row = rows[0] || null;
          return row ? String(row.status || "").toLowerCase() : null;
        } catch (err) {
          log.warn({ err }, "getUnlockStatus failed");
          return null;
        }
      }

      const unlockStatus = paymentsEnabled
        ? await getUnlockStatus(projectId, viewerUid)
        : null;

      // --------------------------------------
      // 7. Entitlement + state evaluation
      // --------------------------------------
      let unlocked = false;
      let errorCode = null;
      let state = null;

      let hasGlobalContact = false;
      let oneOffUnlock = false;

      let canRequestVerification = false;
      let canRequestUnlock = false;

      // ---- 7a. Enforce verification gate FIRST ----
      // NOTE: This ensures nobody can "pay around" the verification rules.
      if (verificationStatus !== "approved") {
        if (verificationStatus === "pending") {
          state = "verification_pending";
          errorCode = "verification_pending";
          canRequestVerification = false;
        } else if (verificationStatus === "rejected") {
          state = "verification_rejected";
          errorCode = "verification_rejected";
          canRequestVerification = true; // e.g. allow re-submit docs
        } else {
          // unverified / unknown
          state = "verification_required";
          errorCode = "verification_required";
          canRequestVerification = true;
        }

        log.info(
          { verificationStatus, state, errorCode },
          "Contact blocked at verification gate"
        );

        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: errorCode,
          owner: null,
          state,
          entitlement: {
            planId,
            subscriptionStatus,
            verificationStatus,
            hasGlobalContact: false,
            oneOffUnlock: false,
            oneOffStatus: errorCode,
            oneOffStatusRaw: unlockStatus,
            canRequestVerification,
            canRequestUnlock: false,
          },
        });
      }

      // ---- 7b. Verification APPROVED: now check entitlements ----

      if (!paymentsEnabled) {
        // Payments disabled: check if tradesman is recommended on this project.
        // Recommended tradespeople get free access. Others see gated content.
        let isRecommended = false;
        try {
          const recRows = await mysqlQuery(
            `SELECT id FROM recommendations
             WHERE projectId = ? AND linked_tradesman_uid = ? AND source != 'pipeline'
             LIMIT 1`,
            [projectId, viewerUid],
          );
          isRecommended = recRows.length > 0;
        } catch {}

        if (isRecommended) {
          unlocked = true;
          hasGlobalContact = true;
          state = "unlocked_recommended";
          errorCode = null;
        } else {
          // Check for a paid one-off unlock even when payments are "disabled"
          const unlockStatus = await getUnlockStatus(projectId, viewerUid);
          if (unlockStatus === "active" || unlockStatus === "approved") {
            unlocked = true;
            oneOffUnlock = true;
            state = "unlocked_one_off";
            errorCode = null;
          } else {
            state = "not_unlocked";
            errorCode = "not_unlocked";
            canRequestUnlock = true;
          }
        }
      } else {
        // 🔑 GOLD (active) + verification → global unlock
        if (planId === "gold" && subscriptionStatus === "active") {
          unlocked = true;
          hasGlobalContact = true;
          state = "unlocked_global";
          errorCode = null;
        }

        // If not globally unlocked, fall back to one-off entitlement
        if (!hasGlobalContact) {
          if (unlockStatus === "approved" || unlockStatus === "active") {
            unlocked = true;
            oneOffUnlock = true;
            state = "unlocked_one_off";
            errorCode = null;
          } else if (unlockStatus === "pending_payment") {
            state = "payment_required";
            errorCode = "payment_required";
            canRequestUnlock = false; // already in payment flow
          } else if (unlockStatus === "pending_admin") {
            state = "pending_admin_review";
            errorCode = "pending_admin_review";
            canRequestUnlock = false;
          } else if (unlockStatus === "rejected") {
            state = "unlock_rejected";
            errorCode = "unlock_rejected";
            canRequestUnlock = true; // let them request again
          } else {
            // No row or unknown status: allowed to start unlock flow
            state = "no_entitlement";
            errorCode = "not_unlocked";
            canRequestUnlock = true;
          }
        }
      }

      // --------------------------------------
      // 8. NOT UNLOCKED → return silent 200 (no console error)
      // --------------------------------------
      if (!unlocked) {
        log.info(
          {
            unlockStatus,
            errorCode,
            state,
            planId,
            subscriptionStatus,
            verificationStatus,
          },
          "Owner contact not unlocked"
        );

        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: errorCode,
          owner: null,
          state,
          entitlement: {
            planId,
            subscriptionStatus,
            verificationStatus,
            hasGlobalContact,
            oneOffUnlock,
            oneOffStatus: errorCode,
            oneOffStatusRaw: unlockStatus,
            canRequestVerification: false, // already approved
            canRequestUnlock,
          },
        });
      }

      // --------------------------------------
      // 9. UNLOCKED → Fetch owner contact
      // --------------------------------------
      let owner;
      try {
        const rows = await mysqlQuery(
          `
          SELECT firstName, lastName, email
          FROM users
          WHERE uid = ?
          `,
          [project.ownerUserId]
        );
        owner = rows[0] || null;
      } catch (err) {
        log.error({ err }, "Failed fetching owner");
        return res.status(500).json({ error: "internal_error" });
      }

      if (!owner) {
        log.warn("Owner record missing");
        return res.status(404).json({ error: "owner_not_found" });
      }

      log.info(
        {
          planId,
          subscriptionStatus,
          verificationStatus,
          hasGlobalContact,
          oneOffUnlock,
          state,
        },
        "Owner contact successfully returned"
      );

      return res.json({
        ok: true,
        unlocked: true,
        ...owner,
        owner,
        state,
        entitlement: {
          planId,
          subscriptionStatus,
          verificationStatus,
          hasGlobalContact,
          oneOffUnlock,
          oneOffStatus: hasGlobalContact
            ? "global"
            : oneOffUnlock
            ? "approved"
            : null,
          oneOffStatusRaw: unlockStatus,
          canRequestVerification: false,
          canRequestUnlock: false,
        },
      });
    } catch (err) {
      log.error({ err }, "Unexpected server error");
      return res.status(500).json({ error: "server_error" });
    }
  });
};
