// web/components/Layout.tsx
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth, signOutUser } from "@/utils/auth";
import NotificationsBell from "@/components/NotificationsBell";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header
        role="banner"
        aria-label="Site"
        className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav
            aria-label="Primary"
            className="h-14 flex items-center justify-between"
          >
            <Link
              href="/"
              className="inline-flex items-center gap-2"
              aria-label="Vetmybuilder home"
            >
              <span
                aria-hidden
                className="inline-flex h-7 w-7 items-center justify-center rounded-xl
                           bg-gradient-to-br from-indigo-500 to-blue-600 text-white
                           ring-1 ring-indigo-200/50 shadow-sm"
              />
              <span className="sr-only">Vetmybuilder</span>
            </Link>

            <div className="flex items-center gap-3">
              {user && <NotificationsBell />}

              {!user ? (
                <Link
                  href="/login"
                  className="rounded-xl px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200/70 hover:bg-indigo-50"
                >
                  Sign in
                </Link>
              ) : (
                <div className="relative">
                  <button
                    ref={btnRef}
                    type="button"
                    aria-label="Account"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-full px-2 py-1
                               ring-1 ring-gray-300/80 bg-white hover:bg-gray-50 shadow-sm"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold"
                    >
                      {(user.email || user.uid).slice(0, 1).toUpperCase()}
                    </span>
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
                      role="menu"
                      aria-label="Account"
                      className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
                    >
                      <Link
                        role="menuitem"
                        href="/account"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => setOpen(false)}
                      >
                        Manage account
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
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className="pt-14">
        {children}
      </main>
    </>
  );
}
