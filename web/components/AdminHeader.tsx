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
  // (dropdown state is declared alongside the pill definitions below)

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

  const pills: { label: string; href: string; testId: string; active: boolean; dropdown?: { label: string; href: string; testId: string; active: boolean }[] }[] = [
    {
      label: "Tradesmen",
      href: "/admin/tradesmen-leaderboard",
      testId: "nav-admin-tradesmen",
      active: router.pathname === "/admin/tradesmen-leaderboard" || router.pathname === "/admin/tradesmen",
      dropdown: [
        { label: "Tradesmen leaderboard", href: "/admin/tradesmen-leaderboard", testId: "nav-admin-tradesmen-lb", active: router.pathname === "/admin/tradesmen-leaderboard" || router.pathname === "/admin/tradesmen" },
        { label: "Verify company", href: "/admin/verify-company", testId: "nav-admin-verify", active: router.pathname === "/admin/verify-company" },
      ],
    },
    {
      label: "Moderation",
      href: "/admin/recommendation-leaderboard",
      testId: "nav-admin-moderation",
      active: router.pathname === "/admin/recommendation-leaderboard",
      dropdown: [
        { label: "Recommendation leaderboard", href: "/admin/recommendation-leaderboard", testId: "nav-admin-recs", active: router.pathname === "/admin/recommendation-leaderboard" },
      ],
    },
    { label: "Projects", href: "/admin/projects", testId: "nav-admin-projects", active: router.pathname === "/admin/projects" },
    { label: "Pipeline", href: "/admin/trades-pipeline", testId: "nav-admin-pipeline", active: router.pathname === "/admin/trades-pipeline" },
    { label: "Dashboard", href: "/admin/dashboard", testId: "nav-admin-dashboard", active: router.pathname === "/admin/dashboard" },
    { label: "Users", href: "/admin/users", testId: "nav-admin-users", active: router.pathname === "/admin/users" },
  ];

  const activePill = "bg-violet-600 text-white font-bold shadow-sm";
  const inactivePill = "bg-slate-900 text-white font-medium hover:bg-slate-800";
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Close dropdown on route change
  useEffect(() => {
    setOpenDropdown(null);
  }, [router.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-500/60 bg-slate-700/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: brand logo */}
        <Link href="/admin/tradesmen-leaderboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <div className="leading-tight">
            <span className="text-xl font-black text-white">Vet<span className="text-red-400" style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, fontSize: "130%", WebkitTextStroke: "0.5px currentColor" }}>My</span>Builder</span>
            <span className="ml-2 text-xs font-bold text-amber-400 tracking-wide">Admin</span>
          </div>
        </Link>

        {/* Right: pill navigation */}
        <nav className="flex items-center gap-1.5 text-sm">
          {!user || !isAdmin ? (
            <Link
              href="/login?next=/admin/tradesmen-leaderboard"
              className={`inline-flex items-center rounded-full px-4 h-9 text-sm ${inactivePill}`}
              data-testid="btn-admin-login"
            >
              Admin login
            </Link>
          ) : (
            <>
              {pills.map((pill) =>
                pill.dropdown ? (
                  <div key={pill.testId} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown(openDropdown === pill.testId ? null : pill.testId)}
                      className={`inline-flex items-center rounded-full px-4 h-9 text-sm ${
                        pill.active || pill.dropdown.some((d) => d.active) ? activePill : inactivePill
                      }`}
                      data-testid={pill.testId}
                    >
                      {pill.label}
                      <span aria-hidden className={`ml-1.5 text-[10px] transition-transform ${openDropdown === pill.testId ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    {openDropdown === pill.testId && (
                      <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 overflow-hidden z-50">
                        {pill.dropdown.map((item) => (
                          <Link
                            key={item.testId}
                            href={item.href}
                            className={`block px-3 py-2 text-sm ${item.active ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                            onClick={() => setOpenDropdown(null)}
                            data-testid={item.testId}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={pill.testId}
                    href={pill.href}
                    className={`inline-flex items-center rounded-full px-4 h-9 text-sm ${pill.active ? activePill : inactivePill}`}
                    data-testid={pill.testId}
                  >
                    {pill.label}
                  </Link>
                ),
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center rounded-full px-4 h-9 text-sm text-rose-400 hover:text-rose-300 hover:bg-slate-800/50"
                data-testid="btn-admin-logout"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
