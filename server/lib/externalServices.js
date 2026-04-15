// server/lib/externalServices.js
//
// Single source of truth for "is this paid external service allowed to
// fire from this process?". Used by every outbound integration:
//
//   - Anthropic LLM (server/lib/ai/llmClient.js)
//   - Google Places  (server/lib/googlePlaces.js)
//   - Companies House (server/lib/companiesHouse.js)
//   - Web presence DNS / fetch (server/lib/webPresence.js)
//
// Why a central kill-switch:
// We discovered after a surprise £180+ Google bill that the e2e CI
// containers had been loading the production .env (with live API keys),
// so every test run was hitting Google Places / Companies House /
// Anthropic for real. The fix has two layers:
//
//   1. Compose / CI sets MOCK_EXTERNAL_SERVICES=1 on every server
//      container. Anything that calls an external service consults
//      `isExternalServicesMocked()` first and short-circuits.
//   2. Belt-and-braces: the same compose files null out the API keys, so
//      even a bug that bypassed the kill-switch would still fail-fast at
//      the credential check rather than fire a billable request.
//
// Default: OFF in production. ON whenever the caller sets the env var.
// Tests (NODE_ENV=test) are also treated as mocked so vitest never hits
// real APIs even if a developer forgot to set the flag.

function isExternalServicesMocked() {
  if (process.env.MOCK_EXTERNAL_SERVICES === "1") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

module.exports = { isExternalServicesMocked };
