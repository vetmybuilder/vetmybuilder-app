// web/components/TradesmanInboxDropdown.tsx
//
// Trade-side analogue of InboxDropdown. Two tabs:
//   - Messages: rows from /api/tradesman/matches (matched threads)
//   - Activity: rows from /api/notifications (recommendations,
//                match-formed, system events) - same endpoint as the
//                homeowner; the trade just sees the rows that target
//                their uid.
//
// Identical UX to the homeowner dropdown. Tapping a thread (Messages)
// or a chat-related activity item (Activity) opens the trade
// MessagingDock and pops the chat window via the shared `vmb:openDock`
// + `vmb:openChat` window events. Other activity types (recommendations
// etc.) navigate to their linkPath as before.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MessageSquare, Sparkles, Handshake, Bell, X } from "lucide-react";
import { useApi } from "@/utils/api";

type Tab = "messages" | "activity";

type LastMessage = {
  body: string | null;
  attachmentCount: number;
  senderUid: string | null;
  createdAt: string | null;
};

type MatchRow = {
  matchId: string;
  projectId: number;
  projectName: string;
  projectType: string;
  projectLocation: string;
  homeownerFirstName: string | null;
  source: "recommended" | "subscribed";
  matchedAt: string;
  lastMessage: LastMessage | null;
  unreadCount: number;
};

type NotificationRow = {
  id: number;
  type: string;
  message: string;
  projectId: number | null;
  linkPath: string | null;
  createdAt: string;
  readAt: string | null;
};

// Activity tab hides notification types that the Messages tab already
// represents (chat threads). Match-formed stays - tapping it opens the
// thread the same way the chat-message ones do.
const ACTIVITY_HIDDEN_TYPES = new Set<string>(["chat_message_new"]);

interface InboxState {
  matches: MatchRow[];
  notifications: NotificationRow[];
}
const cached: InboxState = { matches: [], notifications: [] };
const listeners = new Set<(s: InboxState) => void>();
function publish(next: Partial<InboxState>) {
  Object.assign(cached, next);
  listeners.forEach((l) => l({ ...cached }));
}

export function useTradesInboxUnread(enabled: boolean): {
  total: number;
  messagesUnread: number;
  activityUnread: number;
} {
  const api = useApi();
  const [state, setState] = useState<InboxState>(cached);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const [m, n] = await Promise.all([
        api.get<{ matches: MatchRow[] }>("/api/tradesman/matches"),
        api.get<{ items: NotificationRow[] }>("/api/notifications?limit=50"),
      ]);
      publish({
        matches: Array.isArray(m.data?.matches) ? m.data.matches : [],
        notifications: Array.isArray(n.data?.items) ? n.data.items : [],
      });
    } catch {
      /* leave previous cache */
    }
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [enabled, refetch]);

  // Refetch when SSE fires a notification - global dispatcher already
  // turns SSE into vmb:notification events.
  useEffect(() => {
    if (!enabled) return;
    function onNotif() {
      refetch();
    }
    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
  }, [enabled, refetch]);

  return useMemo(() => {
    const messagesUnread = state.matches.reduce(
      (s, m) => s + (m.unreadCount || 0),
      0,
    );
    const activityUnread = state.notifications.filter(
      (n) => !n.readAt && !ACTIVITY_HIDDEN_TYPES.has(n.type),
    ).length;
    return {
      messagesUnread,
      activityUnread,
      total: messagesUnread + activityUnread,
    };
  }, [state]);
}

export default function TradesmanInboxDropdown({
  onClose,
}: {
  onClose: () => void;
}) {
  const api = useApi();
  const router = useRouter();
  const [state, setState] = useState<InboxState>(cached);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const messagesUnread = state.matches.reduce(
    (sum, m) => sum + (m.unreadCount || 0),
    0,
  );
  const activity = state.notifications.filter(
    (n) => !ACTIVITY_HIDDEN_TYPES.has(n.type),
  );
  const activityUnread = activity.filter((n) => !n.readAt).length;

  const [tab, setTab] = useState<Tab>(() =>
    messagesUnread === 0 && activityUnread > 0 ? "activity" : "messages",
  );

  // Mark-all-read when user flips to Activity, optimistically.
  useEffect(() => {
    if (tab !== "activity") return;
    const unreadIds = activity.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;
    api.post("/api/notifications/read-all", {}).catch(() => {});
    publish({
      notifications: state.notifications.map((n) =>
        unreadIds.includes(n.id)
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div
      className="absolute right-0 top-12 z-50 w-[400px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      role="menu"
      aria-label="Inbox"
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="font-extrabold text-slate-900">Inbox</span>
        <Link
          href="/tradesman/matches"
          onClick={onClose}
          className="text-[12px] font-semibold text-emerald-700 hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="px-3 pt-3 pb-2">
        <div className="inline-flex rounded-full bg-amber-50 p-0.5 gap-0.5">
          <button
            onClick={() => setTab("messages")}
            className={`px-3 py-1.5 text-[12px] font-extrabold rounded-full ${
              tab === "messages"
                ? "bg-emerald-600 text-white"
                : "text-slate-700"
            }`}
          >
            Messages
            {messagesUnread > 0 && (
              <span
                className={`ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[10px] font-black px-1 ${
                  tab === "messages"
                    ? "bg-white text-emerald-700"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {messagesUnread > 99 ? "99+" : messagesUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("activity")}
            className={`px-3 py-1.5 text-[12px] font-extrabold rounded-full ${
              tab === "activity"
                ? "bg-emerald-600 text-white"
                : "text-slate-700"
            }`}
          >
            Activity
            {activityUnread > 0 && (
              <span
                className={`ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[10px] font-black px-1 ${
                  tab === "activity"
                    ? "bg-white text-emerald-700"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {activityUnread > 99 ? "99+" : activityUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Bulk action bar — Messages "Mark all as read", Activity
          "Clear all". Same affordances as the homeowner dropdown so
          the inbox feels like one product across both sides. */}
      {tab === "messages" && messagesUnread > 0 && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={async () => {
              publish({
                matches: state.matches.map((m) => ({ ...m, unreadCount: 0 })),
              });
              try {
                await api.post("/api/matches/read-all", {});
              } catch {
                /* best-effort */
              }
            }}
            className="text-[12px] font-bold text-emerald-700 hover:text-emerald-800"
            data-testid="inbox-mark-all-read"
          >
            Mark all as read
          </button>
        </div>
      )}
      {tab === "activity" && activity.length > 0 && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={async () => {
              publish({ notifications: [] });
              try {
                await api.post("/api/notifications/dismiss-all", {});
              } catch {
                /* best-effort */
              }
            }}
            className="text-[12px] font-bold text-emerald-700 hover:text-emerald-800"
            data-testid="inbox-clear-all"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        {tab === "messages" ? (
          <MessagesList
            matches={state.matches}
            onClose={onClose}
            router={router}
          />
        ) : (
          <ActivityList
            items={activity}
            onClose={onClose}
            router={router}
            onDismiss={(id) => {
              publish({
                notifications: state.notifications.filter((n) => n.id !== id),
              });
              api.delete(`/api/notifications/${id}`).catch(() => {
                /* best-effort */
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function MessagesList({
  matches,
  onClose,
  router,
}: {
  matches: MatchRow[];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (matches.length === 0) return <EmptyState kind="messages" />;
  return (
    <ul className="divide-y divide-slate-100">
      {matches.map((m) => {
        const unread = m.unreadCount > 0;
        const initial = (m.homeownerFirstName || m.projectName || "?")
          .charAt(0)
          .toUpperCase();
        const subtitle = m.projectName || "Project";
        const snippet =
          m.lastMessage?.body?.trim() ||
          (m.lastMessage?.attachmentCount
            ? `Sent ${m.lastMessage.attachmentCount} attachment${m.lastMessage.attachmentCount > 1 ? "s" : ""}`
            : "Say hi to get the conversation started.");
        return (
          <li key={m.matchId}>
            <button
              onClick={() => {
                onClose();
                openTradesChat(router, Number(m.matchId));
              }}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-amber-50/60 transition-colors"
            >
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-[13px] font-black"
                style={{
                  background: "linear-gradient(135deg,#10b981,#047857)",
                }}
                aria-hidden
              >
                {initial}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[13px] truncate ${unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}
                  >
                    {m.homeownerFirstName || "Homeowner"}
                    <span className="font-normal text-slate-400">
                      {" "}
                      · {subtitle}
                    </span>
                  </span>
                  <RelativeTime iso={m.lastMessage?.createdAt} />
                </div>
                <p
                  className={`mt-0.5 text-[12px] truncate ${unread ? "text-slate-900 font-bold" : "text-slate-500"}`}
                >
                  {snippet}
                </p>
              </div>
              {unread && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-emerald-600 text-white text-[10px] font-black px-1 shrink-0 mt-0.5">
                  {m.unreadCount}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityList({
  items,
  onClose,
  router,
  onDismiss,
}: {
  items: NotificationRow[];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
  onDismiss: (id: number) => void;
}) {
  if (items.length === 0) return <EmptyState kind="activity" />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const meta = activityIconFor(n.type);
        const Icon = meta.icon;
        const href = n.linkPath || "#";
        // Chat / match linkPaths route to the dock instead of the
        // standalone /chat or /match page - same pattern as the
        // homeowner dropdown.
        const matchIdFromLink = (() => {
          const m = String(n.linkPath || "").match(
            /\/(?:chat|match)\/(\d+)/,
          );
          return m ? Number(m[1]) : null;
        })();
        const interceptToDock = matchIdFromLink != null;
        // Grant funnel notifications are a companion experience -
        // open in a new tab so the user keeps their VMB session in place.
        const openInNewTab = n.type === "grant_opportunity";
        return (
          <li
            key={n.id}
            className="group relative flex items-stretch hover:bg-amber-50/60 transition-colors"
            data-testid={`inbox-activity-row-${n.id}`}
          >
            <Link
              href={href}
              {...(openInNewTab
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              onClick={(e) => {
                if (interceptToDock) {
                  e.preventDefault();
                  openTradesChat(router, matchIdFromLink as number);
                }
                onClose();
              }}
              className="flex-1 min-w-0 text-left px-4 py-3 flex items-start gap-3"
            >
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}
              >
                <Icon className={`h-4 w-4 ${meta.fg}`} />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[13px] leading-snug ${!n.readAt ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}
                >
                  {n.message}
                </p>
                <RelativeTime
                  iso={n.createdAt}
                  className="block mt-0.5 text-[11px] text-slate-400"
                />
              </div>
              {!n.readAt && (
                <span className="h-2 w-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
              )}
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss(n.id);
              }}
              aria-label="Dismiss notification"
              data-testid={`inbox-activity-dismiss-${n.id}`}
              className="shrink-0 self-start mt-3 mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Open a chat in the bottom-right TradesmanMessagingDock by dispatching
 * the same `vmb:openChat` event the dock listens for. The dock is global
 * so no navigation is required - the chat window pops over whatever
 * page the trade is on.
 */
function openTradesChat(
  _router: ReturnType<typeof useRouter>,
  matchId: number,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("vmb:openDock"));
  window.dispatchEvent(
    new CustomEvent("vmb:openChat", { detail: { matchId } }),
  );
}

function activityIconFor(type: string): {
  icon: typeof Sparkles;
  bg: string;
  fg: string;
} {
  if (type.startsWith("recommendation"))
    return { icon: Sparkles, bg: "bg-amber-50", fg: "text-amber-600" };
  if (type === "match_formed")
    return { icon: Handshake, bg: "bg-emerald-50", fg: "text-emerald-600" };
  return { icon: Bell, bg: "bg-slate-100", fg: "text-slate-600" };
}

function EmptyState({ kind }: { kind: "messages" | "activity" }) {
  return (
    <div className="px-6 py-10 text-center text-[13px] text-slate-500">
      <MessageSquare className="mx-auto h-7 w-7 text-slate-300 mb-2" />
      {kind === "messages"
        ? "No conversations yet. When a homeowner picks you and you reply, the thread shows up here."
        : "No activity yet. New jobs, recommendations and match alerts will appear here."}
    </div>
  );
}

function RelativeTime({
  iso,
  className = "text-[11px] text-slate-400 shrink-0",
}: {
  iso?: string | null;
  className?: string;
}) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const now = Date.now();
  const diffSec = Math.max(1, Math.floor((now - d.getTime()) / 1000));
  let label: string;
  if (diffSec < 60) label = `${diffSec}s`;
  else if (diffSec < 3600) label = `${Math.floor(diffSec / 60)}m`;
  else if (diffSec < 86400) label = `${Math.floor(diffSec / 3600)}h`;
  else label = `${Math.floor(diffSec / 86400)}d`;
  return <span className={className}>{label}</span>;
}
