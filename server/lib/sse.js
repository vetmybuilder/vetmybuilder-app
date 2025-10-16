// server/v2/lib/sse.js
const clientsByUser = new Map(); // Map<uid, Set<res>>
function sseSend(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
module.exports = { clientsByUser, sseSend };
