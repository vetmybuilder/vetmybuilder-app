// server/v2/lib/phone.js
function cleanPhone(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const compact = s.replace(/[^\d+]/g, "");
  return compact || null;
}
module.exports = { cleanPhone };
