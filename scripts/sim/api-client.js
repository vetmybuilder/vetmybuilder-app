"use strict";

const { getApiBase } = require("./config");

const SIM_PROD = process.env.SIM_PROD === "1";

// Cache minted tokens by UID to avoid re-minting on every call
const tokenCache = new Map();

async function mintToken(uid) {
  if (tokenCache.has(uid)) return tokenCache.get(uid);

  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("Missing E2E_TEST_SECRET in environment");

  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/__test__/auth/id-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Secret": secret,
    },
    body: JSON.stringify({ uid }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to mint token for ${uid}: ${res.status} ${body}`);
  }

  const data = await res.json();
  const token = data.idToken || data.token;
  if (!token) throw new Error(`No token returned for ${uid}`);

  tokenCache.set(uid, token);
  return token;
}

function clearTokenCache() {
  tokenCache.clear();
}

/**
 * Returns auth headers for the given UID.
 * In SIM_PROD=1 mode: X-Sim-Uid + X-Test-Secret (no Firebase token exchange needed).
 * In local dev mode: Firebase Bearer token via the emulator test route.
 */
async function getAuthHeaders(uid) {
  if (SIM_PROD) {
    const secret = process.env.E2E_TEST_SECRET;
    if (!secret) throw new Error("Missing E2E_TEST_SECRET in environment");
    return { "X-Sim-Uid": uid, "X-Test-Secret": secret };
  }
  const token = await mintToken(uid);
  return { Authorization: `Bearer ${token}` };
}

async function apiCall(method, path, body, uid) {
  const apiBase = getApiBase();
  const headers = { "Content-Type": "application/json" };

  if (uid) {
    Object.assign(headers, await getAuthHeaders(uid));
  }

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return res;
}

async function apiGet(path, uid) {
  return apiCall("GET", path, undefined, uid);
}

async function apiPost(path, body, uid) {
  return apiCall("POST", path, body, uid);
}

async function apiPut(path, body, uid) {
  return apiCall("PUT", path, body, uid);
}

module.exports = { mintToken, clearTokenCache, getAuthHeaders, apiGet, apiPost, apiPut };
