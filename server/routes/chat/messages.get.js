// server/routes/chat/messages.get.js
//
// GET /api/chat/:matchId/messages
// Returns the chat thread for a matched swipe-interest pair.
//
// Auth: either party (homeowner or builder) of the match.
// 403 if caller is not a party, or status !== 'matched'.
//
// Response shape:
//   {
//     matchId, projectId, projectName, source,
//     otherParty: { role, uid, name, firstName },
//     me: { role, uid },
//     messages: [{ id, senderUid, senderRole, senderName, body, attachments, createdAt }]
//   }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isMasterOfGhost } = require("../../lib/ghostTradesman");

module.exports = function mountChatMessagesGet(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  function parseAttachments(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  router.get("/chat/:matchId/messages", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const matchId = Number(req.params.matchId);
    if (!Number.isFinite(matchId) || matchId <= 0) {
      return res.status(400).json({ error: "Invalid match id" });
    }

    // Look up the swipe_interest row with all needed joins. Trade
    // avatar prefers tradesmen.profile_picture_url, falling back to the
    // first uploaded gallery photo so the chat header isn't always
    // initials when the trade has cover work imagery but no headshot.
    const rows = await mysqlQuery(
      `SELECT si.id AS matchId,
              si.homeowner_uid, si.builder_uid, si.status, si.source,
              si.project_id,
              p.name AS projectName,
              hu.firstName AS homeownerFirstName,
              t.company_name AS builderCompanyName,
              bu.firstName AS builderFirstName,
              COALESCE(
                t.profile_picture_url,
                (SELECT tp.url FROM tradesmen_photos tp
                  WHERE tp.tradesman_user_id = t.user_id
                  ORDER BY COALESCE(tp.sort_order, 999999), tp.created_at ASC
                  LIMIT 1)
              ) AS builderAvatarUrl
         FROM swipe_interest si
         JOIN projects p ON p.id = si.project_id
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

    // Access control. Caller must be a party OR the master operator
    // behind a ghost trade row (master_uid = caller). The master gets
    // the same read access as the underlying ghost so notifications
    // delivered to them ("New message from Chris") open the thread
    // instead of bouncing to "Conversation unavailable".
    const viewerIsHomeowner = uid === si.homeowner_uid;
    const viewerIsBuilder = uid === si.builder_uid;
    const viewerIsMasterOfBuilder =
      !viewerIsHomeowner && !viewerIsBuilder
        ? await isMasterOfGhost(mysqlQuery, si.builder_uid, uid)
        : false;

    if (!viewerIsHomeowner && !viewerIsBuilder && !viewerIsMasterOfBuilder) {
      return res.status(403).json({ error: "Not a party to this match" });
    }
    if (si.status !== "matched") {
      return res.status(403).json({ error: "Match is not active" });
    }

    // Fetch messages
    const msgs = await mysqlQuery(
      `SELECT id, sender_uid AS senderUid, body,
              attachments_json AS attachmentsJson,
              created_at AS createdAt
         FROM chat_messages
        WHERE match_id = ?
        ORDER BY created_at ASC`,
      [matchId],
    );

    // Enrich each message with senderRole + senderName
    const homeownerName = si.homeownerFirstName || "Homeowner";
    const builderName = si.builderCompanyName || si.builderFirstName || "Builder";

    const messages = (msgs || []).map((m) => {
      const senderIsHomeowner = m.senderUid === si.homeowner_uid;
      return {
        id: m.id,
        senderUid: m.senderUid,
        senderRole: senderIsHomeowner ? "homeowner" : "tradesman",
        senderName: senderIsHomeowner ? homeownerName : builderName,
        body: m.body,
        attachments: parseAttachments(m.attachmentsJson),
        createdAt: m.createdAt,
      };
    });

    // Resolve other party. avatarUrl is populated for the trade only
    // (homeowners have no avatar field on users) - chat header falls
    // back to initials when null.
    let otherParty;
    if (viewerIsHomeowner) {
      otherParty = {
        role: "tradesman",
        uid: si.builder_uid,
        name: builderName,
        firstName: si.builderFirstName || null,
        avatarUrl: si.builderAvatarUrl || null,
      };
    } else {
      otherParty = {
        role: "homeowner",
        uid: si.homeowner_uid,
        name: homeownerName,
        firstName: si.homeownerFirstName || null,
        avatarUrl: null,
      };
    }

    return res.json({
      matchId: si.matchId,
      projectId: si.project_id,
      projectName: si.projectName,
      source: si.source,
      otherParty,
      me: {
        role: viewerIsHomeowner ? "homeowner" : "tradesman",
        uid,
      },
      messages,
    });
  });
};
