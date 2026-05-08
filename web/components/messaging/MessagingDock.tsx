// web/components/messaging/MessagingDock.tsx
//
// LinkedIn-style messaging dock for the homeowner project detail page.
// - Collapsed: small pill at bottom-right showing "Chats on this job" + unread badge
// - Expanded: pill grows UP into a 320x500 inbox panel listing the
//   matches *for this project only*
// - Click a row: opens a ChatWindow floating to the LEFT of the dock
// - Multiple ChatWindows stack horizontally, dock stays anchored right
//
// Project-scoped: the underlying /api/matches call returns matches across
// all projects, but the dock filters to the current project (router
// query id). The header inbox icon is the global view; the dock is the
// contextual quick-access for the project the user is currently viewing.
// Hidden entirely when there are no matches for this project.
//
// Mobile is hidden entirely (`hidden md:block`); mobile uses the
// existing /matches list + /chat/:id full-page view.

import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import { useSseEvent } from "@/utils/useSseEvent";
import ChatWindow from "./ChatWindow";

const DOCK_WIDTH = 320;
const WINDOW_WIDTH = 320;
const WINDOW_GAP = 12;
const RIGHT_EDGE = 24;

interface LastMessage {
  body: string | null;
  attachmentCount: number;
  senderUid: string | null;
  createdAt: string | null;
}

interface MatchRow {
  matchId: string;
  projectId: string;
  projectTitle: string;
  builderUid: string;
  companyName: string;
  photoUrl: string | null;
  lastMessage: LastMessage | null;
  unreadCount: number;
  status: string;
}

function formatRowTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function lastMessagePreview(lm: LastMessage | null): string {
  if (!lm) return "Say hi to start chatting";
  if (lm.body && lm.body.trim()) return lm.body;
  if (lm.attachmentCount > 0)
    return `${lm.attachmentCount} photo${lm.attachmentCount === 1 ? "" : "s"}`;
  return "...";
}

export default function MessagingDock() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [openWindows, setOpenWindows] = useState<number[]>([]);
  const [minimized, setMinimized] = useState<Set<number>>(new Set());

  // Hide on mobile-sized auth pages and the chat page itself - those have
  // their own dedicated chrome and don't need a floating dock on top.
  const HIDE_ON_PATHS = useMemo(
    () =>
      new Set<string>([
        "/login",
        "/signup",
        "/auth/complete",
        "/tradesman/login",
        "/chat/[matchId]",
        "/match/[matchId]",
      ]),
    [],
  );
  const hidden = HIDE_ON_PATHS.has(router.pathname);

  // Fetch the cross-project matches list. Matches the existing
  // /matches page payload shape.
  useEffect(() => {
    if (authLoading || !user || hidden) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<{ matches: MatchRow[] }>("/api/matches");
        if (!cancelled) {
          setMatches(Array.isArray(res.data?.matches) ? res.data.matches : []);
        }
      } catch {
        if (!cancelled) setMatches([]);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [authLoading, user, api, hidden]);

  // New chat message arrived for one of our matches: refetch so the
  // preview line updates and the unread badge counts up.
  useSseEvent<{ matchId: number }>("chat_message", () => {
    api
      .get<{ matches: MatchRow[] }>("/api/matches")
      .then((res) => {
        if (Array.isArray(res.data?.matches)) setMatches(res.data.matches);
      })
      .catch(() => {});
  });

  // External components (e.g. /projects/[id] swipe deck on a fresh
  // match) can ask the dock to pop a chat window open by dispatching a
  // `vmb:openChat` window event.
  useEffect(() => {
    function onExternalOpen(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const id = Number(detail.matchId);
      if (Number.isFinite(id) && id > 0) openChat(id);
    }
    // Site header dispatches `vmb:openDock` when the user taps the
    // messages icon, so the dock springs open without a second tap.
    function onOpenDock() {
      setOpen(true);
    }
    window.addEventListener("vmb:openChat", onExternalOpen);
    window.addEventListener("vmb:openDock", onOpenDock);
    return () => {
      window.removeEventListener("vmb:openChat", onExternalOpen);
      window.removeEventListener("vmb:openDock", onOpenDock);
    };
    // openChat closes over setOpenWindows / setMinimized which are
    // stable; we don't want this effect to re-bind on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Self-handle the ?openChat=<matchId> hand-off. The /projects/[id]
  // page also dispatches a vmb:openChat event for this, but on cross-
  // page navigations (e.g. from /projects -> /projects/6) the dock
  // mounts AFTER the page's effect has fired, so the event is missed.
  // Watching the URL ourselves is race-free.
  useEffect(() => {
    const raw = router.query?.openChat;
    const v = Array.isArray(raw) ? raw[0] : raw;
    const matchId = Number(v);
    if (!Number.isFinite(matchId) || matchId <= 0) return;
    openChat(matchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query?.openChat]);

  function openChat(matchId: number) {
    setOpenWindows((prev) =>
      prev.includes(matchId) ? prev : [matchId, ...prev].slice(0, 3),
    );
    setMinimized((prev) => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });
    setOpen(false);
  }

  function closeChat(matchId: number) {
    setOpenWindows((prev) => prev.filter((id) => id !== matchId));
    setMinimized((prev) => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });
  }

  function toggleMinimize(matchId: number) {
    setMinimized((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }

  // Project the dock is contextually scoped to. _app.tsx only mounts the
  // dock on /projects/[id], so router.query.id is always present here -
  // but we coerce defensively in case the route ever changes.
  const currentProjectId = useMemo(() => {
    const raw = router.query?.id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [router.query?.id]);

  // Sort: unread first, then most recent message. Filter to ACTIONABLE
  // statuses AND to the current project only - the global inbox up in
  // the header is what shows everything across projects.
  const sortedMatches = useMemo(() => {
    return [...matches]
      .filter((m) => m.status === "matched" || m.status === "contacted")
      .filter(
        (m) =>
          currentProjectId == null ||
          Number(m.projectId) === currentProjectId,
      )
      .sort((a, b) => {
        const aUnread = a.unreadCount > 0 ? 0 : 1;
        const bUnread = b.unreadCount > 0 ? 0 : 1;
        if (aUnread !== bUnread) return aUnread - bUnread;
        const at = a.lastMessage?.createdAt
          ? Date.parse(a.lastMessage.createdAt)
          : 0;
        const bt = b.lastMessage?.createdAt
          ? Date.parse(b.lastMessage.createdAt)
          : 0;
        return bt - at;
      });
  }, [matches, currentProjectId]);

  const totalUnread = sortedMatches.reduce(
    (sum, m) => sum + (m.unreadCount || 0),
    0,
  );

  // Project title pulled from the first match for this project. Falls
  // back to a generic label if we can't read it from a row.
  const projectTitle =
    sortedMatches.find((m) => m.projectTitle)?.projectTitle || "this job";

  // Hide entirely when there's nothing to show. The global inbox in the
  // header is still available for everything else.
  if (hidden || authLoading || !user) return null;
  if (sortedMatches.length === 0 && openWindows.length === 0) return null;

  return (
    <>
      {/* Floating chat windows - stacked left of the dock */}
      {openWindows.map((matchId, i) => {
        const offset =
          RIGHT_EDGE + DOCK_WIDTH + WINDOW_GAP + i * (WINDOW_WIDTH + WINDOW_GAP);
        return (
          <ChatWindow
            key={matchId}
            matchId={matchId}
            rightOffset={offset}
            onClose={() => closeChat(matchId)}
            onMinimize={() => toggleMinimize(matchId)}
            minimized={minimized.has(matchId)}
          />
        );
      })}

      {/* Dock - either collapsed pill or expanded list */}
      <div
        className="fixed bottom-0 z-40 hidden md:block"
        style={{ right: `${RIGHT_EDGE}px`, width: `${DOCK_WIDTH}px` }}
      >
        {open ? (
          <div className="bg-white border border-amber-100 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col" style={{ height: "500px" }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-3 flex items-center justify-between text-white shrink-0"
              style={{ backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
            >
              <span
                className="text-[14px] font-extrabold tracking-tight truncate max-w-[220px]"
                style={{ fontFamily: "'Sora', sans-serif" }}
                title={`Chats - ${projectTitle}`}
              >
                Chats - {projectTitle}
                {totalUnread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-indigo-700 text-[10px] font-black">
                    {totalUnread}
                  </span>
                )}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <div className="flex-1 overflow-y-auto">
              {sortedMatches.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-xl">
                    {"\u{1F4AC}"}
                  </div>
                  <p className="mt-3 text-[12.5px] text-slate-500 leading-relaxed">
                    No conversations yet. Match with a tradesperson to start chatting.
                  </p>
                </div>
              ) : (
                sortedMatches.map((row) => {
                  const matchIdNum = Number(row.matchId);
                  const initial = (row.companyName || "?").charAt(0).toUpperCase();
                  const preview = lastMessagePreview(row.lastMessage);
                  const time = formatRowTime(row.lastMessage?.createdAt || null);
                  const hasUnread = row.unreadCount > 0;
                  return (
                    <button
                      key={row.matchId}
                      type="button"
                      onClick={() => openChat(matchIdNum)}
                      className={`w-full px-4 py-3 flex items-start gap-3 text-left border-b border-amber-100 hover:bg-indigo-50/40 transition-colors ${
                        hasUnread ? "bg-indigo-50/30" : ""
                      }`}
                    >
                      {row.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.photoUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[13px] font-black shrink-0">
                          {initial}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-extrabold text-slate-900 truncate">
                            {row.companyName}
                          </div>
                          <div className="text-[10.5px] text-slate-400 shrink-0">
                            {time}
                          </div>
                        </div>
                        <div className="text-[10.5px] text-indigo-700 font-bold truncate">
                          {row.projectTitle}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div
                            className={`text-[12px] truncate ${
                              hasUnread ? "text-slate-900 font-bold" : "text-slate-500"
                            }`}
                          >
                            {preview}
                          </div>
                          {hasUnread && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-black shrink-0">
                              {row.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full px-4 py-3 flex items-center justify-between text-white rounded-t-2xl shadow-2xl hover:brightness-110 transition"
            style={{ backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
            aria-label="Open messaging"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span
                className="text-[14px] font-extrabold tracking-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Chats on this job
              </span>
              {totalUnread > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-indigo-700 text-[10px] font-black">
                  {totalUnread}
                </span>
              )}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}
