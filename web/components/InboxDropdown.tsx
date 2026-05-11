// web/components/InboxDropdown.tsx
//
// Combined "Inbox" dropdown rendered from the SiteHeader. Two tabs:
//   - Messages: rows pulled from /api/matches (chats across all projects)
//   - Activity: rows pulled from /api/notifications (recommendations,
//                match-formed, system events, etc.)
//
// One header badge - sum of unread across both tabs - is exposed via the
// useInboxUnread() hook so SiteHeader can render the dot from the same
// source of truth that powers the dropdown body.
//
// Live updates: listens to the global `vmb:notification` CustomEvent
// (dispatched by GlobalSseDispatcher) and refetches the affected tab.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MessageSquare, Sparkles, Handshake, Bell } from "lucide-react";
import { useApi } from "@/utils/api";

type Tab = "messages" | "activity";

type MatchRow = {
  matchId: number;
  projectId: number;
  projectTitle: string | null;
  builderUid: string;
  companyName: string | null;
  photoUrl: string | null;
  lastMessage: {
    body: string | null;
    attachmentCount: number;
    senderUid: string | null;
    createdAt: string | null;
  } | null;
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

// Activity tab hides notification types that are already represented in
// the Messages tab. inbox_message_new is implied by a thread's unread
// dot, so showing it twice is just noise.
const ACTIVITY_HIDDEN_TYPES = new Set(["inbox_message_new"]);

/* ----------------------------- shared hook ----------------------------- */

// Tiny module-scoped event bus so SiteHeader's badge and the open
// dropdown body can subscribe to the same fetch results without
// duplicate network requests. Cheap, no dependency.
type InboxState = {
  matches: MatchRow[];
  notifications: NotificationRow[];
};
const listeners = new Set<(s: InboxState) => void>();
let cached: InboxState = { matches: [], notifications: [] };

function publish(next: Partial<InboxState>) {
  cached = { ...cached, ...next };
  for (const l of listeners) l(cached);
}

/**
 * Subscribe to the inbox unread totals. Refetches on mount and on every
 * `vmb:notification` event. Returns numbers ready to render.
 */
export function useInboxUnread(enabled: boolean): {
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
        api.get<{ matches: MatchRow[] }>("/api/matches"),
        api.get<{ items: NotificationRow[] }>("/api/notifications?limit=50"),
      ]);
      publish({
        matches: Array.isArray(m.data?.matches) ? m.data.matches : [],
        notifications: Array.isArray(n.data?.items) ? n.data.items : [],
      });
    } catch {
      // Network blips just leave the previous cache in place.
    }
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled) return;
    refetch();
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled) return;
    const onNotif = () => {
      refetch();
    };
    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
  }, [enabled, refetch]);

  return useMemo(() => {
    const messagesUnread = state.matches.reduce(
      (sum, m) => sum + (m.unreadCount || 0),
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

/* ----------------------------- main panel ----------------------------- */

export default function InboxDropdown({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const router = useRouter();
  const [state, setState] = useState<InboxState>(cached);

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // Compute counts before deciding default tab.
  const messagesUnread = state.matches.reduce(
    (sum, m) => sum + (m.unreadCount || 0),
    0,
  );
  const activity = state.notifications.filter(
    (n) => !ACTIVITY_HIDDEN_TYPES.has(n.type),
  );
  const activityUnread = activity.filter((n) => !n.readAt).length;

  // Default to the tab with unread; if Messages has 0 unread but Activity
  // has > 0, open on Activity. Otherwise Messages.
  const [tab, setTab] = useState<Tab>(() =>
    messagesUnread === 0 && activityUnread > 0 ? "activity" : "messages",
  );

  // When the user opens the Activity tab, fire-and-forget mark-all-read so
  // the badge stops nagging. We update local state optimistically too.
  useEffect(() => {
    if (tab !== "activity") return;
    const unreadIds = activity.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;

    api
      .post("/api/notifications/read-all", {})
      .catch(() => {
        // best-effort
      });
    // Optimistic local update so the badge clears immediately.
    publish({
      notifications: state.notifications.map((n) =>
        unreadIds.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    });
    // We intentionally only fire when the tab flips TO activity, not on
    // every render while activity is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div
      className="absolute right-0 top-12 z-50 w-[400px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      role="menu"
      aria-label="Inbox"
    >
      {/* Header - "View all" always routes to /matches (combined
          desktop inbox renders both Messages and Activity tabs). */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="font-extrabold text-slate-900">Inbox</span>
        <Link
          href="/matches"
          onClick={onClose}
          className="text-[12px] font-semibold text-indigo-600 hover:underline"
        >
          View all
        </Link>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-3 pb-2">
        <div
          className="inline-flex rounded-full bg-amber-50 p-1"
          role="tablist"
          aria-label="Inbox sections"
        >
          <TabPill
            active={tab === "messages"}
            label="Messages"
            count={messagesUnread}
            onClick={() => setTab("messages")}
          />
          <TabPill
            active={tab === "activity"}
            label="Activity"
            count={activityUnread}
            onClick={() => setTab("activity")}
          />
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[420px] overflow-y-auto">
        {tab === "messages" ? (
          <MessagesList
            matches={state.matches}
            onClose={onClose}
            router={router}
          />
        ) : (
          <ActivityList items={activity} onClose={onClose} router={router} />
        )}
      </div>
    </div>
  );
}

/* ----------------------------- tab pill ----------------------------- */

function TabPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12.5px] font-bold transition-colors ${
        active ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
      style={
        active ? { background: "linear-gradient(135deg,#6366f1,#4f46e5)" } : {}
      }
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[10px] font-extrabold px-1 ${
            active ? "bg-white/25 text-white" : "bg-indigo-600 text-white"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/* ----------------------------- messages list ----------------------------- */

function MessagesList({
  matches,
  onClose,
  router,
}: {
  matches: MatchRow[];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  // Sort by most recent activity. Fall back to matchId desc when there's
  // no message yet.
  const sorted = useMemo(() => {
    const ts = (m: MatchRow) =>
      m.lastMessage?.createdAt ? new Date(m.lastMessage.createdAt).getTime() : 0;
    return [...matches].sort((a, b) => {
      const dt = ts(b) - ts(a);
      if (dt !== 0) return dt;
      return b.matchId - a.matchId;
    });
  }, [matches]);

  if (sorted.length === 0) return <EmptyState kind="messages" />;

  return (
    <ul className="divide-y divide-slate-100">
      {sorted.map((m) => {
        const unread = (m.unreadCount || 0) > 0;
        const subtitle = m.projectTitle || "Project";
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
                openChatFromInbox(router, m.matchId, m.projectId);
              }}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-amber-50/60 transition-colors"
            >
              <Avatar photoUrl={m.photoUrl} name={m.companyName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[13px] truncate ${unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}
                  >
                    {m.companyName || "Tradesperson"}
                    <span className="font-normal text-slate-400"> · {subtitle}</span>
                  </span>
                  <RelativeTime iso={m.lastMessage?.createdAt} />
                </div>
                <p
                  className={`text-[12.5px] truncate mt-0.5 ${unread ? "text-slate-700" : "text-slate-500"}`}
                >
                  {snippet}
                </p>
              </div>
              {unread && (
                <span
                  aria-label={`${m.unreadCount} unread`}
                  className="h-2 w-2 rounded-full bg-indigo-600 mt-1.5 shrink-0"
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------- activity list ----------------------------- */

function ActivityList({
  items,
  onClose,
  router,
}: {
  items: NotificationRow[];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  if (items.length === 0) return <EmptyState kind="activity" />;

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const meta = activityIconFor(n.type);
        const Icon = meta.icon;
        const href = n.linkPath || "#";
        // Chat-message and match-formed notifications point at /chat/:id
        // or /match/:id - both should pop the dock chat window rather
        // than full-page-navigating, matching how the Messages tab
        // behaves. We intercept the click, extract the matchId, and
        // route through openChatFromInbox (same helper the Messages
        // tab uses).
        const matchIdFromLink = (() => {
          const m = String(n.linkPath || "").match(
            /\/(?:chat|match)\/(\d+)/,
          );
          return m ? Number(m[1]) : null;
        })();
        const interceptToDock =
          matchIdFromLink != null && n.projectId != null;
        return (
          <li key={n.id}>
            <Link
              href={href}
              onClick={(e) => {
                if (interceptToDock) {
                  e.preventDefault();
                  openChatFromInbox(
                    router,
                    matchIdFromLink as number,
                    n.projectId as number,
                  );
                }
                onClose();
              }}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-amber-50/60 transition-colors"
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
                <RelativeTime iso={n.createdAt} className="block mt-0.5 text-[11px] text-slate-400" />
              </div>
              {!n.readAt && (
                <span className="h-2 w-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Open a chat from the inbox dropdown.
 *
 * Three-way routing:
 *   - On /matches (desktop two-pane): stay on the page and flip the
 *     right pane to this thread via the `vmb:selectMatch` event.
 *   - Already on the relevant /projects/:id (desktop): the dock is
 *     mounted here; pop it in place via `vmb:openChat`.
 *   - Any other desktop page: navigate to /projects/:id?openChat=:matchId.
 *     The project page reads the query on mount and pops the dock.
 *   - Mobile: navigate to /chat/:matchId (canonical mobile surface).
 */
function openChatFromInbox(
  router: ReturnType<typeof useRouter>,
  matchId: number,
  projectId: number,
) {
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 768px)").matches;

  if (isDesktop) {
    if (router.pathname === "/matches") {
      window.dispatchEvent(
        new CustomEvent("vmb:selectMatch", { detail: { matchId } }),
      );
      return;
    }
    const onSameProject =
      router.pathname === "/projects/[id]" &&
      Number(
        Array.isArray(router.query.id) ? router.query.id[0] : router.query.id,
      ) === Number(projectId);
    if (onSameProject) {
      window.dispatchEvent(
        new CustomEvent("vmb:openChat", { detail: { matchId } }),
      );
      return;
    }
    router.push(`/projects/${projectId}?openChat=${matchId}`);
    return;
  }

  router.push(`/chat/${matchId}`);
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

/* ----------------------------- pieces ----------------------------- */

function Avatar({ photoUrl, name }: { photoUrl: string | null; name: string | null }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (photoUrl) {
    return (
      <span className="inline-block h-9 w-9 shrink-0 rounded-full overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm">
      {initial}
    </span>
  );
}

function EmptyState({ kind }: { kind: "messages" | "activity" }) {
  const copy =
    kind === "messages"
      ? {
          icon: MessageSquare,
          title: "No messages yet",
          body: "When tradespeople reply to your jobs, your conversations will appear here.",
          tone: "amber" as const,
        }
      : {
          icon: Sparkles,
          title: "All caught up",
          body: "Recommendations from your community and other updates will land here.",
          tone: "amber" as const,
        };
  const Icon = copy.icon;
  return (
    <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
        <Icon className="h-5 w-5 text-amber-600" />
      </span>
      <p className="text-[13.5px] font-extrabold text-slate-900">{copy.title}</p>
      <p className="text-[12.5px] text-slate-500 leading-snug max-w-[260px]">{copy.body}</p>
    </div>
  );
}

function RelativeTime({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  if (!iso) return null;
  const t = relativeShort(iso);
  return (
    <span className={className || "text-[11px] text-slate-400 shrink-0"}>{t}</span>
  );
}

function relativeShort(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w`;
  return new Date(iso).toLocaleDateString();
}
