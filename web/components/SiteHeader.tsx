// web/components/SiteHeader.tsx
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState, useEffect } from "react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { Home, User, Wrench } from "lucide-react";
import MobileMenu from "@/components/MobileMenu";

const NotificationsBell = dynamic(
  () => import("@/components/NotificationsBell"),
  { ssr: false, loading: () => null },
);

function computeInitials(u: any | null | undefined): string | undefined {
  if (!u) return undefined;

  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) {
    const out = ((fn ? fn[0] : "") + (ln ? ln[0] : "")).toUpperCase();
    return out || undefined;
  }

  const dn = (u.displayName || "").trim();
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    return (
      parts[0]?.[0] + (parts[1]?.[0] || "") || dn.slice(0, 2)
    ).toUpperCase();
  }

  const un = (u.username || "").trim();
  if (un) {
    const parts = un.split(/[.\-_ ]+/).filter(Boolean);
    return (
      parts[0]?.[0] + (parts[1]?.[0] || "") || un.slice(0, 2)
    ).toUpperCase();
  }

  return undefined;
}

function InitialsBadge({
  initials,
  onClick,
  testId,
  ariaLabel = "Account menu",
}: {
  initials?: string;
  onClick?: () => void;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
      data-testid={testId}
    >
      <span
        aria-hidden
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold"
      >
        {initials || "U"}
      </span>
    </button>
  );
}

// Owner-only project tabs shown in the header when on /projects
const PROJECT_HEADER_TABS: Array<{
  key: "mine" | "favourites" | "completed" | "completedCommunity";
  label: string;
  testId: string;
  activeColor: string;
  hoverColor: string;
}> = [
  {
    key: "mine",
    label: "MY PROJECTS",
    testId: "tab-my-projects",
    activeColor: "#22c55e",
    hoverColor: "#bbf7d0",
  },
  {
    key: "completed",
    label: "COMPLETED",
    testId: "tab-my-completed-projects",
    activeColor: "#0ea5e9",
    hoverColor: "#bae6fd",
  },
  {
    key: "completedCommunity",
    label: "COMMUNITY",
    testId: "tab-completed-community-projects",
    activeColor: "#f97316",
    hoverColor: "#fed7aa",
  },
  {
    key: "favourites",
    label: "FAVOURITES",
    testId: "tab-favourites",
    activeColor: "#6366f1",
    hoverColor: "#e0e7ff",
  },
];

function getProjectsTabKey(
  raw: any,
): "mine" | "completed" | "completedCommunity" | "favourites" {
  const t = String(raw || "mine");
  if (t === "completed") return "completed";
  if (t === "completedCommunity") return "completedCommunity";
  if (t === "favourites") return "favourites";
  return "mine";
}

export default function SiteHeader() {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();

  const isHome = router.pathname === "/";

  // Show "Trade" badge on tradesman pages even for guests
  const isTradesPage =
    router.pathname.startsWith("/tradesman/") ||
    (router.pathname === "/login" &&
      String(router.query.next || "").includes("/tradesman/"));

  const [isTrades, setIsTrades] = useState(false);
  const [company, setCompany] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  // Seed from sessionStorage on client to avoid blink on subsequent loads
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("vmb:isTradesman");
      if (cached !== null) {
        setIsTrades(cached === "1");
        setCompany(sessionStorage.getItem("vmb:tradesCo") || null);
        setRoleChecked(true);
      }
    } catch {}
  }, []);

  // mobile menu
  const [mobileOpen, setMobileOpen] = useState(false);

  // Only call /api/tradesmen/me when we actually have a logged-in user
  useEffect(() => {
    let alive = true;

    if (!user) {
      setIsTrades(false);
      setCompany(null);
      setRoleChecked(true);
      try {
        sessionStorage.setItem("vmb:isTradesman", "0");
        sessionStorage.removeItem("vmb:tradesCo");
      } catch {}
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const role = String(data?.role || "user").toLowerCase();
        const prof = data?.profile || null;

        const isT = role === "tradesman" || !!prof;
        const co = prof?.company_name || prof?.company || prof?.name || null;

        if (!alive) return;
        setIsTrades(!!isT);
        setCompany(co || null);
        setRoleChecked(true);

        try {
          sessionStorage.setItem("vmb:isTradesman", isT ? "1" : "0");
          if (co) sessionStorage.setItem("vmb:tradesCo", co);
        } catch {}
      } catch {
        if (!alive) return;
        setIsTrades(false);
        setCompany(null);
        setRoleChecked(true);
        try {
          sessionStorage.setItem("vmb:isTradesman", "0");
        } catch {}
      }
    })();

    return () => {
      alive = false;
    };
  }, [user, api]);

  // desktop dropdown menus
  const [openMenu, setOpenMenu] = useState<"trades" | "account" | null>(null);
  const btnTradesRef = useRef<HTMLButtonElement | null>(null);
  const btnAccountRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openMenu) return;
      const t = e.target as Node | null;
      if (
        btnTradesRef.current?.contains(t) ||
        btnAccountRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return;
      setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const initials = useMemo(() => computeInitials(user), [user]);

  // Trades-only CTA
  const tradeCta = useMemo(() => {
    if (!isTrades) return null;
    return {
      href: "/tradesman/projects",
      label: company || "Trades",
      className:
        "inline-flex items-center justify-center rounded-xl px-3.5 h-9 text-sm font-medium bg-red-500 text-white shadow-sm hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2",
      testid: "btn-trades-projects",
    };
  }, [isTrades, company]);

  async function onLogout() {
    try {
      await signOutUser();
    } catch {
      // ignore
    }
    window.location.href = "/";
  }

  // ---- Owner project tabs in header ----
  const isOwnerProjectsPage = router.pathname === "/projects";
  const currentProjectsTab = isOwnerProjectsPage
    ? getProjectsTabKey(
        Array.isArray(router.query?.tab)
          ? router.query.tab[0]
          : router.query?.tab,
      )
    : "mine";

  function handleProjectTabClick(
    key: "mine" | "favourites" | "completed" | "completedCommunity",
  ) {
    if (currentProjectsTab === key) return;

    const nextQuery = { ...router.query, tab: key };

    router.push(
      {
        pathname: "/projects",
        query: nextQuery,
      },
      undefined,
      { shallow: true },
    );
  }

  const showProjectTabsInHeader = !!user && !isTrades && isOwnerProjectsPage;

  const tradesRegisterHref = "/tradesman/login";
  const homeHref = "/";

  /* ========= 1) SIMPLE HOMEPAGE HEADER ========= */
  if (isHome) {
    return (
      <>
        <header
          role="banner"
          aria-label="Site header"
          data-testid="site-header"
          className="sticky top-0 z-50 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur supports-[backdrop-filter]:bg-stone-50/70"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav
              aria-label="Primary navigation"
              className="h-14 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <Link
                  href={homeHref}
                  className="inline-flex items-center gap-2 group"
                  aria-label="Go to homepage"
                  data-testid="nav-home"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm transition-transform group-hover:rotate-3"
                  >
                    <Home className="h-4 w-4" />
                  </span>
                  <span className="text-2xl font-black tracking-tight text-zinc-900">
                    Vet<span className="text-red-500">My</span>Builder
                  </span>
                  {(isTrades || isTradesPage) && (
                    <span className="ml-1.5 text-sm font-semibold text-red-500">Trade</span>
                  )}
                </Link>
              </div>

              <div className="flex items-center gap-3">
                {/* Logged-in homeowner: Projects button + account menu */}
                {user && !isTrades && (
                  <>
                    <Link
                      href="/projects"
                      className="hidden sm:inline-flex items-center gap-1.5 justify-center rounded-xl px-3 h-9 text-sm font-medium bg-amber-400 text-slate-900 shadow-sm hover:bg-amber-300"
                      data-testid="btn-home-projects"
                    >
                      <span>Projects</span>
                      <span className="ml-1.5 text-base leading-none" aria-hidden="true">↗</span>
                    </Link>
                    <div className="relative hidden sm:block" data-testid="account-menu-wrapper">
                      <button
                        ref={btnAccountRef}
                        type="button"
                        aria-label="Account menu"
                        aria-haspopup="menu"
                        aria-expanded={openMenu === "account"}
                        aria-controls="account-menu"
                        onClick={() => setOpenMenu((m) => (m === "account" ? null : "account"))}
                        className="inline-flex items-center gap-2 rounded-full px-2 py-1 ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
                        data-testid="account-menu-button"
                      >
                        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold">
                          {initials || "U"}
                        </span>
                        <svg className={`h-4 w-4 text-gray-500 transition-transform ${openMenu === "account" ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {openMenu === "account" && (
                        <div ref={menuRef} id="account-menu" role="menu" aria-label="Account" data-testid="account-menu" className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
                          <Link role="menuitem" href="/account" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => setOpenMenu(null)}>
                            Edit account
                          </Link>
                          <button role="menuitem" onClick={onLogout} className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50/60">
                            Logout
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Logged-in tradesperson: trades menu */}
                {user && isTrades && (
                  <div className="relative hidden sm:block" data-testid="trades-menu-wrapper">
                    <button
                      ref={btnTradesRef}
                      type="button"
                      aria-label="Trades menu"
                      aria-haspopup="menu"
                      aria-expanded={openMenu === "trades"}
                      onClick={() => setOpenMenu((m) => (m === "trades" ? null : "trades"))}
                      className="inline-flex items-center gap-2 rounded-full px-2 py-1 ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
                      data-testid="trades-menu-button"
                    >
                      <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold">
                        {(company?.[0] || "T").toUpperCase()}
                      </span>
                      <svg className={`h-4 w-4 text-gray-500 transition-transform ${openMenu === "trades" ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {openMenu === "trades" && (
                      <div ref={menuRef} id="trades-menu" role="menu" className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5">
                        <Link role="menuitem" href="/tradesman/profile/edit" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => setOpenMenu(null)}>
                          Manage profile
                        </Link>
                        <button role="menuitem" onClick={onLogout} className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50/60">
                          Logout
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Logged-out (desktop) */}
                {!user && (
                  <>
                    <Link
                      href={tradesRegisterHref}
                      className="hidden sm:inline-flex items-center gap-1.5 justify-center rounded-xl px-3 h-9 text-sm font-medium bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
                      data-testid="btn-are-you-tradesperson"
                    >
                      <Wrench className="h-4 w-4" />
                      <span>Are you a tradesperson?</span>
                    </Link>

                    <Link
                      href="/login"
                      className="hidden sm:inline-flex items-center gap-1.5 justify-center rounded-xl px-3 h-9 text-sm font-medium bg-red-500 text-white shadow-sm hover:bg-red-600"
                      aria-label="Homeowner sign in"
                      data-testid="nav-sign-in"
                    >
                      <User className="h-4 w-4" />
                      <span>Homeowner sign in</span>
                    </Link>
                  </>
                )}

                {/* Mobile menu */}
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  className="inline-flex sm:hidden h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm"
                  onClick={() => setMobileOpen(true)}
                  data-testid="btn-mobile-menu"
                >
                  <span className="sr-only">Toggle menu</span>
                  <div className="space-y-1">
                    <span className="block h-0.5 w-4 rounded-full bg-gray-800" />
                    <span className="block h-0.5 w-4 rounded-full bg-gray-800" />
                    <span className="block h-0.5 w-4 rounded-full bg-gray-800" />
                  </div>
                </button>
              </div>
            </nav>
          </div>
        </header>

        <MobileMenu
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          isTrades={isTrades}
          isAuthed={!!user}
          firstName={user?.firstName ?? null}
          tradeCta={tradeCta}
          onLogout={onLogout}
          onGoHome={() => router.push("/")}
          onGoProjectsTab={(key) =>
            router.push(
              { pathname: "/projects", query: { tab: key } },
              undefined,
              {
                shallow: true,
              },
            )
          }
          onGoAccount={() => router.push("/account")}
          onPostJob={() => router.push("/projects/new")}
        />
      </>
    );
  }

  /* ========= 2) ORIGINAL HEADER FOR THE REST OF THE SITE ========= */
  return (
    <>
      <header
        role="banner"
        aria-label="Site header"
        data-testid="site-header"
        className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav
            aria-label="Primary navigation"
            data-testid="primary-nav"
            className="h-14 flex items-center justify-between gap-4"
          >
            {/* Left */}
            <div className="flex items-center gap-3">
              <Link
                href={homeHref}
                className="inline-flex items-center gap-2"
                aria-label="Go to your projects or home"
                data-testid="nav-home"
                onClick={() => setMobileOpen(false)}
              >
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm"
                >
                  <Home className="h-4 w-4" />
                </span>
                <span className="text-2xl font-black tracking-tight text-zinc-900">
                  Vet<span className="text-red-500">My</span>Builder
                </span>
                {(isTrades || isTradesPage) && (
                  <span className="ml-1.5 text-sm font-semibold text-red-500">Trade</span>
                )}
              </Link>
            </div>

            {/* Center (desktop only) */}
            <div className="flex-1 hidden md:flex items-center justify-center">
              {showProjectTabsInHeader && (
                <div className="flex items-center justify-center gap-6 sm:gap-10">
                  {PROJECT_HEADER_TABS.map((t) => {
                    const active = currentProjectsTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={t.testId}
                        onClick={() => handleProjectTabClick(t.key)}
                        className={[
                          "group relative inline-flex items-center justify-center select-none",
                          "text-[11px] sm:text-xs font-semibold tracking-[0.18em] uppercase",
                          "transition-colors duration-150",
                          active
                            ? "text-slate-900"
                            : "text-slate-500 hover:text-slate-900",
                        ].join(" ")}
                      >
                        <span>{t.label}</span>

                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full opacity-0 group-hover:opacity-80 transition-opacity duration-150"
                          style={{ backgroundColor: t.hoverColor }}
                        />

                        {active && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full"
                            style={{ backgroundColor: t.activeColor }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right (desktop) */}
            <div
              className="hidden md:flex items-center gap-3"
              data-testid="nav-actions"
            >
              {!user && (
                <Link
                  href={tradesRegisterHref}
                  className="hidden sm:inline-flex items-center gap-1.5 justify-center rounded-xl px-3 h-9 text-sm font-medium bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
                  data-testid="btn-are-you-tradesperson"
                >
                  <Wrench className="h-4 w-4" />
                  <span>Are you a tradesperson?</span>
                </Link>
              )}

              {user && roleChecked && !isTrades && router.pathname !== "/login" && (
                <Link
                  href="/projects/new"
                  aria-label="Post a Job"
                  aria-hidden="true"
                  tabIndex={-1}
                  className={[
                    "hidden sm:inline-flex items-center justify-center rounded-xl px-4 h-9 text-sm font-semibold",
                    "bg-amber-400 text-slate-900 shadow-sm hover:bg-amber-300",
                    "sm:[aria-hidden=false] sm:tabIndex-0",
                  ].join(" ")}
                  data-testid="btn-post-job-header"
                >
                  <span>Post a Job</span>
                  <span
                    className="ml-1.5 text-base leading-none"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </Link>
              )}

              {user && <NotificationsBell />}

              {user && isTrades && (
                <div className="relative" data-testid="trades-menu-wrapper">
                  <button
                    ref={btnTradesRef}
                    type="button"
                    aria-label="Trades menu"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "trades"}
                    aria-controls="trades-menu"
                    onClick={() =>
                      setOpenMenu((m) => (m === "trades" ? null : "trades"))
                    }
                    className="inline-flex items-center gap-2 rounded-full px-2 py-1 ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
                    data-testid="trades-menu-button"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold"
                    >
                      {(company?.[0] || "T").toUpperCase()}
                    </span>
                    <span className="hidden sm:block text-sm text-gray-700">
                      {company || "Trades"}
                    </span>
                    <svg
                      className={`h-4 w-4 text-gray-500 transition-transform ${
                        openMenu === "trades" ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {openMenu === "trades" && (
                    <div
                      ref={menuRef}
                      id="trades-menu"
                      role="menu"
                      aria-label="Trades"
                      data-testid="trades-menu"
                      className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
                    >
                      <Link
                        role="menuitem"
                        href="/tradesman/profile/edit"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => setOpenMenu(null)}
                        aria-label="Manage profile"
                        data-testid="menu-manage-profile"
                      >
                        Manage profile
                      </Link>
                      <button
                        role="menuitem"
                        onClick={onLogout}
                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50/60"
                        aria-label="Log out"
                        data-testid="menu-logout"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              )}

              {user && !isTrades && (
                <div className="relative" data-testid="account-menu-wrapper">
                  <button
                    ref={btnAccountRef}
                    type="button"
                    aria-label="Account menu"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "account"}
                    aria-controls="account-menu"
                    onClick={() =>
                      setOpenMenu((m) => (m === "account" ? null : "account"))
                    }
                    className="inline-flex items-center gap-2 rounded-full px-2 py-1 ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
                    data-testid="account-menu-button"
                  >
                    <span
                      aria-hidden
                      data-testid="account-initials"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold"
                    >
                      {initials || "U"}
                    </span>
                    <svg
                      className={`h-4 w-4 text-gray-500 transition-transform ${
                        openMenu === "account" ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {openMenu === "account" && (
                    <div
                      ref={menuRef}
                      id="account-menu"
                      role="menu"
                      aria-label="Account"
                      data-testid="account-menu"
                      className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
                    >
                      <Link
                        role="menuitem"
                        href="/account"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => setOpenMenu(null)}
                      >
                        Edit account
                      </Link>
                      <button
                        role="menuitem"
                        onClick={onLogout}
                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50/60"
                        data-testid="menu-logout"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!user && (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 justify-center rounded-xl px-3 h-9 text-sm font-medium bg-red-500 text-white shadow-sm hover:bg-red-600"
                  aria-label="Homeowner sign in"
                  data-testid="nav-sign-in"
                >
                  <User className="h-4 w-4" />
                  <span>Homeowner sign in</span>
                </Link>
              )}
            </div>

            {/* Right (mobile): bell + initials + burger */}
            <div className="flex md:hidden items-center gap-2">
              {user && <NotificationsBell />}

              {user && !isTrades && (
                <InitialsBadge
                  initials={initials}
                  testId="account-initials-badge-mobile"
                  onClick={() => {
                    setOpenMenu((m) => (m === "account" ? null : "account"));
                    setMobileOpen(false);
                  }}
                />
              )}

              <button
                type="button"
                aria-label="Open navigation menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm"
                onClick={() => setMobileOpen(true)}
                data-testid="btn-mobile-menu"
              >
                <span className="sr-only">Toggle menu</span>
                <div className="space-y-1">
                  <span className="block h-0.5 w-4 rounded-full bg-gray-800" />
                  <span className="block h-0.5 w-4 rounded-full bg-gray-800" />
                  <span className="block h-0.5 w-4 rounded-full bg-gray-800" />
                </div>
              </button>
            </div>
          </nav>
        </div>
      </header>

      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        isTrades={isTrades}
        isAuthed={!!user}
        firstName={user?.firstName ?? null}
        tradeCta={tradeCta}
        onLogout={onLogout}
        onGoHome={() => router.push("/")}
        onGoProjectsTab={(key) =>
          router.push(
            { pathname: "/projects", query: { tab: key } },
            undefined,
            {
              shallow: true,
            },
          )
        }
        onGoAccount={() => router.push("/account")}
        onPostJob={() => router.push("/projects/new")}
      />
    </>
  );
}
