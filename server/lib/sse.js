// server/lib/sse.js
const { logger } = require("./logger");
const log = logger.child({ module: "sse" });

const clientsByUser = new Map(); // Map<uid, Set<res>>

function sseSend(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Push a notification event to all SSE clients for a given user.
 * Safe to call even when no clients are connected — just a no-op.
 */
function broadcastNotification(uid, payload, logActivity) {
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
    try {
      sseSend(res, "notification", data);
    } catch (err) {
      log.error({ uid, error: err?.message }, "SSE broadcast write failed");
      if (logActivity) {
        logActivity("sse.broadcast.fail", "error", uid, `Broadcast failed: ${err?.message}`);
      }
    }
  }
}

/** Returns the number of unique users with active SSE connections. */
function activeSseCount() {
  let count = 0;
  for (const set of clientsByUser.values()) {
    if (set.size > 0) count++;
  }
  return count;
}

module.exports = { clientsByUser, sseSend, broadcastNotification, activeSseCount };
