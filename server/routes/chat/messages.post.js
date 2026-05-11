// server/routes/chat/messages.post.js
//
// POST /api/chat/:matchId/messages
// Sends a chat message in a matched swipe-interest thread.
//
// Accepts EITHER:
//   - application/json { body }                                 (text only)
//   - multipart/form-data { body, photos[] (max 6, 10MB each) } (text + images)
//
// Auth: either party (homeowner or builder) of the match.
// 403 if caller is not a party, or status !== 'matched'.
// 400 if both body and photos are empty.
//
// Photos go through the same processFile / R2 pipeline as close-photos
// (HEIC -> JPEG, EXIF/GPS strip), and their URLs are stored as a JSON
// array on chat_messages.attachments_json.
//
// Fires chat_message_new notification + chat_message SSE event to the
// OTHER party. Returns the inserted message including parsed attachments.

const { sendPushToUser } = require("../../lib/pushSender");
const {
  resolveGhostNotificationTarget,
  isMasterOfGhost,
} = require("../../lib/ghostTradesman");

module.exports = function mountChatMessagesPost(router, ctx) {
  const { auth, upload, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { uploadToR2, isR2Configured } = require("../../lib/r2");
  const { processBuffer, processFile } = require("../../lib/imageSanitiser");
  const multer = require("multer");
  const r2Upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  });

  const log = ctx.log || console;
  const TAG = "[chat/messages.post]";

  // Optional multipart middleware - swallows non-multipart requests so the
  // JSON path still works.
  const uploadMaybe = (req, res, next) => {
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (!ct.startsWith("multipart/form-data")) {
      req.files = [];
      return next();
    }
    const handler = isR2Configured
      ? r2Upload.array("photos", 6)
      : upload.array("photos", 6);
    handler(req, res, (err) => {
      if (err) {
        if (
          err.code === "LIMIT_FILE_COUNT" ||
          err.message === "Too many files"
        ) {
          return next(); // truncated by us anyway
        }
        return res.status(400).json({
          error: "upload_failed",
          message: err.message || "Upload failed",
        });
      }
      next();
    });
  };

  router.post("/chat/:matchId/messages", auth, uploadMaybe, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const matchId = Number(req.params.matchId);
    if (!Number.isFinite(matchId) || matchId <= 0) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    const body = String(req.body?.body ?? "").trim();
    const files = Array.isArray(req.files) ? req.files.slice(0, 6) : [];
    if (!body && files.length === 0) {
      return res.status(400).json({ error: "body or photos required" });
    }
    if (body.length > 2000) {
      return res.status(400).json({ error: "body too long (max 2000 chars)" });
    }

    // Look up the swipe_interest row with party details
    const rows = await mysqlQuery(
      `SELECT si.id AS matchId,
              si.homeowner_uid, si.builder_uid, si.status,
              si.project_id,
              hu.firstName AS homeownerFirstName,
              t.company_name AS builderCompanyName,
              bu.firstName AS builderFirstName
         FROM swipe_interest si
         LEFT JOIN users hu ON hu.uid = si.homeowner_uid
         LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
         LEFT JOIN users bu ON bu.uid = si.builder_uid
        WHERE si.id = ?
        LIMIT 1`,
      [matchId],
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Match not found" });
    }

    const si = rows[0];

    // Access control. Standard parties: homeowner + builder. Plus the
    // master operator of a ghost tradesman is allowed to reply on the
    // ghost's behalf (staging sim).
    const senderIsHomeowner = uid === si.homeowner_uid;
    const senderIsBuilder = uid === si.builder_uid;
    const senderIsMasterOfBuilder =
      !senderIsHomeowner && !senderIsBuilder
        ? await isMasterOfGhost(mysqlQuery, si.builder_uid, uid)
        : false;

    if (!senderIsHomeowner && !senderIsBuilder && !senderIsMasterOfBuilder) {
      return res.status(403).json({ error: "Not a party to this match" });
    }
    if (si.status !== "matched") {
      return res.status(403).json({ error: "Match is not active" });
    }

    // Persisted sender is always the ghost (builder_uid) when the master
    // is replying, so the homeowner only ever sees one persona per thread.
    const persistedSenderUid = senderIsMasterOfBuilder ? si.builder_uid : uid;

    const homeownerName = si.homeownerFirstName || "Homeowner";
    const builderName = si.builderCompanyName || si.builderFirstName || "Builder";
    const senderName = senderIsHomeowner ? homeownerName : builderName;

    // Process up to 6 attached photos. Same pipeline as close-photos:
    // R2 upload (with HEIC transcode + EXIF strip) when configured;
    // local-disk fallback otherwise. Any per-file failure is logged
    // and skipped so a single bad image doesn't block the message.
    const attachmentUrls = [];
    for (const f of files) {
      try {
        if (isR2Configured) {
          const p = await processBuffer({
            buffer: f.buffer,
            mimetype: f.mimetype,
            originalname: f.originalname,
          });
          const { publicUrl } = await uploadToR2({
            buffer: p.buffer,
            mimetype: p.mimetype,
            originalname: p.originalname,
            folder: "chat",
          });
          if (publicUrl) attachmentUrls.push(publicUrl);
        } else {
          let filename = f.filename || f.originalname || "";
          if (f.path) {
            try {
              const p = await processFile({
                filePath: f.path,
                mimetype: f.mimetype,
                originalname: f.originalname,
                filename: f.filename,
              });
              filename = p.filename || filename;
            } catch {
              /* keep original filename */
            }
          }
          if (filename) {
            attachmentUrls.push(`/uploads/${filename}`);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`${TAG} attachment skipped:`, err?.message);
      }
    }

    const attachmentsJson = attachmentUrls.length > 0
      ? JSON.stringify(attachmentUrls)
      : null;

    // Insert the message
    const result = await mysqlQuery(
      `INSERT INTO chat_messages (match_id, sender_uid, body, attachments_json, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [matchId, persistedSenderUid, body, attachmentsJson],
    );

    const insertId = result?.insertId;

    // Fetch the inserted row to get the canonical createdAt
    const inserted = await mysqlQuery(
      `SELECT id, sender_uid AS senderUid, body, attachments_json AS attachmentsJson, created_at AS createdAt
         FROM chat_messages WHERE id = ? LIMIT 1`,
      [insertId],
    );
    const row = inserted?.[0];
    const createdAt = row?.createdAt ?? new Date().toISOString();

    // Fire notification to the OTHER party. If the recipient is a ghost
    // tradesman, alerts route to the master operator instead. The chat
    // delivery SSE goes to the same notify target so the master's open
    // inbox receives the message in real time.
    try {
      const recipientUid = senderIsHomeowner ? si.builder_uid : si.homeowner_uid;
      const notifyUid = await resolveGhostNotificationTarget(
        mysqlQuery,
        recipientUid,
      );
      const linkPath = `/chat/${matchId}`;
      const photoTail = attachmentUrls.length > 0
        ? ` (with ${attachmentUrls.length} photo${attachmentUrls.length === 1 ? "" : "s"})`
        : "";
      const notifMessage = `New message from ${senderName}${photoTail}`;

      await mysqlQuery(
        `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
         VALUES (?, 'chat_message_new', ?, ?, ?, NOW())`,
        [notifyUid, notifMessage, si.project_id, linkPath],
      );
      ctx.broadcastNotification?.(notifyUid, {
        type: "chat_message_new",
        message: notifMessage,
        projectId: si.project_id,
        linkPath,
      });
      // Real-time chat delivery via SSE (separate event so the chat UI can
      // append the message without a full notification-bell re-render)
      ctx.broadcastEvent?.(notifyUid, "chat_message", {
        matchId,
        message: {
          id: row?.id ?? insertId,
          senderUid: persistedSenderUid,
          senderRole: senderIsHomeowner ? "homeowner" : "tradesman",
          senderName,
          body,
          attachments: attachmentUrls,
          createdAt,
        },
      });
      sendPushToUser({
        uid: notifyUid,
        type: "chat_message_new",
        title: "VetMyBuilder",
        body: notifMessage,
        linkPath,
        mysqlQuery,
        logActivity: ctx.logActivity,
      });
    } catch (err) {
      log.warn?.(`${TAG} chat_message_new notification failed`, { error: err?.message });
    }

    return res.status(201).json({
      id: row?.id ?? insertId,
      senderUid: persistedSenderUid,
      senderRole: senderIsHomeowner ? "homeowner" : "tradesman",
      senderName,
      body,
      attachments: attachmentUrls,
      createdAt,
    });
  });
};
