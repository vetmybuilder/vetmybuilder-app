// Robust axios client: fixes /api/api and injects Firebase Bearer tokens (TS-safe for Axios v1)

import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { getAuth } from "firebase/auth";
import { initFirebase } from "@/utils/firebase";

/** Decide base URL.
 * If NEXT_PUBLIC_API_BASE is set, use it (origin or origin+/api).
 * Otherwise default to '/api' (works with Next rewrites). */
const RAW_BASE = (process.env.NEXT_PUBLIC_API_BASE || "/api").trim();

const trimEnd = (s: string) => s.replace(/\/+$/, "");

function normalizeBase(raw: string): string {
  const noTrail = trimEnd(raw);
  if (noTrail === "/api") return "/api";
  if (/^https?:\/\//i.test(noTrail)) {
    // absolute: ensure it ends with /api exactly once
    return /\/api$/i.test(noTrail) ? noTrail : `${noTrail}/api`;
  }
  // relative custom base: ensure /api suffix
  return /\/api$/i.test(noTrail) ? noTrail : `${noTrail}/api`;
}

const baseURL = normalizeBase(RAW_BASE);

const api = axios.create({
  baseURL,
  withCredentials: false,
});

/** Interceptor 1:
 * Strip leading '/api' from request URL if baseURL already ends with '/api',
 * preventing '/api/api/...'.
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof config.url === "string") {
    const baseEndsWithApi = /\/api$/i.test(trimEnd(baseURL));
    const urlStartsWithApi = /^\/?api(\/|$)/i.test(config.url);
    if (baseEndsWithApi && urlStartsWithApi) {
      config.url = config.url.replace(/^\/?api(\/|$)/i, "/");
    }
  }
  return config;
});

/** Interceptor 2:
 * Inject Firebase ID token as Authorization: Bearer <token>.
 * Works with AxiosHeaders (v1) or plain object headers.
 */
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    initFirebase(); // no-op if already initialized
    const auth = getAuth();
    const user = auth.currentUser;

    if (user) {
      const token = await user.getIdToken(false);

      // Axios v1 may give us an AxiosHeaders instance with .set()
      const headersAny = (config.headers ??= {} as any);

      if (typeof headersAny.set === "function") {
        headersAny.set("Authorization", `Bearer ${token}`);
      } else {
        headersAny["Authorization"] = `Bearer ${token}`;
      }
    }
  } catch {
    // ignore—request can proceed unauthenticated if user not ready
  }
  return config;
});

/**
 * The API server origin (e.g. "http://localhost:3100").
 * Used by SSE to bypass the Next.js rewrite proxy which buffers streams.
 * In production this is same-origin, so returns "".
 */
export const API_ORIGIN: string = (() => {
  const raw = (process.env.NEXT_PUBLIC_API_BASE || "").trim();
  if (!raw || raw === "/api") return ""; // same-origin
  try { return new URL(raw).origin; } catch { return ""; }
})();

export function useApi() {
  return api;
}
