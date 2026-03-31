"use strict";

const { getApiBase } = require("./config");

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

async function apiCall(method, path, body, uid) {
  const apiBase = getApiBase();
  const headers = { "Content-Type": "application/json" };

  if (uid) {
    const token = await mintToken(uid);
    headers["Authorization"] = `Bearer ${token}`;
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

module.exports = { mintToken, clearTokenCache, apiGet, apiPost, apiPut };
