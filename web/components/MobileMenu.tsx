import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Home, X } from "lucide-react";

type ProjectsTabKey =
  | "mine"
  | "completed"
  | "completedCommunity"
  | "favourites";

export default function MobileMenu({
  open,
  onClose,
  isTrades,
  isAuthed,
  firstName,
  tradeCta,
  onLogout,
  onGoHome,
  onGoProjectsTab,
  onGoAccount,
  onPostJob,
}: {
  open: boolean;
  onClose: () => void;

  isTrades: boolean;
  isAuthed: boolean;

  firstName?: string | null;

  tradeCta?: { href: string; label: string; testid?: string } | null;

  onLogout: () => Promise<void> | void;
  onGoHome: () => void;
  onGoProjectsTab: (key: ProjectsTabKey) => void;
  onGoAccount: () => void;
  onPostJob: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // lock scroll while open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const safeFirstName = (firstName || "").trim();
  const greeting = safeFirstName ? `Hi ${safeFirstName},` : "Hi there,";

  // Shared typography for big menu actions
  const bigItemClass =
    "block w-full text-left text-[44px] leading-[1.05] font-light tracking-wide";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation menu"
      data-testid="mobile-menu"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />

      {/* Panel */}
      <div className="absolute inset-0 bg-slate-700 text-white">
        {/* Top bar */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
          <button
            type="button"
            onClick={() => {
              onGoHome();
              onClose();
            }}
            className="inline-flex items-center gap-2"
            aria-label="Go home"
            data-testid="mobile-menu-home"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <Home className="h-5 w-5 text-white" />
            </span>
            <span className="text-sm font-semibold tracking-wide">
              VetMyBuilder
            </span>
          </button>

          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15"
            data-testid="mobile-menu-close"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pt-10 pb-40">
          {/* Greeting */}
          {isAuthed && (
            <div
              className="mb-8 text-white/90 text-sm tracking-wide"
              data-testid="mobile-menu-greeting"
            >
              {greeting}
            </div>
          )}

          {/* Homeowner menu */}
          {isAuthed && !isTrades && (
            <>
              <nav aria-label="Projects navigation" className="space-y-5">
                <button
                  type="button"
                  onClick={() => {
                    onGoProjectsTab("mine");
                    onClose();
                  }}
                  className={`${bigItemClass} text-white`}
                  data-testid="mobile-menu-my-projects"
                >
                  My Projects
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onGoProjectsTab("completed");
                    onClose();
                  }}
                  className={`${bigItemClass} text-white/60 hover:text-white`}
                  data-testid="mobile-menu-completed"
                >
                  Completed
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onGoProjectsTab("completedCommunity");
                    onClose();
                  }}
                  className={`${bigItemClass} text-white/60 hover:text-white`}
                  data-testid="mobile-menu-community"
                >
                  Community
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onGoProjectsTab("favourites");
                    onClose();
                  }}
                  className={`${bigItemClass} text-white/60 hover:text-white`}
                  data-testid="mobile-menu-favourites"
                >
                  Favourites
                </button>
              </nav>

              <div className="my-10 h-px bg-white/10" />

              <button
                type="button"
                onClick={() => {
                  onGoAccount();
                  onClose();
                }}
                className={`${bigItemClass} text-white/60 hover:text-white`}
                data-testid="mobile-menu-account"
              >
                Account
              </button>
            </>
          )}

          {/* Guest menu */}
          {!isAuthed && (
            <nav aria-label="Guest navigation" className="space-y-5">
              <Link
                href="/login"
                onClick={onClose}
                className={`${bigItemClass} text-white`}
                data-testid="mobile-menu-sign-in"
              >
                Homeowner sign in
              </Link>

              <Link
                href="/tradesman/login"
                onClick={onClose}
                className={`${bigItemClass} text-white/60 hover:text-white`}
                data-testid="mobile-menu-trades-login"
              >
                Tradesperson
              </Link>
            </nav>
          )}

          {/* Trades menu */}
          {isAuthed && isTrades && (
            <nav aria-label="Trades navigation" className="space-y-5">
              {tradeCta?.href && (
                <Link
                  href={tradeCta.href}
                  onClick={onClose}
                  className={`${bigItemClass} text-white`}
                  data-testid={tradeCta.testid || "mobile-menu-trades-projects"}
                >
                  {tradeCta.label}
                </Link>
              )}

              <Link
                href="/tradesman/profile/edit"
                onClick={onClose}
                className={`${bigItemClass} text-white/60 hover:text-white`}
                data-testid="mobile-menu-trades-profile"
              >
                Manage profile
              </Link>
            </nav>
          )}
        </div>

        {/* Bottom actions: BIG like the menu items */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={async () => {
                onClose();
                await onLogout();
              }}
              className={[
                "px-6 py-6 text-left",
                "bg-rose-600 hover:bg-rose-500",
                "text-white",
              ].join(" ")}
              data-testid="mobile-menu-logout"
            >
              <span className="block text-[28px] leading-tight font-light tracking-wide">
                Logout
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onPostJob();
                onClose();
              }}
              className={[
                "px-6 py-6 text-left",
                "bg-amber-400 hover:bg-amber-300",
                "text-slate-900",
              ].join(" ")}
              data-testid="mobile-menu-post-job"
            >
              <span className="block text-[28px] leading-tight font-light tracking-wide">
                Post a Job
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
