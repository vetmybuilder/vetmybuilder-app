import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Home,
  User,
  Wrench,
  X,
  FolderKanban,
  CheckCircle2,
  Users,
  Heart,
  LogOut,
  PlusSquare,
} from "lucide-react";

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
  const greeting = safeFirstName
    ? `Welcome back ${safeFirstName},`
    : "Hi there,";

  const bigItemClass =
    "block w-full text-left text-[44px] leading-[1.05] font-light tracking-wide";

  const rowClass = "inline-flex items-center gap-3 w-full align-middle";

  const iconClass = (muted?: boolean) =>
    `h-6 w-6 ${muted ? "text-white/60" : "text-white"}`;

  const safeAreaStyle: React.CSSProperties = {
    paddingTop: "env(safe-area-inset-top)",
    paddingRight: "env(safe-area-inset-right)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingLeft: "env(safe-area-inset-left)",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] md:hidden w-screen h-[100dvh]"
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
        className="absolute inset-0 bg-slate-900/40 w-screen h-[100dvh]"
      />

      {/* Panel */}
      <div
        className="absolute inset-0 text-white flex flex-col w-screen h-[100dvh]"
        style={safeAreaStyle}
      >
        {/* Builder background below header */}
        <div className="absolute inset-0 top-14">
          <img
            src="https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&q=80&auto=format"
            alt=""
            className="h-full w-full object-cover object-top"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-slate-900/70" />
        </div>

        {/* Top bar — solid dark background */}
        <div className="relative z-10 h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0 bg-slate-700">
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
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500">
              <Home className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-black tracking-tight">
              <span className="text-white">Vet</span>
              <span className="text-red-400">My</span>
              <span className="text-white">Builder</span>
            </span>
          </button>

          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
            data-testid="mobile-menu-close"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-10 pb-6 flex flex-col">
          {isAuthed && (
            <div
              className="mb-8 text-white/90 text-sm tracking-wide"
              data-testid="mobile-menu-greeting"
            >
              {greeting}
            </div>
          )}

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
                  <span className={rowClass}>
                    <FolderKanban className={iconClass(false)} />
                    <span>My Jobs</span>
                  </span>
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
                  <span className={rowClass}>
                    <CheckCircle2 className={iconClass(true)} />
                    <span>Completed</span>
                  </span>
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
                  <span className={rowClass}>
                    <Users className={iconClass(true)} />
                    <span>Community</span>
                  </span>
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
                  <span className={rowClass}>
                    <Heart className={iconClass(true)} />
                    <span>Favourites</span>
                  </span>
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
                <span className={rowClass}>
                  <User className={iconClass(true)} />
                  <span>Account</span>
                </span>
              </button>
            </>
          )}

          {/* Guest welcome */}
          {!isAuthed && (
            <div className="flex flex-col items-center justify-center text-center flex-1 px-6">
              <p className="text-white text-2xl font-light italic leading-relaxed max-w-sm drop-shadow-lg tracking-wide">
                Find a tradesperson you can trust, recommended by friends and backed by real local reviews.
              </p>
            </div>
          )}

          {isAuthed && isTrades && (
            <nav aria-label="Trades navigation" className="space-y-5">
              {tradeCta?.href && (
                <Link
                  href={tradeCta.href}
                  onClick={onClose}
                  className={`${bigItemClass} text-white`}
                  data-testid={tradeCta.testid || "mobile-menu-trades-projects"}
                >
                  <span className={rowClass}>
                    <Wrench className={iconClass(false)} />
                    <span>{tradeCta.label}</span>
                  </span>
                </Link>
              )}

              <Link
                href="/tradesman/profile/edit"
                onClick={onClose}
                className={`${bigItemClass} text-white/60 hover:text-white`}
                data-testid="mobile-menu-trades-profile"
              >
                <span className={rowClass}>
                  <User className={iconClass(true)} />
                  <span>Manage profile</span>
                </span>
              </Link>
            </nav>
          )}
        </div>

        {/* Bottom actions */}
        <div className="relative z-10 sticky bottom-0 left-0 right-0 border-t border-white/10 shrink-0">
          <div className={`grid ${isAuthed && isTrades ? "grid-cols-1" : "grid-cols-2"}`}>
            {isAuthed ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    onClose();
                    await onLogout();
                  }}
                  className={[
                    "px-6 py-6 text-left flex items-center gap-3",
                    "bg-rose-600 hover:bg-rose-500",
                    "text-white",
                  ].join(" ")}
                  data-testid="mobile-menu-logout"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="block text-[22px] leading-tight font-medium">
                    Logout
                  </span>
                </button>

                {!isTrades && (
                  <button
                    type="button"
                    onClick={() => {
                      onPostJob();
                      onClose();
                    }}
                    className={[
                      "px-6 py-6 text-left flex items-center gap-3",
                      "bg-amber-400 hover:bg-amber-300",
                      "text-slate-900",
                    ].join(" ")}
                    data-testid="mobile-menu-post-job"
                  >
                    <PlusSquare className="h-5 w-5" />
                    <span className="block text-[22px] leading-tight font-medium">
                      Post a Job
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={onClose}
                  className={[
                    "px-6 py-6 flex items-center justify-center gap-3",
                    "bg-indigo-600 hover:bg-indigo-500",
                    "text-white",
                  ].join(" ")}
                  data-testid="mobile-menu-sign-in-cta"
                >
                  <User className="h-6 w-6 flex-shrink-0" strokeWidth={2.5} />
                  <span className="block text-[20px] leading-tight font-medium">
                    Homeowner
                  </span>
                </Link>

                <Link
                  href="/tradesman/login"
                  onClick={onClose}
                  className={[
                    "px-6 py-6 flex items-center justify-center gap-3",
                    "bg-emerald-600 hover:bg-emerald-500",
                    "text-white",
                  ].join(" ")}
                  data-testid="mobile-menu-trades-cta"
                >
                  <Wrench className="h-6 w-6 flex-shrink-0" strokeWidth={2.5} />
                  <span className="block text-[20px] leading-tight font-medium">
                    Tradesperson
                  </span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
