// web/utils/useRole.ts
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { useApi } from "./api";

export type Role = "guest" | "user" | "tradesman";

/**
 * Returns the current user's role.
 * - "guest"     — not logged in
 * - "user"      — logged in as homeowner
 * - "tradesman" — logged in as tradesman
 *
 * Uses the vmb:isTradesman sessionStorage flag (set by SiteHeader) as a fast
 * path to avoid a redundant API call when the header has already fetched the
 * role. Falls back to calling /api/tradesmen/me directly.
 */
export function useRole(): { role: Role; loading: boolean } {
  const { user, loading: authLoading } = useAuth();
  const api = useApi();
  const [role, setRole] = useState<Role>("guest");
  const [loading, setLoading] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setRole("guest");
      setLoading(false);
      fetched.current = false;
      return;
    }

    if (fetched.current) return;
    fetched.current = true;

    // One-shot signal from the tradesman register flow. Survives the
    // window.location.replace AND any post-reload races where SiteHeader's
    // stale in-flight GET writes "0" back to vmb:isTradesman. Read and
    // clear it here so the next render round uses the normal fast path.
    try {
      if (sessionStorage.getItem("vmb:justRegisteredTradesman") === "1") {
        sessionStorage.removeItem("vmb:justRegisteredTradesman");
        sessionStorage.setItem("vmb:isTradesman", "1");
        setRole("tradesman");
        setLoading(false);
        return;
      }
    } catch {
      /* sessionStorage unavailable */
    }

    try {
      const cached = sessionStorage.getItem("vmb:isTradesman");
      if (cached === "1") {
        setRole("tradesman");
        setLoading(false);
        return;
      }
    } catch {
      // sessionStorage unavailable (SSR / private mode)
    }

    // Fallback: fetch role from API
    api
      .get("/api/tradesmen/me")
      .then(({ data }) => {
        const r = String(data?.role || "user").toLowerCase();
        const isT = r === "tradesman" || !!data?.profile;
        setRole(isT ? "tradesman" : "user");
      })
      .catch(() => {
        setRole("user");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [authLoading, user, api]);

  return { role, loading };
}
