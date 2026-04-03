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

    // Fast path: SiteHeader may have already resolved the role
    try {
      const cached = sessionStorage.getItem("vmb:isTradesman");
      if (cached !== null) {
        setRole(cached === "1" ? "tradesman" : "user");
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
