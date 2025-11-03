// // POST /chats/:id/messages
// module.exports = (router, ctx) => {
//   const { db, auth, touchUserMw, sseSend = null } = ctx;
//   ensureChatTables(db);

//   router.post("/chats/:id/messages", auth, touchUserMw, (req, res) => {
//     try {
//       const uid = req.user.uid;
//       const chatId = String(req.params.id || "");
//       if (!chatId) return res.status(400).json({ error: "Missing chat id" });

//       const chat = db
//         .prepare(
//           "SELECT id, project_id, owner_uid, tradesman_uid FROM chats WHERE id=? LIMIT 1"
//         )
//         .get(chatId);
//       if (!chat) return res.status(404).json({ error: "Chat not found" });
//       if (chat.owner_uid !== uid && chat.tradesman_uid !== uid)
//         return res.status(403).json({ error: "Forbidden" });

//       const body = (req.body && String(req.body.body || "").trim()) || "";
//       if (!body)
//         return res.status(400).json({ error: "Message body is required" });
//       if (body.length > 1000)
//         return res
//           .status(400)
//           .json({ error: "Message too long (max 1000 chars)" });

//       const id =
//         "m_" +
//         Math.random().toString(36).slice(2, 10) +
//         Date.now().toString(36);
//       const now = new Date().toISOString();

//       db.prepare(
//         "INSERT INTO chat_messages (id, chat_id, sender_uid, body, created_at) VALUES (?, ?, ?, ?, ?)"
//       ).run(id, chatId, uid, body, now);
//       db.prepare("UPDATE chats SET last_message_at=? WHERE id=?").run(
//         now,
//         chatId
//       );

//       const toUid =
//         uid === chat.owner_uid ? chat.tradesman_uid : chat.owner_uid;

//       // ✅ write to your notifications schema
//       tryInsertNotification(db, {
//         userUid: toUid,
//         type: "chat_message",
//         bodyText: body,
//         projectId: chat.project_id,
//         linkPath: `/projects/${chat.project_id}`,
//         createdAt: now,
//       });

//       // Optional: live “nudge” if someone’s listening via SSE
//       try {
//         if (typeof sseSend === "function") {
//           sseSend(toUid, {
//             type: "notification",
//             kind: "chat_message",
//             payload: {
//               chatId,
//               projectId: chat.project_id,
//               fromUid: uid,
//               body,
//               createdAt: now,
//             },
//           });
//         }
//       } catch {}

//       res.json({
//         ok: true,
//         message: {
//           id,
//           chatId,
//           senderUid: uid,
//           body,
//           createdAt: now,
//           readAt: null,
//         },
//       });
//     } catch (e) {
//       console.error("[chats/messages.post] error", e);
//       res.status(500).json({ error: "Failed to send message" });
//     }
//   });
// };

// function ensureChatTables(db) {
//   db.prepare(
//     `CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, project_id INTEGER NOT NULL, owner_uid TEXT NOT NULL, tradesman_uid TEXT NOT NULL, created_by_uid TEXT NOT NULL, last_message_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(project_id, owner_uid, tradesman_uid))`
//   ).run();
//   db.prepare(
//     `CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, sender_uid TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT)`
//   ).run();
// }

// function tblExists(db, name) {
//   const row = db
//     .prepare(
//       "SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1"
//     )
//     .get(name);
//   return !!row;
// }

// // 🔁 YOUR notifications schema: (id AI), userId TEXT, type TEXT, message TEXT, projectId INTEGER, linkPath TEXT, createdAt TEXT, readAt TEXT
// function tryInsertNotification(
//   db,
//   { userUid, type, bodyText, projectId, linkPath, createdAt }
// ) {
//   if (!tblExists(db, "notifications")) return;
//   try {
//     db.prepare(
//       "INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
//     ).run(
//       String(userUid),
//       String(type),
//       String(bodyText || ""),
//       projectId != null ? Number(projectId) : null,
//       linkPath || null,
//       String(createdAt)
//     );
//   } catch (e) {
//     console.warn("[notif insert failed]", e);
//   }
// }
