// server/routes/tradesman/matches.get.js
//
// GET /api/tradesman/matches
// Returns the formed matched pairs for the authenticated builder - rows
// in swipe_interest where both sides have right-swiped (status='matched').
// This is the builder-side analogue of the homeowner's /api/matches list:
// each row carries enough info for /tradesman/matches to render a card
// per match with a chat / view-match deep link, plus the lastMessage +
// unreadCount fields the trade-side InboxDropdown / MessagingDock need.
//
// Privacy: the homeowner's first name is intentionally NOT returned -
// the row identity is the project, not the person. Location is reduced
// to outward only via extractOutward.
//
// Note: there is also /api/tradesman/incoming-interest, which surfaces
// status='pending' rows where the homeowner has swiped but the builder
// hasn't responded yet - that drives the /tradesman/leads swipe deck.
// Keep the two endpoints separate so each list has predictable semantics
// (matched pairs vs. queue of decisions to make).

const { mysqlQuery: _mq } = require("../../lib/mysql");
const { extractOutward } = require("../../lib/matching/extractOutward");

module.exports = function mountTradesmanMatches(router, ctx) {
  const mysqlQuery = ctx?.mysqlQuery ?? _mq;
  const auth = ctx?.auth;

  router.get("/tradesman/matches", auth, async (req, res) => {
    const builderUid = req.user?.uid;
    if (!builderUid) return res.status(401).json({ error: "Unauthorized" });

    // The caller sees their own matches plus any matches belonging to
    // ghost tradespeople they "operate" as a master (master_uid = caller).
    // For real users this expands to just their own row; for the staging
    // sim master it aggregates across every ghost they own. The joined
    // tradesmen row carries company_name + profile picture so the master
    // inbox can render the persona for each thread.
    const rows = await mysqlQuery(
      `SELECT si.id              AS matchId,
              si.project_id      AS projectId,
              si.builder_uid     AS builderUid,
              si.source          AS source,
              si.updated_at      AS matchedAt,
              p.name             AS projectName,
              p.type             AS projectType,
              p.location         AS projectLocation,
              u.firstName        AS homeownerFirstName,
              t.company_name     AS builderCompanyName,
              t.profile_picture_url AS builderProfilePicture,
              t.master_uid       AS builderMasterUid
         FROM swipe_interest si
         JOIN projects p ON p.id = si.project_id
         JOIN users u ON u.uid = si.homeowner_uid
         LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
        WHERE (si.builder_uid = ?
               OR si.builder_uid IN (
                 SELECT user_id FROM tradesmen WHERE master_uid = ?
               ))
          AND si.status = 'matched'
          -- Mirror the homeowner filter: once a project is completed the
          -- thread drops off the tradesperson's inbox too. Keeps both sides
          -- of the conversation symmetric; if the trade visits the chat
          -- URL directly we redirect them to /tradesman/matches.
          AND p.status <> 'completed'
        ORDER BY si.updated_at DESC, si.id DESC`,
      [builderUid, builderUid],
    );

    // Pull last-message + unread counts for every match in this list. Two
    // batched queries keep this O(1) round-trips. If chat_messages is
    // missing or the queries throw (older test mocks, schema not yet
    // migrated), gracefully degrade to lastMessage:null + unreadCount:0
    // so the page still renders, just without preview text.
    const matchIds = (rows || [])
      .map((r) => Number(r.matchId))
      .filter((n) => Number.isFinite(n));
    const lastMessageByMatch = new Map();
    const unreadByMatch = new Map();
    if (matchIds.length > 0) {
      const ph = matchIds.map(() => "?").join(",");
      try {
        const msgRows = await mysqlQuery(
          `SELECT match_id AS matchId,
                  body,
                  attachments_json AS attachmentsJson,
                  sender_uid AS senderUid,
                  created_at AS createdAt
             FROM chat_messages
            WHERE match_id IN (${ph})
            ORDER BY match_id, created_at DESC, id DESC`,
          matchIds,
        );
        for (const m of msgRows || []) {
          const id = Number(m.matchId);
          if (lastMessageByMatch.has(id)) continue;
          let attachmentCount = 0;
          if (m.attachmentsJson) {
            try {
              const parsed = JSON.parse(m.attachmentsJson);
              if (Array.isArray(parsed)) attachmentCount = parsed.length;
            } catch {
              attachmentCount = 0;
            }
          }
          lastMessageByMatch.set(id, {
            body: m.body == null ? null : String(m.body),
            attachmentCount,
            senderUid: m.senderUid ? String(m.senderUid) : null,
            createdAt:
              m.createdAt instanceof Date
                ? m.createdAt.toISOString()
                : m.createdAt
                  ? String(m.createdAt)
                  : null,
          });
        }
      } catch {
        // chat_messages absent / mock didn't supply - leave map empty.
      }

      try {
        const unreadRows = await mysqlQuery(
          `SELECT cm.match_id AS matchId, COUNT(*) AS c
             FROM chat_messages cm
             LEFT JOIN (
               SELECT match_id, MAX(created_at) AS myLast
                 FROM chat_messages
                WHERE sender_uid = ?
                  AND match_id IN (${ph})
                GROUP BY match_id
             ) mine ON mine.match_id = cm.match_id
            WHERE cm.match_id IN (${ph})
              AND cm.sender_uid <> ?
              AND (mine.myLast IS NULL OR cm.created_at > mine.myLast)
            GROUP BY cm.match_id`,
          [builderUid, ...matchIds, ...matchIds, builderUid],
        );
        for (const r of unreadRows || []) {
          unreadByMatch.set(Number(r.matchId), Number(r.c) || 0);
        }
      } catch {
        // chat_messages absent - leave map empty.
      }
    }

    const matches = (rows || []).map((r) => {
      const isGhost = !!r.builderMasterUid && r.builderMasterUid === builderUid;
      return {
        matchId: String(r.matchId),
        projectId: r.projectId,
        projectName: r.projectName || "",
        projectType: r.projectType || "",
        projectLocation: extractOutward(r.projectLocation) || "",
        // Surfaced once the row is 'matched' (both parties consented).
        // Used by the trade-side dock to show the homeowner's initial /
        // first name on each thread, matching what the chat window
        // header already shows.
        homeownerFirstName: r.homeownerFirstName || null,
        source: r.source === "recommended" ? "recommended" : "subscribed",
        matchedAt: r.matchedAt,
        lastMessage: lastMessageByMatch.get(Number(r.matchId)) || null,
        unreadCount: unreadByMatch.get(Number(r.matchId)) || 0,
        // Persona attribution for the master inbox. For real-trade callers
        // these mirror their own profile; for a master operating ghosts
        // they identify which persona this match belongs to.
        builderCompanyName: r.builderCompanyName || null,
        builderProfilePicture: r.builderProfilePicture || null,
        actingAsGhost: isGhost,
      };
    });

    return res.json({ matches });
  });
};
