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
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false);
    setLoginMenuOpen(false);
  }, [router.pathname]);

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
  const atVerify = router.pathname === "/admin/verify-company";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-500/60 bg-slate-700/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: brand logo */}
        <Link href="/admin/tradesmen-leaderboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div className="leading-tight">
            <span className="text-sm font-black text-white">Vet<span className="text-red-400">My</span>Builder</span>
            <span className="ml-1.5 text-xs font-semibold text-slate-400">Admin</span>
          </div>
        </Link>

        {/* Right: actions */}
        <div className="flex items-center gap-2 text-sm">
          {!user || !isAdmin ? (
            // Logged out OR non-admin → dropdown to pick which section to log into
            <div className="relative">
              <button
                type="button"
                onClick={() => setLoginMenuOpen((v) => !v)}
                className="inline-flex items-center rounded-full bg-slate-900 px-4 h-9 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
                data-testid="btn-admin-login"
              >
                Admin login
                <span
                  aria-hidden
                  className={`ml-2 inline-block transition-transform ${
                    loginMenuOpen ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>

              {loginMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden"
                  data-testid="admin-login-menu"
                >
                  <Link
                    href="/login?next=/admin/tradesmen-leaderboard"
                    className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => setLoginMenuOpen(false)}
                    data-testid="login-menu-tradesmen"
                  >
                    Tradesmen leaderboard
                  </Link>
                  <Link
                    href="/login?next=/admin/recommendation-leaderboard"
                    className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => setLoginMenuOpen(false)}
                    data-testid="login-menu-recs"
                  >
                    Recommendation leaderboard
                  </Link>
                </div>
              )}
            </div>
          ) : (
            // Logged in as admin → dropdown menu
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex items-center rounded-full bg-slate-900 px-4 h-9 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
                data-testid="btn-admin-menu"
              >
                Admin menu
                <span
                  aria-hidden
                  className={`ml-2 inline-block transition-transform ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden"
                  data-testid="admin-menu"
                >
                  <Link
                    href="/admin/tradesmen-leaderboard"
                    className={`block px-3 py-2 text-sm ${
                      atTradesmen
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => setMenuOpen(false)}
                    data-testid="menu-admin-tradesmen"
                  >
                    Tradesmen leaderboard
                  </Link>

                  <Link
                    href="/admin/recommendation-leaderboard"
                    className={`block px-3 py-2 text-sm ${
                      atRecs
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => setMenuOpen(false)}
                    data-testid="menu-admin-recs"
                  >
                    Recommendation leaderboard
                  </Link>

                  <Link
                    href="/admin/verify-company"
                    className={`block px-3 py-2 text-sm ${
                      atVerify
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                    onClick={() => setMenuOpen(false)}
                    data-testid="menu-admin-verify-company"
                  >
                    Verify company
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                    data-testid="menu-admin-logout"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
