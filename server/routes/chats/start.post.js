// // POST /chats/start
// // Body: { projectId: number, withUid: string }
// // Auth: required
// module.exports = (router, ctx) => {
//   const { db, auth, touchUserMw } = ctx;
//   ensureChatTables(db);

//   router.post("/chats/start", auth, touchUserMw, (req, res) => {
//     try {
//       const uid = req.user.uid;
//       const { projectId, withUid } = req.body || {};
//       if (!projectId || !withUid)
//         return res
//           .status(400)
//           .json({ error: "projectId and withUid are required" });
//       if (withUid === uid)
//         return res
//           .status(400)
//           .json({ error: "Cannot start a chat with yourself" });

//       const proj = db
//         .prepare(
//           "SELECT id, ownerUserId AS owner_uid FROM projects WHERE id=? LIMIT 1"
//         )
//         .get(projectId);
//       if (!proj) return res.status(404).json({ error: "Project not found" });

//       const ownerUid = String(proj.owner_uid);
//       let tradesmanUid;

//       if (uid === ownerUid) {
//         tradesmanUid = String(withUid); // owner → tradesman
//       } else {
//         if (withUid !== ownerUid)
//           return res
//             .status(400)
//             .json({
//               error: "withUid must be the project owner for this project",
//             });
//         tradesmanUid = uid; // tradesman → owner
//       }

//       const existing = db
//         .prepare(
//           "SELECT id, project_id, owner_uid, tradesman_uid, created_at, last_message_at FROM chats WHERE project_id=? AND owner_uid=? AND tradesman_uid=? LIMIT 1"
//         )
//         .get(projectId, ownerUid, tradesmanUid);

//       if (existing)
//         return res.json({ chatId: existing.id, chat: mapChatRow(existing) });

//       const id = newChatId();
//       const now = new Date().toISOString();
//       db.prepare(
//         "INSERT INTO chats (id, project_id, owner_uid, tradesman_uid, created_by_uid, last_message_at, created_at) VALUES (?,?,?,?,?,?,?)"
//       ).run(id, projectId, ownerUid, tradesmanUid, uid, now, now);

//       const row = db
//         .prepare(
//           "SELECT id, project_id, owner_uid, tradesman_uid, created_at, last_message_at FROM chats WHERE id=? LIMIT 1"
//         )
//         .get(id);
//       res.json({ chatId: id, chat: mapChatRow(row) });
//     } catch (e) {
//       console.error("[chats/start] error", e);
//       res.status(500).json({ error: "Failed to start chat" });
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
//     UNIQUE (project_id, owner_uid, tradesman_uid)
//   )`
//   ).run();

//   db.prepare(
//     `CREATE TABLE IF NOT EXISTS chat_messages (
//     id TEXT PRIMARY KEY,
//     chat_id TEXT NOT NULL,
//     sender_uid TEXT NOT NULL,
//     body TEXT NOT NULL,
//     created_at TEXT NOT NULL,
//     read_at TEXT
//   )`
//   ).run();

//   db.prepare(
//     "CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at ON chat_messages (chat_id, created_at)"
//   ).run();
// }

// const newChatId = () =>
//   "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
// const mapChatRow = (r) => ({
//   id: String(r.id),
//   projectId: Number(r.project_id),
//   ownerUid: String(r.owner_uid),
//   tradesmanUid: String(r.tradesman_uid),
//   createdAt: String(r.created_at),
//   lastMessageAt: String(r.last_message_at),
// });
