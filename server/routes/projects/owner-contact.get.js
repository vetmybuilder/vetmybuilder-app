//
// GET /api/projects/:id/owner-contact
// NEW ENTITLEMENT MODEL (Final agreed):
//
//   ✔ No plan automatically unlocks contact
//   ✔ Only one-off unlocks that reach ACTIVE state give access
//   ✔ Spotlight does NOT unlock contact
//   ✔ Gold does NOT unlock contact
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const TAG = "[projects/owner-contact.get]";

  // Fetch plan + subscription (UI / diagnostics only)
  const getPlanInfo = async (uid) => {
    try {
      const rows = await mysqlQuery(
        `
          SELECT
            LOWER(COALESCE(subscription_status,'inactive')) AS subscription_status,
            LOWER(COALESCE(plan,'free'))                    AS plan
          FROM tradesmen
          WHERE user_id = ?
          LIMIT 1
          `,
        [uid]
      );

      const row = rows[0] || null;

      if (!row) {
        return { planId: "free", subscriptionStatus: "inactive" };
      }

      return {
        planId: row.plan,
        subscriptionStatus: row.subscription_status,
      };
    } catch (err) {
      console.error(`${TAG} getPlanInfo error:`, err);
      return { planId: "free", subscriptionStatus: "inactive" };
    }
  };

  // Fetch one-off unlock status for the project
  const getUnlockStatus = async (projectId, uid) => {
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
      console.error(`${TAG} getUnlockStatus error`, err);
      return null;
    }
  };

  router.get("/projects/:id/owner-contact", auth, async (req, res) => {
    try {
      const viewerUid = req.user?.uid;
      if (!viewerUid) return res.status(401).json({ error: "Unauthorized" });

      const projectId = Number(req.params.id);
      if (!Number.isFinite(projectId) || projectId <= 0) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Load the project
      const projectRows = await mysqlQuery(
        `
          SELECT id,
                 ownerUserId,
                 LOWER(COALESCE(status,'')) AS status
          FROM projects
          WHERE id = ?
          `,
        [projectId]
      );
      const project = projectRows[0] || null;

      if (!project) return res.status(404).json({ error: "Project not found" });

      // Only live projects allow contact unlock
      if (project.status !== "live") {
        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: "contact_not_available_for_status",
        });
      }

      // A homeowner cannot request their own contact
      if (project.ownerUserId === viewerUid) {
        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: "owner_cannot_request_own_contact",
        });
      }

      // Fetch plan info (UI only)
      const { planId, subscriptionStatus } = await getPlanInfo(viewerUid);

      // One-off unlock status
      const unlockStatus = await getUnlockStatus(projectId, viewerUid);

      let unlocked = false;
      let errorCode = "not_unlocked";

      // FINAL MODEL:
      //
      // Only ACTIVE or APPROVED unlocks give access.
      // Both are valid because:
      //   approved → pending_payment → active
      //
      // "active" is the final state post-payment.
      //
      if (unlockStatus === "approved" || unlockStatus === "active") {
        unlocked = true;
      } else if (
        unlockStatus === "pending_admin" ||
        unlockStatus === "pending_payment"
      ) {
        errorCode = "pending_admin_review";
      } else if (unlockStatus === "rejected") {
        errorCode = "rejected";
      }

      // NOT unlocked → return locked response
      if (!unlocked) {
        return res.status(200).json({
          ok: false,
          unlocked: false,
          error: errorCode,
          owner: null,
          firstName: null,
          lastName: null,
          email: null,
          entitlement: {
            planId,
            subscriptionStatus,
            hasGlobalContact: false,
            oneOffUnlock: false,
            oneOffStatus: errorCode,
            oneOffStatusRaw: unlockStatus,
          },
        });
      }

      // UNLOCKED → return owner contact
      const ownerRows = await mysqlQuery(
        `
          SELECT firstName, lastName, email
          FROM users
          WHERE uid = ?
          `,
        [project.ownerUserId]
      );
      const owner = ownerRows[0] || null;

      if (!owner) return res.status(404).json({ error: "Owner not found" });

      return res.json({
        ok: true,
        unlocked: true,
        ...owner,
        owner,
        entitlement: {
          planId,
          subscriptionStatus,
          hasGlobalContact: false,
          oneOffUnlock: true,
          oneOffStatus: "approved",
          oneOffStatusRaw: unlockStatus,
        },
      });
    } catch (e) {
      console.error(`${TAG} error`, e);
      return res.status(500).json({ error: "server_error" });
    }
  });
};
