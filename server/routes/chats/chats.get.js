// // GET /chats
// // Lists all chats for the current user (owner or tradesman)
// module.exports = (router, ctx) => {
//   const { db, auth, touchUserMw } = ctx;
//   ensureChatTables(db);

//   router.get("/chats", auth, touchUserMw, (req, res) => {
//     try {
//       const uid = req.user.uid;
//       const rows = db
//         .prepare(
//           `SELECT id, project_id, owner_uid, tradesman_uid, created_at, last_message_at
//          FROM chats
//          WHERE owner_uid = ? OR tradesman_uid = ?
//          ORDER BY last_message_at DESC`
//         )
//         .all(uid, uid);

//       res.json({ items: rows.map(mapChatRow) });
//     } catch (e) {
//       console.error("[chats/list] error", e);
//       res.status(500).json({ error: "Failed to list chats" });
//     }
//   });
// };

// function ensureChatTables(db) {
//   db.prepare(
//     `CREATE TABLE IF NOT EXISTS chats (
//     id TEXT PRIMARY KEY,
//     project_id INTEGER NOT NULL,
//     owner_uid TEXT NOT NULL,
//     tradesman_uid TEXT NOT NULL,
//     created_by_uid TEXT NOT NULL,
//     last_message_at TEXT NOT NULL,
//     created_at TEXT NOT NULL,
//     UNIQUE(project_id, owner_uid, tradesman_uid)
//   )`
//   ).run();
// }
// function mapChatRow(r) {
//   return {
//     id: String(r.id),
//     projectId: Number(r.project_id),
//     ownerUid: String(r.owner_uid),
//     tradesmanUid: String(r.tradesman_uid),
//     createdAt: String(r.created_at),
//     lastMessageAt: String(r.last_message_at),
//   };
// }
