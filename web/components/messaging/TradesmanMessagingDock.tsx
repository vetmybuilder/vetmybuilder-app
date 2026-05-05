// web/components/messaging/TradesmanMessagingDock.tsx
//
// Bottom-right floating chat dock for tradesmen. Forked from the
// homeowner MessagingDock with two structural changes:
//
//   1. Data source is /api/tradesman/matches (returns lastMessage +
//      unreadCount alongside metadata).
//   2. Not project-scoped. Tradesmen don't have a "currently viewing
//      this project" context - the dock shows EVERY active match across
//      every job they've matched with.
//
// Header label is "Your chats" rather than the homeowner's
// "Chats - {projectTitle}". Avatar = source-tinted square with the
// project's first letter (homeowner identity is hidden by design).
//
// Floating chat windows reuse the shared ChatWindow - the chat
// transport is bidirectional and already role-aware.

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
  projectId: number;
  projectName: string;
  projectType: string;
  projectLocation: string;
  source: "recommended" | "subscribed";
  matchedAt: string;
  lastMessage: LastMessage | null;
  unreadCount: number;
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

export default function TradesmanMessagingDock() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [openWindows, setOpenWindows] = useState<number[]>([]);
  const [minimized, setMinimized] = useState<Set<number>>(new Set());
  // Suppressed when a fullscreen overlay (SwipePayGate, etc.) opens.
  // Listens for `vmb:fullscreen-modal` window events with `{open: bool}`
  // so the dock doesn't peek through paid-flow modals.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    function onModal(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      setOverlayOpen(Boolean(detail.open));
    }
    window.addEventListener("vmb:fullscreen-modal", onModal);
    return () => window.removeEventListener("vmb:fullscreen-modal", onModal);
  }, []);

  // Hide on full-screen experiences that own their own chrome.
  const HIDE_ON_PATHS = useMemo(
    () =>
      new Set<string>([
        "/login",
        "/signup",
        "/auth/complete",
        "/tradesman/login",
        "/tradesman/signup",
        "/tradesman/signup/complete",
        "/tradesman/register-tradesmen",
        "/chat/[matchId]",
        "/match/[matchId]",
      ]),
    [],
  );
  const hidden = HIDE_ON_PATHS.has(router.pathname);

  // Initial fetch + 30s polling refresh. The SSE listener below catches
  // most updates faster but the poll is a fallback for tabs that lose
  // their event source.
  useEffect(() => {
    if (authLoading || !user || hidden) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<{ matches: MatchRow[] }>(
          "/api/tradesman/matches",
        );
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

  useSseEvent<{ matchId: number }>("chat_message", () => {
    api
      .get<{ matches: MatchRow[] }>("/api/tradesman/matches")
      .then((res) => {
        if (Array.isArray(res.data?.matches)) setMatches(res.data.matches);
      })
      .catch(() => {});
  });

  // External components (e.g. the trade-side inbox dropdown) can ask the
  // dock to pop a chat window open by dispatching a `vmb:openChat`
  // window event with `{ matchId }`.
  useEffect(() => {
    function onExternalOpen(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const id = Number(detail.matchId);
      if (Number.isFinite(id) && id > 0) openChat(id);
    }
    window.addEventListener("vmb:openChat", onExternalOpen);
    return () => window.removeEventListener("vmb:openChat", onExternalOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Sort: unread first, then most recent message. NOT filtered by
  // current project - tradesmen see every active conversation.
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
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
  }, [matches]);

  const totalUnread = sortedMatches.reduce(
    (sum, m) => sum + (m.unreadCount || 0),
    0,
  );

  if (hidden || authLoading || !user) return null;
  if (overlayOpen) return null;
  if (sortedMatches.length === 0 && openWindows.length === 0) return null;

  return (
    <>
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

      <div
        className="fixed bottom-0 z-40 hidden md:block"
        style={{ right: `${RIGHT_EDGE}px`, width: `${DOCK_WIDTH}px` }}
        data-testid="trades-messaging-dock"
      >
        {open ? (
          <div
            className="bg-white border border-amber-100 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ height: "500px" }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-3 flex items-center justify-between text-white shrink-0"
              style={{ backgroundImage: "linear-gradient(135deg, #10b981, #059669)" }}
            >
              <span
                className="text-[14px] font-extrabold tracking-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Your chats
                {totalUnread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-emerald-700 text-[10px] font-black">
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
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-xl">
                    {"\u{1F4AC}"}
                  </div>
                  <p className="mt-3 text-[12.5px] text-slate-500 leading-relaxed">
                    No conversations yet. Match with a homeowner to start chatting.
                  </p>
                </div>
              ) : (
                sortedMatches.map((row) => {
                  const matchIdNum = Number(row.matchId);
                  const initial = (row.projectName || "?").charAt(0).toUpperCase();
                  const preview = lastMessagePreview(row.lastMessage);
                  const time = formatRowTime(row.lastMessage?.createdAt || null);
                  const hasUnread = row.unreadCount > 0;
                  const grad =
                    row.source === "recommended"
                      ? "linear-gradient(135deg,#fcd34d,#f59e0b)"
                      : "linear-gradient(135deg,#6ee7b7,#10b981)";
                  return (
                    <button
                      key={row.matchId}
                      type="button"
                      onClick={() => openChat(matchIdNum)}
                      className={`w-full px-4 py-3 flex items-start gap-3 text-left border-b border-amber-100 hover:bg-emerald-50/40 transition-colors ${
                        hasUnread ? "bg-emerald-50/30" : ""
                      }`}
                      data-testid={`trades-dock-row-${row.matchId}`}
                    >
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-black shrink-0"
                        style={{ background: grad }}
                        aria-hidden
                      >
                        {initial}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-extrabold text-slate-900 truncate">
                            {row.projectName}
                          </div>
                          <div className="text-[10.5px] text-slate-400 shrink-0">
                            {time}
                          </div>
                        </div>
                        <div className="text-[10.5px] text-emerald-700 font-bold truncate">
                          {[row.projectType, row.projectLocation]
                            .filter(Boolean)
                            .join(" · ")}
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
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-black shrink-0">
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
            style={{ backgroundImage: "linear-gradient(135deg, #10b981, #059669)" }}
            aria-label="Open messaging"
            data-testid="trades-dock-collapsed"
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span
                className="text-[14px] font-extrabold tracking-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Your chats
              </span>
              {totalUnread > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-emerald-700 text-[10px] font-black">
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
