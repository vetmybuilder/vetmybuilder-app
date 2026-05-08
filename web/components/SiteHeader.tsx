// web/components/SiteHeader.tsx
import Link from "next/link";
import React, { useMemo, useRef, useState, useEffect } from "react";
import { UserCog, LogOut } from "lucide-react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useMobileMenu } from "@/utils/mobileMenu";
import BrandWordmark from "@/components/BrandWordmark";
import InboxDropdown, { useInboxUnread } from "@/components/InboxDropdown";
import TradesmanInboxDropdown, {
  useTradesInboxUnread,
} from "@/components/TradesmanInboxDropdown";
import MessagesIconButton from "@/components/header/MessagesIconButton";

// Owner project tabs - rendered in the centre of the header for any
// signed-in homeowner. Clicking a tab from anywhere routes to /projects
// with the right ?tab= query, so the user can jump to favourites
// without first walking to /projects. Recommendations live on each
// project's right rail, so they don't need a global tab here.
const OWNER_TABS = [
  { key: "mine", label: "Live" },
  { key: "completed", label: "Completed" },
  { key: "favourites", label: "Favourites" },
] as const;
type OwnerTabKey = (typeof OWNER_TABS)[number]["key"];

// Trade-side primary nav - mirrors the homeowner OWNER_TABS but routes
// to the trade-side equivalents. Rendered in the centre of the header
// for any signed-in tradesperson so they can jump between Jobs, Jobs
// list, and Incoming interest from anywhere on the site. Matches is
// no longer surfaced as a top-level tab - matched threads live in
// the messages dropdown's Activity tab + the bottom-right dock, so
// the standalone /tradesman/matches page is redundant on desktop.
const TRADES_TABS = [
  { key: "jobs", label: "Jobs", href: "/tradesman/jobs" },
  { key: "jobs-list", label: "Jobs list", href: "/tradesman/jobs/list" },
  { key: "leads", label: "Incoming interest", href: "/tradesman/leads" },
] as const;
type TradesTabKey = (typeof TRADES_TABS)[number]["key"];

function computeInitials(u: any | null | undefined): string | undefined {
  if (!u) return undefined;

  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) {
    const out = ((fn ? fn[0] : "") + (ln ? ln[0] : "")).toUpperCase();
    return out || undefined;
  }

  // NOTE: we deliberately do NOT fall back to Firebase's `displayName` here.
  // For Google OAuth users mid-signup, displayName is the Google profile name
  // even though the homeowner profile (firstName/lastName/username) hasn't
  // been captured yet — falling back would leak Google initials into the
  // header before the user has actually finished signing up.

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
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
      >
        {initials || "U"}
      </span>
    </button>
  );
}

export default function SiteHeader() {
  const { user, loading: authLoading, profileComplete } = useAuth();
  const api = useApi();
  const router = useRouter();

  // On the role-error page the user is mid-sign-out; treat them as guest to
  // prevent Firebase's brief IndexedDB cache restore from flashing the avatar.
  // Use window.location.search (not router.asPath) so it's available from the
  // very first render before Next.js router initialization completes.
  const [isRoleErrorPage, setIsRoleErrorPage] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.location.search.includes("role_error=");
    }
    return false;
  });

  // Keep in sync if the URL changes client-side
  useEffect(() => {
    const next = typeof window !== "undefined"
      ? window.location.search.includes("role_error=")
      : router.asPath.includes("role_error=");
    setIsRoleErrorPage(next);
  }, [router.asPath]);

  // Also suppress avatar on the login page itself — Firebase fires the auth-state
  // change as soon as signInWithEmailAndPassword resolves, so the avatar would
  // briefly flash before the role check and redirect/reload complete.
  const isLoginPage = router.pathname === "/login";
  const isSignupPage = router.pathname.startsWith("/signup"); // covers /signup and /signup/complete
  // Suppress both Sign-in and Join CTAs on any auth-related route — the
  // page itself owns the auth journey, header pills are just noise.
  const isAuthPage =
    isLoginPage ||
    isSignupPage ||
    router.pathname === "/forgot-password" ||
    router.pathname === "/reset-password" ||
    router.pathname.startsWith("/tradesman/login") ||
    router.pathname.startsWith("/tradesman/signup") ||
    router.pathname === "/tradesman/register-tradesmen";

  // Suppress the account chrome (avatar, notifications, Post-a-Job) once we
  // KNOW the user is authed at the Firebase layer but hasn't finished
  // homeowner signup yet — i.e. /api/me has explicitly returned with no
  // postcode. profileComplete === null means we're still fetching /api/me;
  // in that case we leave the header alone to avoid flashing on every
  // page load for returning users with a complete profile.
  const isMidSignup = !!user && profileComplete === false;

  const displayUser =
    isRoleErrorPage || isLoginPage || isMidSignup ? null : user;


  const isHome = router.pathname === "/";

  // Show "Trade" badge on tradesman-section pages (dashboard, profile, login,
  // etc.) but NOT on the public tradesman profile page `/tradesman/[id]`
  // which homeowners visit to browse a specific tradesman.
  const isTradesPage =
    (router.pathname.startsWith("/tradesman/") &&
      router.pathname !== "/tradesman/[id]") ||
    (router.pathname === "/login" &&
      String(router.query.next || "").includes("/tradesman/"));

  const [isTrades, setIsTrades] = useState(false);
  const [company, setCompany] = useState<string | null>(null);
  // Profile picture URL for the trades menu avatar. Mirrors the same
  // field /tradesman/account renders (profile.profile_picture_url).
  // Cached in sessionStorage so it doesn't blink on subsequent loads.
  const [tradesPhoto, setTradesPhoto] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  // Seed from sessionStorage on client to avoid blink on subsequent loads.
  // Honour the one-shot `vmb:justRegisteredTradesman` flag set by the
  // tradesman register flow so we don't render the homeowner variant
  // while an earlier in-flight GET's stale "0" is still in the cache.
  useEffect(() => {
    try {
      const justRegistered =
        sessionStorage.getItem("vmb:justRegisteredTradesman") === "1";
      if (justRegistered) {
        setIsTrades(true);
        setCompany(sessionStorage.getItem("vmb:tradesCo") || null);
        setTradesPhoto(sessionStorage.getItem("vmb:tradesPhoto") || null);
        setRoleChecked(true);
        // don't remove the flag here — useRole owns the one-shot lifecycle
        return;
      }

      const cached = sessionStorage.getItem("vmb:isTradesman");
      if (cached !== null) {
        setIsTrades(cached === "1");
        setCompany(sessionStorage.getItem("vmb:tradesCo") || null);
        setTradesPhoto(sessionStorage.getItem("vmb:tradesPhoto") || null);
        setRoleChecked(true);
      }
    } catch {}
  }, []);

  // mobile menu — global instance lives at the app root; the burger
  // buttons here just call openMenu() via the shared context. Inbox
  // unread count is now owned by GlobalMobileMenu too.
  const { openMenu: openMobileMenu, closeMenu: closeMobileMenu } =
    useMobileMenu();

  // Only call /api/tradesmen/me when we actually have a logged-in user
  useEffect(() => {
    let alive = true;

    if (!displayUser) {
      setIsTrades(false);
      setCompany(null);
      setTradesPhoto(null);
      setRoleChecked(true);
      try {
        sessionStorage.setItem("vmb:isTradesman", "0");
        sessionStorage.removeItem("vmb:tradesCo");
        sessionStorage.removeItem("vmb:tradesPhoto");
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
        // Same field /tradesman/account renders. avatar_url + first
        // photo are kept as fallbacks in case profile_picture_url is
        // unset but the trade has uploaded photos.
        const photo: string | null =
          prof?.profile_picture_url ||
          prof?.avatar_url ||
          (Array.isArray(prof?.photo_urls) ? prof!.photo_urls[0] : null) ||
          null;

        if (!alive) return;
        setIsTrades(!!isT);
        setCompany(co || null);
        setTradesPhoto(photo);
        setRoleChecked(true);

        try {
          sessionStorage.setItem("vmb:isTradesman", isT ? "1" : "0");
          if (co) sessionStorage.setItem("vmb:tradesCo", co);
          else sessionStorage.removeItem("vmb:tradesCo");
          if (photo) sessionStorage.setItem("vmb:tradesPhoto", photo);
          else sessionStorage.removeItem("vmb:tradesPhoto");
        } catch {}
      } catch {
        if (!alive) return;
        setIsTrades(false);
        setCompany(null);
        setTradesPhoto(null);
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
  const [openMenu, setOpenMenu] = useState<
    "trades" | "account" | "messages" | null
  >(null);
  const btnTradesRef = useRef<HTMLButtonElement | null>(null);
  const btnAccountRef = useRef<HTMLButtonElement | null>(null);
  const btnMessagesRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openMenu) return;
      const t = e.target as Node | null;
      if (
        btnTradesRef.current?.contains(t) ||
        btnAccountRef.current?.contains(t) ||
        btnMessagesRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return;
      setOpenMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const initials = useMemo(() => computeInitials(displayUser), [displayUser]);

  async function onLogout() {
    try {
      await signOutUser();
    } catch {
      // ignore
    }
    window.location.href = "/";
  }

  const homeHref = "/";

  // Owner tabs visible whenever the viewer is a signed-in homeowner and
  // not on an auth screen. Hidden for tradespeople and on /admin/*
  // (admin uses its own AdminLayout shell).
  const showOwnerTabs =
    !!displayUser && !isTrades && !isAuthPage && !router.pathname.startsWith("/admin");

  const onProjectsListPage = router.pathname === "/projects";
  const activeOwnerTab: OwnerTabKey | null = onProjectsListPage
    ? (() => {
        const raw = Array.isArray(router.query?.tab)
          ? router.query.tab[0]
          : router.query?.tab;
        const t = String(raw || "mine");
        if (t === "completed" || t === "favourites") return t;
        return "mine";
      })()
    : null;

  // Trade-side primary tabs - mirrors showOwnerTabs but for tradesmen.
  // Active state covers both /tradesman/jobs (the swipe deck) and
  // /tradesman/jobs/list since they're the same product surface from
  // the user's POV.
  const showTradesTabs =
    !!displayUser && isTrades && !isAuthPage && !router.pathname.startsWith("/admin");

  const activeTradesTab: TradesTabKey | null = (() => {
    const p = router.pathname;
    if (p.startsWith("/tradesman/jobs/list")) return "jobs-list";
    if (p.startsWith("/tradesman/jobs")) return "jobs";
    if (p.startsWith("/tradesman/matches")) return "matches";
    if (p.startsWith("/tradesman/leads")) return "leads";
    return null;
  })();

  function handleOwnerTabClick(key: OwnerTabKey) {
    router.push(
      { pathname: "/projects", query: { tab: key } },
      undefined,
      { shallow: onProjectsListPage },
    );
  }

  // Combined unread count across Messages + Activity tabs of the inbox.
  // Only fetched for signed-in homeowners (the only viewers who see the
  // inbox icon).
  const { total: inboxUnread } = useInboxUnread(!!displayUser && !isTrades);
  const { total: tradesInboxUnread } = useTradesInboxUnread(
    !!displayUser && isTrades,
  );

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
                  className="inline-flex items-center group"
                  aria-label="Go to homepage"
                  data-testid="nav-home"
                >
                  <BrandWordmark tone={isTrades || isTradesPage ? "emerald" : "indigo"} />
                </Link>
              </div>

              {/* Trade-side tabs - rendered on the homepage too so a
                  signed-in tradesperson can jump straight to Jobs /
                  Matches / etc without opening the avatar dropdown. */}
              {showTradesTabs && (
                <div className="hidden md:flex flex-1 items-center justify-center">
                  <div
                    className="inline-flex rounded-full bg-emerald-50 p-1"
                    role="tablist"
                    aria-label="Trade sections"
                  >
                    {TRADES_TABS.map((t) => {
                      const active = activeTradesTab === t.key;
                      return (
                        <Link
                          key={t.key}
                          href={t.href}
                          role="tab"
                          aria-selected={active}
                          className={`rounded-full px-3 py-1 text-[12.5px] font-bold transition-colors ${
                            active
                              ? "text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          style={
                            active
                              ? { background: "linear-gradient(135deg,#10b981,#059669)" }
                              : {}
                          }
                        >
                          {t.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* Logged-in homeowner: Projects button + account menu */}
                {displayUser && !isTrades && (
                  <>
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
                        <span
                          aria-hidden
                          data-testid="account-initials"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
                        >
                          {initials || "U"}
                        </span>
                        <svg className={`h-4 w-4 text-gray-500 transition-transform ${openMenu === "account" ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {openMenu === "account" && (
                        <div
                          ref={menuRef}
                          id="account-menu"
                          role="menu"
                          aria-label="Account"
                          data-testid="account-menu"
                          className="absolute right-0 top-12 z-50 w-[260px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                        >
                          {/* Profile mini-header */}
                          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                            <span
                              aria-hidden
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold"
                            >
                              {initials || "U"}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[13px] font-extrabold text-slate-900 truncate">
                                {(displayUser as any)?.firstName || (displayUser as any)?.username || "Your account"}
                              </div>
                              <div className="text-[11.5px] text-slate-500 truncate">
                                {(displayUser as any)?.email || ""}
                              </div>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="p-1.5">
                            <Link
                              role="menuitem"
                              href="/account"
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-amber-50 hover:text-slate-900 transition-colors"
                              onClick={() => setOpenMenu(null)}
                            >
                              <UserCog className="h-4 w-4 text-slate-400" />
                              <span>Manage account</span>
                            </Link>
                          </div>

                          {/* Logout (visually separated) */}
                          <div className="p-1.5 border-t border-slate-100">
                            <button
                              role="menuitem"
                              onClick={onLogout}
                              className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-red-600 hover:bg-red-50/70 transition-colors"
                              data-testid="menu-logout"
                            >
                              <LogOut className="h-4 w-4" />
                              <span>Logout</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Logged-in tradesperson: trades menu */}
                {displayUser && isTrades && (
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
                      <TradesAvatar
                        size={28}
                        photoUrl={tradesPhoto}
                        company={company}
                      />
                      {company && (
                        <span className="text-sm font-medium text-gray-700 max-w-[200px] truncate">
                          {company}
                        </span>
                      )}
                      <svg className={`h-4 w-4 text-gray-500 transition-transform ${openMenu === "trades" ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {openMenu === "trades" && (
                      <div
                        ref={menuRef}
                        id="trades-menu"
                        role="menu"
                        aria-label="Trades"
                        className="absolute right-0 top-12 z-50 w-[280px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                      >
                        {/* Profile mini-header — same shape as the other
                            trades dropdown variant so the menu reads
                            consistently across pages. */}
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                          <TradesAvatar
                            size={40}
                            photoUrl={tradesPhoto}
                            company={company}
                          />
                          <div className="min-w-0">
                            <div className="text-[13px] font-extrabold text-slate-900 truncate">
                              {company || "Your trade"}
                            </div>
                            <div className="text-[11.5px] text-slate-500 truncate">
                              {(displayUser as any)?.email || ""}
                            </div>
                          </div>
                        </div>

                        {/* Items - top-level surfaces (Jobs, Matches,
                            Incoming interest) live in the centered
                            trade tabs and are intentionally NOT
                            duplicated here. Same shape as the
                            non-homepage variant so the menu reads
                            consistently across pages. */}
                        <div className="p-1.5">
                          <Link
                            role="menuitem"
                            href="/tradesman/account"
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-emerald-50 hover:text-slate-900 transition-colors"
                            onClick={() => setOpenMenu(null)}
                          >
                            <UserCog className="h-4 w-4 text-slate-400" />
                            <span>Account</span>
                          </Link>
                        </div>

                        {/* Logout (visually separated) */}
                        <div className="p-1.5 border-t border-slate-100">
                          <button
                            role="menuitem"
                            onClick={onLogout}
                            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-red-600 hover:bg-red-50/70 transition-colors"
                          >
                            <LogOut className="h-4 w-4" />
                            <span>Logout</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Homepage header is intentionally bare for guests - the
                    "join our growing community" handwritten link inside the
                    hero is the single Join CTA. The mobile burger below
                    still gives access to sign-in / signup links for guests
                    on small screens. */}

                {/* Mobile menu */}
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  className="inline-flex sm:hidden h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors"
                  onClick={openMobileMenu}
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
        className="sticky top-0 z-50 border-b border-stone-200/70 bg-stone-50/80 backdrop-blur supports-[backdrop-filter]:bg-stone-50/70"
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
                className="inline-flex items-center"
                aria-label="Go to your projects or home"
                data-testid="nav-home"
                onClick={closeMobileMenu}
              >
                <BrandWordmark tone={isTrades || isTradesPage ? "emerald" : "indigo"} />
              </Link>
            </div>

            {/* Centre: owner project tabs (Live / Completed / Favourites /
                Recommendations). Acts as primary nav for homeowners so any
                page can jump straight to a tab. Desktop only. */}
            {showOwnerTabs && (
              <div className="hidden md:flex flex-1 items-center justify-center">
                <div
                  className="inline-flex rounded-full bg-amber-50 p-1"
                  role="tablist"
                  aria-label="Project sections"
                  data-testid="owner-tabs"
                >
                  {OWNER_TABS.map((t) => {
                    const active = activeOwnerTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`owner-tab-${t.key}`}
                        onClick={() => handleOwnerTabClick(t.key)}
                        className={`rounded-full px-3 py-1 text-[12.5px] font-bold transition-colors ${
                          active
                            ? "text-white shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        style={
                          active
                            ? { background: "linear-gradient(135deg,#6366f1,#4f46e5)" }
                            : {}
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trade-side primary nav: Jobs / Jobs list / Matches /
                Incoming interest. Same shape + position as the owner
                tabs but emerald-tinted so the two viewer roles read as
                visually distinct. Active tab gets the emerald pill. */}
            {showTradesTabs && (
              <div className="hidden md:flex flex-1 items-center justify-center">
                <div
                  className="inline-flex rounded-full bg-emerald-50 p-1"
                  role="tablist"
                  aria-label="Trade sections"
                  data-testid="trades-tabs"
                >
                  {TRADES_TABS.map((t) => {
                    const active = activeTradesTab === t.key;
                    return (
                      <Link
                        key={t.key}
                        href={t.href}
                        role="tab"
                        aria-selected={active}
                        data-testid={`trades-tab-${t.key}`}
                        className={`rounded-full px-3 py-1 text-[12.5px] font-bold transition-colors ${
                          active
                            ? "text-white shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        style={
                          active
                            ? { background: "linear-gradient(135deg,#10b981,#059669)" }
                            : {}
                        }
                      >
                        {t.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Right (desktop) */}
            <div
              className="hidden md:flex items-center gap-1.5"
              data-testid="nav-actions"
            >
              {!displayUser && !isAuthPage && (
                <Link
                  href="/login"
                  className="hidden sm:inline-flex items-center justify-center rounded-xl px-3 h-9 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  data-testid="nav-sign-in"
                >
                  <span>Sign in</span>
                </Link>
              )}

              {/* Post a Job button removed from header - now a floating button on the projects page */}

              {/* Messages dropdown trigger - homeowner. Indigo tone,
                  unread from useInboxUnread, /api/matches-backed
                  InboxDropdown. Pops the bottom-right MessagingDock
                  open at the same time. */}
              {displayUser && !isTrades && (
                <MessagesIconButton
                  buttonRef={btnMessagesRef}
                  menuRef={menuRef}
                  isOpen={openMenu === "messages"}
                  onToggle={() =>
                    setOpenMenu((m) =>
                      m === "messages" ? null : "messages",
                    )
                  }
                  unread={inboxUnread}
                  tone="indigo"
                  testId="nav-messages"
                  popDockOnOpen
                  renderDropdown={() => (
                    <InboxDropdown onClose={() => setOpenMenu(null)} />
                  )}
                />
              )}

              {/* Messages dropdown trigger - tradesperson. Emerald
                  tone, unread from useTradesInboxUnread,
                  /api/tradesman/matches-backed dropdown. Does NOT pop
                  the dock; the chat window only opens when a thread
                  is explicitly tapped inside the dropdown. */}
              {displayUser && isTrades && (
                <MessagesIconButton
                  buttonRef={btnMessagesRef}
                  menuRef={menuRef}
                  isOpen={openMenu === "messages"}
                  onToggle={() =>
                    setOpenMenu((m) =>
                      m === "messages" ? null : "messages",
                    )
                  }
                  unread={tradesInboxUnread}
                  tone="emerald"
                  testId="nav-trades-messages"
                  renderDropdown={() => (
                    <TradesmanInboxDropdown
                      onClose={() => setOpenMenu(null)}
                    />
                  )}
                />
              )}

              {displayUser && isTrades && (
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
                    <TradesAvatar
                      size={28}
                      photoUrl={tradesPhoto}
                      company={company}
                    />
                    <span className="hidden sm:block text-sm font-semibold text-gray-700 max-w-[200px] truncate">
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
                      className="absolute right-0 top-12 z-50 w-[280px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                    >
                      {/* Profile mini-header — mirrors the homeowner
                          dropdown so the two roles read as parallel UIs. */}
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                        <TradesAvatar
                          size={40}
                          photoUrl={tradesPhoto}
                          company={company}
                        />
                        <div className="min-w-0">
                          <div className="text-[13px] font-extrabold text-slate-900 truncate">
                            {company || "Your trade"}
                          </div>
                          <div className="text-[11.5px] text-slate-500 truncate">
                            {(displayUser as any)?.email || ""}
                          </div>
                        </div>
                      </div>

                      {/* Items - top-level surfaces (Jobs, Matches,
                          Incoming interest) live in the header tabs and
                          are intentionally NOT duplicated here. */}
                      <div className="p-1.5">
                        <Link
                          role="menuitem"
                          href="/tradesman/account"
                          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-emerald-50 hover:text-slate-900 transition-colors"
                          onClick={() => setOpenMenu(null)}
                          data-testid="menu-account"
                        >
                          <UserCog className="h-4 w-4 text-slate-400" />
                          <span>Manage account</span>
                        </Link>
                      </div>

                      {/* Logout (visually separated) */}
                      <div className="p-1.5 border-t border-slate-100">
                        <button
                          role="menuitem"
                          onClick={onLogout}
                          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-red-600 hover:bg-red-50/70 transition-colors"
                          data-testid="menu-logout"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {displayUser && !isTrades && (
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
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
                    >
                      {initials || "U"}
                    </span>
                    {isTrades && company && (
                      <span className="hidden sm:inline text-sm font-medium text-gray-700 max-w-[200px] truncate">
                        {company}
                      </span>
                    )}
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
                      className="absolute right-0 top-12 z-50 w-[260px] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                    >
                      {/* Profile mini-header */}
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
                        <span
                          aria-hidden
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold"
                        >
                          {initials || "U"}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-extrabold text-slate-900 truncate">
                            {(displayUser as any)?.firstName || (displayUser as any)?.username || "Your account"}
                          </div>
                          <div className="text-[11.5px] text-slate-500 truncate">
                            {(displayUser as any)?.email || ""}
                          </div>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="p-1.5">
                        <Link
                          role="menuitem"
                          href="/account"
                          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-700 hover:bg-amber-50 hover:text-slate-900 transition-colors"
                          onClick={() => setOpenMenu(null)}
                        >
                          <UserCog className="h-4 w-4 text-slate-400" />
                          <span>Manage account</span>
                        </Link>
                      </div>

                      {/* Logout (visually separated) */}
                      <div className="p-1.5 border-t border-slate-100">
                        <button
                          role="menuitem"
                          onClick={onLogout}
                          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-red-600 hover:bg-red-50/70 transition-colors"
                          data-testid="menu-logout"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!displayUser && !isAuthPage && (
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-xl px-5 h-9 text-sm font-bold text-white shadow-sm transition-colors"
                  style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                  data-testid="nav-join"
                >
                  <span>Get started</span>
                </Link>
              )}
            </div>

            {/* Right (mobile): burger only - messages live inside the
                mobile menu drawer for now. */}
            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                aria-label="Open navigation menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors"
                onClick={openMobileMenu}
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

    </>
  );
}

/* Avatar shown in the trades menu trigger. Renders the profile picture
   when present (same field /tradesman/account uses), falls back to a
   red-circle initial when no photo or when the image fails to load.
   Direct <img> with explicit dimensions - same pattern as MobileMenu /
   MessagingDock so loading is consistent across the app. */
function TradesAvatar({
  size,
  photoUrl,
  company,
}: {
  size: number;
  photoUrl: string | null;
  company: string | null;
}) {
  const [errored, setErrored] = useState(false);
  const initial = (company || "T").trim().charAt(0).toUpperCase() || "T";
  const dim = { width: `${size}px`, height: `${size}px` };
  const fontSize = size >= 36 ? "14px" : "12px";

  if (photoUrl && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        aria-hidden
        className="rounded-full object-cover shrink-0"
        style={dim}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white font-bold"
      style={{ ...dim, fontSize }}
    >
      {initial}
    </span>
  );
}
