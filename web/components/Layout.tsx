// web/components/Layout.tsx
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, signOutUser } from "@/utils/auth";

// ⬇️ Import bell client-only to avoid SSR hook errors
const NotificationsBell = dynamic(
  () => import("@/components/NotificationsBell"),
  { ssr: false, loading: () => null }
);

function computeInitials(u: any | null | undefined): string | undefined {
  if (!u) return undefined;

  const fn = (u.firstName || "").trim();
  const ln = (u.lastName || "").trim();
  if (fn || ln) {
    const a = fn ? fn[0] : "";
    const b = ln ? ln[0] : "";
    const ab = (a + b || a || b).toUpperCase();
    return ab || undefined;
  }

  const dn = (u.displayName || "").trim();
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return dn.slice(0, 2).toUpperCase();
  }

  const un = (u.username || "").trim();
  if (un) {
    const parts = un.split(/[.\-_ ]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return un.slice(0, 2).toUpperCase();
  }

  // No email fallback — show skeleton until profile data is loaded.
  return undefined;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const menuId = "account-menu";

  async function onLogout() {
    try {
      await signOutUser();
      window.location.href = "/";
    } catch {
      alert("Failed to sign out. Please try again.");
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = useMemo(() => computeInitials(user), [user]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
        aria-label="Skip to content"
        data-testid="skip-to-content"
      >
        Skip to content
      </a>

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
                className="inline-flex h-7 w-7 items-center justify-center rounded-xl
                           bg-gradient-to-br from-indigo-500 to-blue-600 text-white
                           ring-1 ring-indigo-200/50 shadow-sm"
              />
              <span className="sr-only">Vetmybuilder</span>
            </Link>

            <div className="flex items-center gap-3" data-testid="nav-actions">
              {/* Client-only bell */}
              {user && <NotificationsBell />}

              {!user ? (
                <Link
                  href="/login"
                  className="rounded-xl px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200/70 hover:bg-indigo-50"
                  aria-label="Sign in"
                  data-testid="nav-sign-in"
                >
                  Sign in
                </Link>
              ) : (
                <div className="relative" data-testid="account-menu-wrapper">
                  <button
                    ref={btnRef}
                    type="button"
                    aria-label="Account menu"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={menuId}
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-full px-2 py-1
                               ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
                    data-testid="account-button"
                  >
                    {/* Avatar / initials */}
                    {initials ? (
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
                        data-testid="account-initials"
                      >
                        {initials}
                      </span>
                    ) : (
                      // Skeleton while we don't yet have name data (prevents flashing wrong letter)
                      <span
                        aria-hidden
                        className="inline-block h-7 w-7 animate-pulse rounded-full bg-zinc-300"
                        data-testid="account-initials-skeleton"
                      />
                    )}

                    <span className="hidden sm:block text-sm text-gray-700">
                      Account
                    </span>
                    <svg
                      className={`h-4 w-4 text-gray-500 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      data-testid="account-caret"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {open && (
                    <div
                      ref={menuRef}
                      id={menuId}
                      role="menu"
                      aria-label="Account"
                      data-testid="account-menu"
                      className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
                    >
                      <Link
                        role="menuitem"
                        href="/account"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => setOpen(false)}
                        aria-label="Manage account"
                        data-testid="menu-manage-account"
                      >
                        Manage account
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
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className="pt-14" data-testid="main-content">
        {children}
      </main>
    </>
  );
}
