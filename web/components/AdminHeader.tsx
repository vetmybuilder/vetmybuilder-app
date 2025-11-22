// web/components/AdminHeader.tsx
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";

export default function AdminHeader() {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  // Determine if current user is admin (mirror AdminGate logic)
  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      setChecking(true);

      // No user → definitely not admin
      if (!user) {
        if (!alive) return;
        setIsAdmin(false);
        setChecking(false);
        try {
          sessionStorage.setItem("vmb:isAdmin", "0");
        } catch {}
        return;
      }

      // Try cache first
      try {
        const cached = sessionStorage.getItem("vmb:isAdmin");
        if (cached === "1") {
          if (!alive) return;
          setIsAdmin(true);
          setChecking(false);
          return;
        }
      } catch {
        /* ignore */
      }

      // Probe admin route
      try {
        await api.get("/api/admin/tradesmen", {
          params: { page: 1, pageSize: 1, status: "all" },
        });
        if (!alive) return;
        setIsAdmin(true);
        try {
          sessionStorage.setItem("vmb:isAdmin", "1");
        } catch {}
      } catch {
        if (!alive) return;
        setIsAdmin(false);
        try {
          sessionStorage.setItem("vmb:isAdmin", "0");
        } catch {}
      } finally {
        if (alive) setChecking(false);
      }
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, [user, api]);

  async function handleLogout() {
    try {
      await signOutUser();
    } catch {
      // ignore
    }
    try {
      sessionStorage.setItem("vmb:isAdmin", "0");
    } catch {}
    router.replace("/");
  }

  const atTradesmen =
    router.pathname === "/admin/tradesmen-leaderboard" ||
    router.pathname === "/admin/tradesmen";
  const atRecs = router.pathname === "/admin/recommendation-leaderboard";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: simple label */}
        <div className="text-sm font-semibold tracking-wide text-slate-800">
          VetMyBuilder Admin
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 text-sm">
          {!user || !isAdmin ? (
            // Logged out OR non-admin → single login button
            <Link
              href="/login?next=/admin/tradesmen-leaderboard"
              className="inline-flex items-center rounded-full bg-slate-900 px-4 h-9 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              data-testid="btn-admin-login"
            >
              Admin login
            </Link>
          ) : (
            // Logged in as admin
            <>
              <Link
                href="/admin/tradesmen-leaderboard"
                className={[
                  "inline-flex items-center rounded-full px-3 h-9 font-medium shadow-sm border",
                  atTradesmen
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50",
                ].join(" ")}
                data-testid="btn-admin-tradesmen"
              >
                Tradesmen leaderboard
              </Link>

              <Link
                href="/admin/recommendation-leaderboard"
                className={[
                  "inline-flex items-center rounded-full px-3 h-9 font-medium shadow-sm border",
                  atRecs
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50",
                ].join(" ")}
                data-testid="btn-admin-recs"
              >
                Recommendation-leaderboard
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center rounded-full px-3 h-9 font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50"
                data-testid="btn-admin-logout"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
