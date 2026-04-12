// server/lib/sse.js
const clientsByUser = new Map(); // Map<uid, Set<res>>

function sseSend(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Push a notification event to all SSE clients for a given user.
 * Safe to call even when no clients are connected — just a no-op.
 */
function broadcastNotification(uid, payload) {
  const set = clientsByUser.get(uid);
  if (!set || !set.size) return;
  const data = {
    type: payload.type || "info",
    message: String(payload.message || ""),
    projectId: typeof payload.projectId === "number" ? payload.projectId : null,
    linkPath: payload.linkPath || null,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
  for (const res of set) {
    try { sseSend(res, "notification", data); } catch {}
  }
}

module.exports = { clientsByUser, sseSend, broadcastNotification };
