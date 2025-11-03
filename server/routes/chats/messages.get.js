// // GET /chats/:id/messages?limit=50&before=ISO
// // Auth: required; only participants may read
// module.exports = (router, ctx) => {
//   const { db, auth, touchUserMw } = ctx;
//   ensureChatTables(db);

//   router.get("/chats/:id/messages", auth, touchUserMw, (req, res) => {
//     try {
//       const uid = req.user.uid;
//       const chatId = String(req.params.id || "");
//       if (!chatId) return res.status(400).json({ error: "Missing chat id" });

//       const chat = db
//         .prepare(
//           "SELECT id, owner_uid, tradesman_uid FROM chats WHERE id=? LIMIT 1"
//         )
//         .get(chatId);
//       if (!chat) return res.status(404).json({ error: "Chat not found" });
//       if (chat.owner_uid !== uid && chat.tradesman_uid !== uid)
//         return res.status(403).json({ error: "Forbidden" });

//       const limit = clampInt(req.query.limit, 50, 1, 200);
//       const before = req.query.before ? String(req.query.before) : null;

//       const rows = before
//         ? db
//             .prepare(
//               `SELECT id, chat_id, sender_uid, body, created_at, read_at
//                       FROM chat_messages WHERE chat_id=? AND created_at < ?
//                       ORDER BY created_at ASC LIMIT ?`
//             )
//             .all(chatId, before, limit)
//         : db
//             .prepare(
//               `SELECT id, chat_id, sender_uid, body, created_at, read_at
//                       FROM chat_messages WHERE chat_id=? ORDER BY created_at ASC LIMIT ?`
//             )
//             .all(chatId, limit);

//       res.json({ items: rows.map(mapMsgRow) });
//     } catch (e) {
//       console.error("[chats/messages.get] error", e);
//       res.status(500).json({ error: "Failed to load messages" });
//     }
//   });
// };

// function clampInt(v, def, min, max) {
//   const n = Number(v);
//   if (!Number.isFinite(n)) return def;
//   return Math.max(min, Math.min(max, Math.floor(n)));
// }
// function mapMsgRow(r) {
//   return {
//     id: String(r.id),
//     chatId: String(r.chat_id),
//     senderUid: String(r.sender_uid),
//     body: String(r.body),
//     createdAt: String(r.created_at),
//     readAt: r.read_at ? String(r.read_at) : null,
//   };
// }
// function ensureChatTables(db) {
//   db.prepare(
//     `CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, project_id INTEGER NOT NULL, owner_uid TEXT NOT NULL, tradesman_uid TEXT NOT NULL, created_by_uid TEXT NOT NULL, last_message_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (project_id, owner_uid, tradesman_uid))`
//   ).run();
//   db.prepare(
//     `CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, sender_uid TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT)`
//   ).run();
// }
