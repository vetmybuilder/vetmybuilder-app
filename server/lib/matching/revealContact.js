// server/lib/matching/revealContact.js
//
// Reveals the "other party's" contact info to a viewer, but only if the
// pair is in `matched` state for the given project.
//
// Column mapping (real schema):
//   tradesmen.company_name (snake), phone, email
//   users.firstName (camel), email — users currently have no phone column;
//     homeowner contact reveal returns phone=null and the frontend shows
//     an email-only card.

async function getMatchContact(mysqlQuery, { projectId, viewerUid, otherUid }) {
  const rows = await mysqlQuery(
    `SELECT status, homeowner_uid, builder_uid
       FROM swipe_interest
      WHERE project_id = ?
        AND ((homeowner_uid = ? AND builder_uid = ?)
          OR (homeowner_uid = ? AND builder_uid = ?))
      LIMIT 1`,
    [projectId, viewerUid, otherUid, otherUid, viewerUid],
  );
  const row = rows?.[0];
  if (!row || row.status !== "matched") return null;

  const viewerIsHomeowner = row.homeowner_uid === viewerUid;
  if (viewerIsHomeowner) {
    const t = await mysqlQuery(
      `SELECT phone, email, company_name
         FROM tradesmen
        WHERE user_id = ?
        LIMIT 1`,
      [otherUid],
    );
    const p = t?.[0];
    if (!p) return null;
    return {
      phone: p.phone || null,
      email: p.email || null,
      displayName: p.company_name || "Builder",
    };
  }

  const h = await mysqlQuery(
    `SELECT email, firstName
       FROM users
      WHERE uid = ?
      LIMIT 1`,
    [otherUid],
  );
  const p = h?.[0];
  if (!p) return null;
  return {
    phone: null, // users table has no phone column
    email: p.email || null,
    displayName: p.firstName || "Homeowner",
  };
}

module.exports = { getMatchContact };
