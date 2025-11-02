import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState, useEffect } from "react";
import { useAuth, signOutUser } from "@/utils/auth";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";

const NotificationsBell = dynamic(
  () => import("@/components/NotificationsBell"),
  { ssr: false, loading: () => null }
);

function computeInitials(u: any | null | undefined): string | undefined {
  if (!u) return undefined;
  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln)
    return (
      ((fn ? fn[0] : "") + (ln ? ln[0] : "") || "").toUpperCase() || undefined
    );
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

export default function SiteHeader() {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();

  const [isTrades, setIsTrades] = useState(false);
  const [company, setCompany] = useState<string | null>(null);

  // Only call /api/tradesmen/me when we actually have a logged-in user.
  useEffect(() => {
    let alive = true;

    if (!user) {
      setIsTrades(false);
      setCompany(null);
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

        try {
          sessionStorage.setItem("vmb:isTradesman", isT ? "1" : "0");
          if (co) sessionStorage.setItem("vmb:tradesCo", co);
        } catch {}
      } catch (e: any) {
        // If token isn’t ready yet, avoid noisy error UI.
        if (!alive) return;
        setIsTrades(false);
        setCompany(null);
        try {
          sessionStorage.setItem("vmb:isTradesman", "0");
        } catch {}
      }
    })();

    return () => {
      alive = false;
    };
  }, [user, api]);

  // menus
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
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const initials = useMemo(() => computeInitials(user), [user]);

  const cta = useMemo(() => {
    if (isTrades) {
      return {
        href: "/tradesman/projects",
        label: company || "Trades",
        className:
          "inline-flex items-center justify-center rounded-xl px-3.5 h-9 text-sm font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
        testid: "btn-trades-projects",
      };
    }
    return {
      href: "/tradesman/register",
      label: "Vendor portal",
      className:
        "inline-flex items-center justify-center rounded-xl px-3.5 h-9 text-sm font-medium ring-1 ring-indigo-200/70 text-indigo-700 hover:bg-indigo-50",
      testid: "btn-vendor-portal",
    };
  }, [isTrades, company]);

  async function onLogout() {
    try {
      await signOutUser();
      window.location.href = "/";
    } catch {
      alert("Failed to sign out. Please try again.");
    }
  }

  return (
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
          className="h-14 flex items-center justify-between"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2"
            aria-label="Vetmybuilder home"
            data-testid="nav-home"
          >
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white ring-1 ring-indigo-200/50 shadow-sm"
            />
            <span className="sr-only">Vetmybuilder</span>
          </Link>

          <div className="flex items-center gap-3" data-testid="nav-actions">
            <Link
              href={cta.href}
              className={cta.className}
              title={cta.label}
              data-testid={cta.testid}
            >
              {cta.label}
            </Link>

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
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
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
                      href="/tradesman/register"
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
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
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
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200/70 hover:bg-indigo-50"
                aria-label="Sign in"
                data-testid="nav-sign-in"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
