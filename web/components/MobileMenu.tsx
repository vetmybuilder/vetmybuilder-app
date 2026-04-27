import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  User,
  Wrench,
  X,
  FolderKanban,
  CheckCircle2,
  Handshake,
  Heart,
  LogOut,
  PlusSquare,
  Sparkles,
  Inbox,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

type ProjectsTabKey =
  | "mine"
  | "completed"
  | "completedCommunity"
  | "favourites";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif";

type IconComponent = React.ComponentType<{ className?: string }>;

function IconTile({
  Icon,
  active,
}: {
  Icon: IconComponent;
  active?: boolean;
}) {
  return (
    <span
      className={[
        "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
        active ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600",
      ].join(" ")}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

function CountPill({ count }: { count: number }) {
  return (
    <span className="ml-auto bg-indigo-600 text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
      {count}
    </span>
  );
}

function Chevron() {
  return <ChevronRight className="ml-auto h-5 w-5 text-gray-400" />;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-400 px-5 pt-4 pb-2">
      {children}
    </div>
  );
}

function Separator() {
  return <div className="h-px bg-gray-100 mx-5 my-3" />;
}

const ROW_BASE =
  "flex items-center gap-4 p-4 mx-3 mb-1 rounded-2xl w-[calc(100%-1.5rem)] text-left text-[16px] font-bold tracking-tight";

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
  inboxUnreadCount,
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

  inboxUnreadCount?: number;
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
  const avatarLetter = safeFirstName
    ? safeFirstName.charAt(0).toUpperCase()
    : "?";

  const safeAreaStyle: React.CSSProperties = {
    paddingTop: "env(safe-area-inset-top)",
    paddingRight: "env(safe-area-inset-right)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingLeft: "env(safe-area-inset-left)",
    fontFamily: FONT_STACK,
  };

  const hasInboxCount =
    typeof inboxUnreadCount === "number" && inboxUnreadCount > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] md:hidden w-screen h-[100dvh] bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation menu"
      data-testid="mobile-menu"
      style={{ fontFamily: FONT_STACK }}
    >
      <div
        className="absolute inset-0 flex flex-col w-screen h-[100dvh] bg-white"
        style={safeAreaStyle}
      >
        {/* Top bar — wordmark + close */}
        <div className="h-14 px-5 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              onGoHome();
              onClose();
            }}
            className="inline-flex items-center"
            aria-label="Go home"
            data-testid="mobile-menu-home"
          >
            <span className="text-lg font-black tracking-tight">
              <span className="text-black">Vet</span>
              <span className="text-indigo-600">My</span>
              <span className="text-black">Builder</span>
            </span>
          </button>

          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            data-testid="mobile-menu-close"
          >
            <X className="h-5 w-5 text-gray-700" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {isAuthed && (
            <div
              className="mx-5 mb-6 p-5 bg-indigo-50/60 border border-indigo-100 rounded-[22px] flex items-center"
              style={{ gap: "14px" }}
              data-testid="mobile-menu-greeting"
            >
              <div className="w-[54px] h-[54px] rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-[22px] leading-none">
                  {avatarLetter}
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[17px] font-extrabold tracking-tight text-gray-900 truncate">
                  {greeting}
                </span>
                <span className="text-[13px] text-gray-500">
                  {isTrades ? "Tradesperson" : "Homeowner"}
                </span>
              </div>
            </div>
          )}

          {/* Homeowner nav */}
          {isAuthed && !isTrades && (
            <nav aria-label="Projects navigation" className="flex flex-col">
              <SectionHeading>Projects</SectionHeading>

              <button
                type="button"
                onClick={() => {
                  onGoProjectsTab("mine");
                  onClose();
                }}
                className={`${ROW_BASE} bg-indigo-50 text-gray-900`}
                data-testid="mobile-menu-my-projects"
              >
                <IconTile Icon={FolderKanban} active />
                <span>My projects</span>
                <Chevron />
              </button>

              <button
                type="button"
                onClick={() => {
                  onGoProjectsTab("completed");
                  onClose();
                }}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-completed"
              >
                <IconTile Icon={CheckCircle2} />
                <span>Completed</span>
                <Chevron />
              </button>

              <Separator />

              <SectionHeading>Connections</SectionHeading>

              <Link
                href="/matches"
                onClick={onClose}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-matches"
              >
                <IconTile Icon={Handshake} />
                <span>Matches</span>
                <Chevron />
              </Link>

              <Link
                href="/inbox"
                onClick={onClose}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-inbox"
              >
                <IconTile Icon={Inbox} />
                <span>Inbox</span>
                {hasInboxCount ? (
                  <CountPill count={inboxUnreadCount as number} />
                ) : (
                  <Chevron />
                )}
              </Link>

              <Separator />

              <SectionHeading>Saved</SectionHeading>

              <button
                type="button"
                onClick={() => {
                  onGoProjectsTab("favourites");
                  onClose();
                }}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-favourites"
              >
                <IconTile Icon={Heart} />
                <span>Favourites</span>
                <Chevron />
              </button>

              <Separator />

              <SectionHeading>Account</SectionHeading>

              <button
                type="button"
                onClick={() => {
                  onGoAccount();
                  onClose();
                }}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-account"
              >
                <IconTile Icon={User} />
                <span>Account</span>
                <Chevron />
              </button>

              <Link
                href="/feedback"
                onClick={onClose}
                className={`${ROW_BASE} text-gray-900`}
              >
                <IconTile Icon={MessageSquare} />
                <span>Feedback</span>
                <Chevron />
              </Link>
            </nav>
          )}

          {/* Tradesperson nav */}
          {isAuthed && isTrades && (
            <nav aria-label="Trades navigation" className="flex flex-col">
              <SectionHeading>Work</SectionHeading>

              {tradeCta?.href && (
                <Link
                  href={tradeCta.href}
                  onClick={onClose}
                  className={`${ROW_BASE} bg-indigo-50 text-gray-900`}
                  data-testid={tradeCta.testid || "mobile-menu-trades-projects"}
                >
                  <IconTile Icon={Wrench} active />
                  <span>{tradeCta.label}</span>
                  <Chevron />
                </Link>
              )}

              <Link
                href="/tradesman/matches"
                onClick={onClose}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-trades-matches"
              >
                <IconTile Icon={Sparkles} />
                <span>Matches</span>
                <Chevron />
              </Link>

              <Separator />

              <SectionHeading>Account</SectionHeading>

              <Link
                href="/tradesman/profile/edit"
                onClick={onClose}
                className={`${ROW_BASE} text-gray-900`}
                data-testid="mobile-menu-trades-profile"
              >
                <IconTile Icon={User} />
                <span>Manage profile</span>
                <Chevron />
              </Link>
            </nav>
          )}

          {/* Guest hero */}
          {!isAuthed && (
            <div className="flex flex-col items-center justify-center text-center flex-1 px-6">
              <p className="text-slate-800 text-xl font-light italic leading-relaxed max-w-sm tracking-wide">
                Find a tradesperson you can trust, recommended by friends and
                backed by real local reviews.
              </p>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="sticky bottom-0 left-0 right-0 shrink-0">
          <div
            className={`grid ${
              isAuthed && isTrades ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {isAuthed ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    onClose();
                    await onLogout();
                  }}
                  className={[
                    "px-6 py-5 text-left flex items-center gap-3",
                    "bg-gray-900 hover:bg-gray-800",
                    "text-white",
                  ].join(" ")}
                  data-testid="mobile-menu-logout"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="block text-[18px] leading-tight font-bold">
                    Sign out
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
                      "px-6 py-5 text-left flex items-center gap-3",
                      "bg-indigo-600 hover:bg-indigo-500",
                      "text-white",
                    ].join(" ")}
                    data-testid="mobile-menu-post-job"
                  >
                    <PlusSquare className="h-5 w-5" />
                    <span className="block text-[18px] leading-tight font-bold">
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
                    "px-6 py-5 flex items-center justify-center gap-3",
                    "bg-indigo-600 hover:bg-indigo-500",
                    "text-white",
                  ].join(" ")}
                  data-testid="mobile-menu-sign-in-cta"
                >
                  <User
                    className="h-6 w-6 flex-shrink-0"
                    strokeWidth={2.5}
                  />
                  <span className="block text-[18px] leading-tight font-bold">
                    Homeowner
                  </span>
                </Link>

                <Link
                  href="/tradesman/login"
                  onClick={onClose}
                  className={[
                    "px-6 py-5 flex items-center justify-center gap-3",
                    "bg-emerald-600 hover:bg-emerald-500",
                    "text-white",
                  ].join(" ")}
                  data-testid="mobile-menu-trades-cta"
                >
                  <Wrench
                    className="h-6 w-6 flex-shrink-0"
                    strokeWidth={2.5}
                  />
                  <span className="block text-[18px] leading-tight font-bold">
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
