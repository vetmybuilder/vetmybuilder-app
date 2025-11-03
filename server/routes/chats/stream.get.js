// // GET /chats/stream?chatId=... (&token=ID_TOKEN optional)
// // Accepts Bearer header OR ?token=… (mirrors notifications stream)
// module.exports = (router, ctx) => {
//   const { db, admin } = ctx;
//   ensureChatTables(db);

//   router.get("/chats/stream", async (req, res) => {
//     // Resolve uid
//     let token = "";
//     const auth = req.headers.authorization || "";
//     if (auth.startsWith("Bearer ")) token = auth.slice(7);
//     if (!token && typeof req.query.token === "string")
//       token = String(req.query.token);

//     let uid = null;
//     try {
//       if (token) uid = (await admin.auth().verifyIdToken(token)).uid;
//     } catch {}
//     if (!uid) return res.status(401).json({ error: "Missing/invalid token" });

//     const chatId = String(req.query.chatId || "");
//     if (!chatId) return res.status(400).json({ error: "chatId required" });

//     const chat = db
//       .prepare(
//         "SELECT id, owner_uid, tradesman_uid FROM chats WHERE id=? LIMIT 1"
//       )
//       .get(chatId);
//     if (!chat) return res.status(404).json({ error: "Chat not found" });
//     if (chat.owner_uid !== uid && chat.tradesman_uid !== uid)
//       return res.status(403).json({ error: "Forbidden" });

//     // SSE
//     res.writeHead(200, {
//       "Content-Type": "text/event-stream",
//       "Cache-Control": "no-cache",
//       Connection: "keep-alive",
//     });
//     res.write("\n");

//     let closed = false;
//     req.on("close", () => {
//       closed = true;
//       clearInterval(t);
//     });

//     let lastIso = new Date(Date.now() - 1000).toISOString();
//     const t = setInterval(() => {
//       if (closed) return;
//       try {
//         const rows = db
//           .prepare(
//             "SELECT id, chat_id, sender_uid, body, created_at, read_at FROM chat_messages WHERE chat_id=? AND created_at > ? ORDER BY created_at ASC"
//           )
//           .all(chatId, lastIso);

//         for (const r of rows) {
//           const msg = {
//             id: String(r.id),
//             chatId: String(r.chat_id),
//             senderUid: String(r.sender_uid),
//             body: String(r.body),
//             createdAt: String(r.created_at),
//             readAt: r.read_at ? String(r.read_at) : null,
//           };
//           res.write(
//             `data: ${JSON.stringify({ type: "message", message: msg })}\n\n`
//           );
//           lastIso = msg.createdAt;
//         }
//         res.write(`: hb ${Date.now()}\n\n`);
//       } catch (e) {
//         console.error("[chats/stream] error", e);
//         res.write(
//           `event: error\ndata: ${JSON.stringify({
//             error: "stream_failed",
//           })}\n\n`
//         );
//       }
//     }, 1500);
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
