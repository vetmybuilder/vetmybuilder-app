// server/lib/payments/handlers/activateUnlock.js
//
// Handler for Stripe checkout.session.completed events whose metadata
// marks them as a one-off unlock-contact purchase. Idempotent in the
// existing belt-and-braces sense: re-running with the same session id
// updates the existing rows rather than duplicating. Full dedupe by
// event.id arrives in spec #2.

const { REFUND_POLICY_VERSION } = require("../refundPolicyVersion");

async function activateUnlock({ event, ctx }) {
  const { mysqlQuery, log = console } = ctx;
  if (!mysqlQuery) return;

  const session = event?.data?.object || {};
  const metadata = session.metadata || {};
  const type = metadata.type || metadata.vmb_type;

  if (type !== "unlock_contact") return;

  const uid = metadata.buyerUid || metadata.userId;
  const projectId = Number(metadata.projectId || metadata.vmb_project_id);
  if (!uid || !projectId) return;

  const amount = session.amount_total || 0;
  const currency = (session.currency || "gbp").toUpperCase();

  await mysqlQuery(
    `INSERT INTO project_contact_unlocks
      (project_id, buyer_uid, session_id, amount, currency, status,
       waiver_accepted_at, waiver_policy_version,
       created_at, approved_at)
     VALUES (?, ?, ?, ?, ?, 'active', NOW(), ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       status = 'active',
       approved_at = NOW(),
       waiver_accepted_at = COALESCE(waiver_accepted_at, NOW()),
       waiver_policy_version = COALESCE(waiver_policy_version, VALUES(waiver_policy_version))`,
    [projectId, uid, session.id, amount, currency, REFUND_POLICY_VERSION],
  );

  await mysqlQuery(
    `INSERT INTO payments_oneoff
      (user_id, type, entity_id, amount, currency, status, provider_session_id, provider_payment_intent, created_at)
     SELECT ?, 'unlock_contact', ?, ?, ?, 'active', ?, ?, NOW()
     FROM DUAL WHERE NOT EXISTS (
       SELECT 1 FROM payments_oneoff WHERE user_id = ? AND type = 'unlock_contact' AND entity_id = ?
     )`,
    [uid, projectId, amount, currency, session.id, session.payment_intent, uid, projectId],
  );

  log.info?.({ uid, projectId, sessionId: session.id }, "[activateUnlock] unlock activated");
  ctx.logActivity?.("payment.stripe.unlock", "info", uid, `Stripe unlock for project #${projectId}`);

  // Create swipe_interest match (source='paid_unlock') so the builder lands
  // directly in /chat/:matchId. If metadata carries an introMessage, post it
  // as the first chat_messages row. Mirror of the old route's logic exactly.
  try {
    const introMessage = String(metadata.introMessage || "").trim();
    const projectRows = await mysqlQuery(
      `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
      [projectId],
    );
    const ownerUid = projectRows?.[0]?.ownerUserId;
    if (ownerUid) {
      const result = await mysqlQuery(
        `INSERT INTO swipe_interest
           (project_id, homeowner_uid, builder_uid, source, status,
            builder_swiped_at, created_at)
         VALUES (?, ?, ?, 'paid_unlock', 'matched', NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           status = 'matched',
           source = 'paid_unlock',
           builder_swiped_at = COALESCE(builder_swiped_at, NOW())`,
        [projectId, ownerUid, uid],
      );

      // insertId is 0 when ON DUPLICATE KEY UPDATE fires — fall back to a
      // SELECT to get the existing row id (mirrors the old route exactly).
      let matchId = result?.insertId || 0;
      if (!matchId) {
        const m = await mysqlQuery(
          `SELECT id FROM swipe_interest
            WHERE project_id = ? AND builder_uid = ?
            LIMIT 1`,
          [projectId, uid],
        );
        matchId = m?.[0]?.id || 0;
      }

      if (matchId && introMessage) {
        await mysqlQuery(
          `INSERT INTO chat_messages (match_id, sender_uid, body, created_at)
           VALUES (?, ?, ?, NOW())`,
          [matchId, uid, introMessage],
        );
      }

      if (matchId) {
        try {
          const linkPath = `/chat/${matchId}`;
          const notifMessage = `New message - paid unlock`;
          await mysqlQuery(
            `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, 'chat_message_new', ?, ?, ?, NOW())`,
            [ownerUid, notifMessage, projectId, linkPath],
          );
          ctx.broadcastNotification?.(ownerUid, {
            type: "chat_message_new",
            message: notifMessage,
            projectId,
            linkPath,
          });
        } catch (notifErr) {
          log.warn?.({ err: notifErr?.message }, "[activateUnlock] notification insert failed");
        }
      }
    }
  } catch (err) {
    log.warn?.({ err: err?.message }, "[activateUnlock] match insert failed");
  }
}

module.exports = { activateUnlock };
