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

    // Look up the swipe_interest row with all needed joins
    const rows = await mysqlQuery(
      `SELECT si.id AS matchId,
              si.homeowner_uid, si.builder_uid, si.status, si.source,
              si.project_id,
              p.name AS projectName,
              hu.firstName AS homeownerFirstName,
              t.company_name AS builderCompanyName,
              bu.firstName AS builderFirstName
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

    // Access control
    if (uid !== si.homeowner_uid && uid !== si.builder_uid) {
      return res.status(403).json({ error: "Not a party to this match" });
    }
    if (si.status !== "matched") {
      return res.status(403).json({ error: "Match is not active" });
    }

    const viewerIsHomeowner = uid === si.homeowner_uid;

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

    // Resolve other party
    let otherParty;
    if (viewerIsHomeowner) {
      otherParty = {
        role: "tradesman",
        uid: si.builder_uid,
        name: builderName,
        firstName: si.builderFirstName || null,
      };
    } else {
      otherParty = {
        role: "homeowner",
        uid: si.homeowner_uid,
        name: homeownerName,
        firstName: si.homeownerFirstName || null,
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
