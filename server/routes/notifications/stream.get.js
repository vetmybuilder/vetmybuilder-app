// server/routes/notifications/notifications.stream.get.js
/**
 * GET /api/notifications/stream
 * Auth: required (Bearer or ?token=…); opens SSE stream
 * Sends: "bootstrap" { unread, latest[] }, then keepalive pings.
 */
module.exports = (router, ctx) => {
  const { admin, clientsByUser, sseSend, mysqlQuery } = ctx;

  function parseLimit(v, def = 50, min = 1, max = 500) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  router.get("/notifications/stream", async (req, res) => {
    let token = "";
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) token = authHeader.slice(7);
    if (!token && typeof req.query.token === "string") {
      token = String(req.query.token);
    }

    let uid = null;
    try {
      if (token) {
        const decoded = await admin.auth().verifyIdToken(token);
        uid = decoded.uid;
      }
    } catch (_) {
      // ignore, will fall through to 401
    }
    if (!uid) return res.status(401).json({ error: "Missing/invalid token" });

    const limit = parseLimit(req.query.limit, 50);

    // Fetch bootstrap data from MySQL BEFORE opening SSE stream,
    // so we can still return a clean 500 if something goes wrong.
    let unread = 0;
    let latest = [];
    try {
      const unreadRows = await mysqlQuery(
        `SELECT COUNT(*) AS c
           FROM notifications
          WHERE userId = ?
            AND readAt IS NULL`,
        [uid]
      );
      unread = unreadRows[0]?.c || 0;

      // Inline LIMIT so MySQL doesn't complain about binding it
      latest = await mysqlQuery(
        `SELECT id, type, message, projectId, linkPath, createdAt, readAt
           FROM notifications
          WHERE userId = ?
          ORDER BY createdAt DESC
          LIMIT ${limit}`,
        [uid]
      );
    } catch (err) {
      console.error("Error fetching notifications bootstrap from MySQL:", err);
      return res.status(500).json({ error: "internal_error" });
    }

    // From here on, we switch to SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");

    let set = clientsByUser.get(uid);
    if (!set) {
      set = new Set();
      clientsByUser.set(uid, set);
    }
    set.add(res);

    // Send initial snapshot
    sseSend(res, "bootstrap", { unread, latest });

    const ping = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 25000);

    req.on("close", () => {
      clearInterval(ping);
      set.delete(res);
    });
  });
};

// // server/v2/routes/notifications/stream.get.js
// /**
//  * GET /api/v2/notifications/stream
//  * Auth: required (Bearer or ?token=…); opens SSE stream
//  * Sends: "bootstrap" { unread, latest[] }, then keepalive pings.
//  */
// module.exports = (router, ctx) => {
//   const { db, admin, clientsByUser, sseSend } = ctx;

//   function parseLimit(v, def = 50, min = 1, max = 500) {
//     const n = Number(v);
//     if (!Number.isFinite(n)) return def;
//     return Math.max(min, Math.min(max, Math.trunc(n)));
//   }

//   router.get("/notifications/stream", async (req, res) => {
//     let token = "";
//     const auth = req.headers.authorization || "";
//     if (auth.startsWith("Bearer ")) token = auth.slice(7);
//     if (!token && typeof req.query.token === "string") {
//       token = String(req.query.token);
//     }

//     let uid = null;
//     try {
//       if (token) {
//         const decoded = await admin.auth().verifyIdToken(token);
//         uid = decoded.uid;
//       }
//     } catch (_) {}
//     if (!uid) return res.status(401).json({ error: "Missing/invalid token" });

//     const limit = parseLimit(req.query.limit, 50);

//     res.writeHead(200, {
//       "Content-Type": "text/event-stream",
//       "Cache-Control": "no-cache",
//       Connection: "keep-alive",
//     });
//     res.write("\n");

//     let set = clientsByUser.get(uid);
//     if (!set) {
//       set = new Set();
//       clientsByUser.set(uid, set);
//     }
//     set.add(res);

//     const unread = db
//       .prepare(
//         `SELECT COUNT(*) AS c FROM notifications
//           WHERE userId = ? AND readAt IS NULL`
//       )
//       .get(uid).c;

//     const latest = db
//       .prepare(
//         `SELECT id, type, message, projectId, linkPath, createdAt, readAt
//            FROM notifications
//           WHERE userId = ?
//           ORDER BY createdAt DESC
//           LIMIT ?`
//       )
//       .all(uid, limit);

//     sseSend(res, "bootstrap", { unread, latest });

//     const ping = setInterval(() => res.write(": keepalive\n\n"), 25000);
//     req.on("close", () => {
//       clearInterval(ping);
//       set.delete(res);
//     });
//   });
// };
