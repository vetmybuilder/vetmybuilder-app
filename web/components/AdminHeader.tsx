// web/components/AdminHeader.tsx
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";
import BrandWordmark from "@/components/BrandWordmark";

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

  // Grouped admin nav. Top-level pills are categories; the underlying
  // pages live in dropdowns. Adding a new admin page now means appending
  // to the right group's `dropdown` rather than introducing another pill.
  const isOn = (path: string) => router.pathname === path;
  const isOnAny = (paths: string[]) => paths.some(isOn);

  const pills: { label: string; href: string; testId: string; active: boolean; dropdown?: { label: string; href: string; testId: string; active: boolean }[] }[] = [
    {
      label: "Dashboard",
      href: "/admin/dashboard",
      testId: "nav-admin-dashboard",
      active: isOn("/admin/dashboard"),
    },
    {
      label: "Users",
      href: "/admin/users",
      testId: "nav-admin-users-group",
      active: isOnAny([
        "/admin/users",
        "/admin/tradesmen-leaderboard",
        "/admin/tradesmen",
      ]),
      dropdown: [
        { label: "All users", href: "/admin/users", testId: "nav-admin-users", active: isOn("/admin/users") },
        { label: "Tradespeople leaderboard", href: "/admin/tradesmen-leaderboard", testId: "nav-admin-tradesmen-lb", active: isOnAny(["/admin/tradesmen-leaderboard", "/admin/tradesmen"]) },
      ],
    },
    {
      label: "Projects",
      href: "/admin/projects",
      testId: "nav-admin-projects-pill",
      active: isOn("/admin/projects"),
    },
    {
      label: "Sales",
      href: "/admin/trades-pipeline",
      testId: "nav-admin-sales",
      active: isOnAny([
        "/admin/trades-pipeline",
        "/admin/verify-company",
        "/admin/sales-script",
      ]),
      dropdown: [
        { label: "Trade pipeline", href: "/admin/trades-pipeline", testId: "nav-admin-pipeline", active: isOn("/admin/trades-pipeline") },
        { label: "Verify company", href: "/admin/verify-company", testId: "nav-admin-verify", active: isOn("/admin/verify-company") },
        { label: "Sales script", href: "/admin/sales-script", testId: "nav-admin-sales-script", active: isOn("/admin/sales-script") },
      ],
    },
    {
      label: "Quality",
      href: "/admin/recommendation-leaderboard",
      testId: "nav-admin-quality",
      active: isOnAny(["/admin/recommendation-leaderboard", "/admin/feedback", "/admin/reports", "/admin/grant-leads"]),
      dropdown: [
        { label: "Recommendation leaderboard", href: "/admin/recommendation-leaderboard", testId: "nav-admin-recs", active: isOn("/admin/recommendation-leaderboard") },
        { label: "Feedback", href: "/admin/feedback", testId: "nav-admin-feedback", active: isOn("/admin/feedback") },
        { label: "Reports", href: "/admin/reports", testId: "nav-admin-reports", active: isOn("/admin/reports") },
        { label: "Grant leads", href: "/admin/grant-leads", testId: "nav-admin-grant-leads", active: isOn("/admin/grant-leads") },
      ],
    },
    {
      label: "Settings",
      href: "/admin/pilot-areas",
      testId: "nav-admin-settings",
      active: isOnAny(["/admin/pilot-areas", "/admin/pilot-project-types", "/admin/feature-flags", "/admin/pricing", "/admin/refunds", "/admin/cleanup"]),
      dropdown: [
        { label: "Feature flags", href: "/admin/feature-flags", testId: "nav-admin-feature-flags", active: isOn("/admin/feature-flags") },
        { label: "Pilot areas", href: "/admin/pilot-areas", testId: "nav-admin-pilot-areas", active: isOn("/admin/pilot-areas") },
        { label: "Pilot project types", href: "/admin/pilot-project-types", testId: "nav-admin-pilot-project-types", active: isOn("/admin/pilot-project-types") },
        { label: "Pricing", href: "/admin/pricing", testId: "nav-admin-pricing", active: isOn("/admin/pricing") },
        { label: "Refunds", href: "/admin/refunds", testId: "nav-admin-refunds", active: isOn("/admin/refunds") },
        { label: "Cleanup", href: "/admin/cleanup", testId: "nav-admin-cleanup", active: isOn("/admin/cleanup") },
      ],
    },
  ];

  const activePill = "bg-violet-600 text-white font-bold shadow-sm";
  const inactivePill = "bg-slate-900 text-white font-medium hover:bg-slate-800";
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Close dropdown on route change
  useEffect(() => {
    setOpenDropdown(null);
  }, [router.pathname]);

  // Logo destination depends on access:
  // - admin: /admin/dashboard (the actual admin home)
  // - everyone else: / (homepage) — gives a real escape hatch when a
  //   non-admin lands on an admin URL with the chrome rendered.
  const logoHref = isAdmin ? "/admin/dashboard" : "/";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-500/60 bg-slate-700/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: brand logo */}
        <Link href={logoHref} className="flex items-center gap-2">
          <BrandWordmark
            tone="auto"
            className="text-xl font-black tracking-tight text-white"
          />
          <span className="text-xs font-bold text-amber-400 tracking-wide">Admin</span>
        </Link>

        {/* Right: pill navigation */}
        <nav className="flex items-center gap-1.5 text-sm">
          {!user ? (
            <Link
              href="/login?next=/admin/tradesmen-leaderboard"
              className={`inline-flex items-center rounded-full px-4 h-9 text-sm ${inactivePill}`}
              data-testid="btn-admin-login"
            >
              Admin login
            </Link>
          ) : !isAdmin ? (
            // Authed but NOT admin: a "Admin login" link to /login?next=/admin/...
            // would loop back here via login.tsx's deep-route auto-redirect.
            // Give them a real way out instead.
            <Link
              href="/"
              className={`inline-flex items-center rounded-full px-4 h-9 text-sm ${inactivePill}`}
              data-testid="btn-back-home"
            >
              Back to home
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
