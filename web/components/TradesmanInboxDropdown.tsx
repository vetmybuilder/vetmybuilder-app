// web/components/TradesmanInboxDropdown.tsx
//
// Inbox dropdown for the tradesman header MessageSquare icon. Mirrors
// the homeowner InboxDropdown shape (Messages + Activity tabs, unread
// totals via a shared module-scoped event bus) but pulls from the
// tradesman-side endpoints:
//   - Messages: /api/tradesman/matches  (now returns lastMessage +
//                                        unreadCount alongside metadata)
//   - Activity: /api/notifications      (already shared with homeowner)
//
// Privacy: rows surface the project name, never the homeowner's name.
// Avatar is a source-tinted square with the project's first letter.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { MessageSquare, Sparkles, Handshake, Bell } from "lucide-react";
import { useApi } from "@/utils/api";

type Tab = "messages" | "activity";

type TradesmanMatchRow = {
  matchId: string;
  projectId: number;
  projectName: string;
  projectType: string;
  projectLocation: string;
  source: "recommended" | "subscribed";
  matchedAt: string;
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

const ACTIVITY_HIDDEN_TYPES = new Set(["inbox_message_new"]);

/* ----------------------------- shared bus ----------------------------- */

type InboxState = {
  matches: TradesmanMatchRow[];
  notifications: NotificationRow[];
};
const listeners = new Set<(s: InboxState) => void>();
let cached: InboxState = { matches: [], notifications: [] };

function publish(next: Partial<InboxState>) {
  cached = { ...cached, ...next };
  for (const l of listeners) l(cached);
}

/**
 * Trade-side inbox unread totals. Same hook signature as the homeowner
 * useInboxUnread - the SiteHeader badge can swap implementations based
 * on the viewer role without changing render logic.
 */
export function useTradesmanInboxUnread(enabled: boolean): {
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
        api.get<{ matches: TradesmanMatchRow[] }>("/api/tradesman/matches"),
        api.get<{ items: NotificationRow[] }>("/api/notifications?limit=50"),
      ]);
      publish({
        matches: Array.isArray(m.data?.matches) ? m.data.matches : [],
        notifications: Array.isArray(n.data?.items) ? n.data.items : [],
      });
    } catch {
      // ignore network blips
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

  // Mark-all-read on activity tab open (mirrors homeowner behaviour).
  useEffect(() => {
    if (tab !== "activity") return;
    const unreadIds = activity.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;
    api.post("/api/notifications/read-all", {}).catch(() => {});
    publish({
      notifications: state.notifications.map((n) =>
        unreadIds.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div
      className="absolute right-0 top-12 z-50 w-[400px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      role="menu"
      aria-label="Inbox"
      data-testid="trades-inbox-dropdown"
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
        <div
          className="inline-flex rounded-full bg-emerald-50 p-1"
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

      <div className="max-h-[420px] overflow-y-auto">
        {tab === "messages" ? (
          <MessagesList
            matches={state.matches}
            onClose={onClose}
            router={router}
          />
        ) : (
          <ActivityList items={activity} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

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
        active ? { background: "linear-gradient(135deg,#10b981,#059669)" } : {}
      }
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full text-[10px] font-extrabold px-1 ${
            active ? "bg-white/25 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function MessagesList({
  matches,
  onClose,
  router,
}: {
  matches: TradesmanMatchRow[];
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const sorted = useMemo(() => {
    const ts = (m: TradesmanMatchRow) =>
      m.lastMessage?.createdAt ? new Date(m.lastMessage.createdAt).getTime() : 0;
    return [...matches].sort((a, b) => {
      const dt = ts(b) - ts(a);
      if (dt !== 0) return dt;
      return Number(b.matchId) - Number(a.matchId);
    });
  }, [matches]);

  if (sorted.length === 0) return <EmptyState kind="messages" />;

  return (
    <ul className="divide-y divide-slate-100">
      {sorted.map((m) => {
        const unread = (m.unreadCount || 0) > 0;
        const subtitle = [m.projectType, m.projectLocation]
          .filter(Boolean)
          .join(" · ") || "Match";
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
                openChatFromInbox(router, m.matchId);
              }}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-emerald-50/40 transition-colors"
              data-testid={`trades-inbox-row-${m.matchId}`}
            >
              <Avatar source={m.source} projectName={m.projectName} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[13px] truncate ${unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}
                  >
                    {m.projectName}
                  </span>
                  <RelativeTime iso={m.lastMessage?.createdAt} />
                </div>
                <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
                <p
                  className={`text-[12.5px] truncate mt-0.5 ${unread ? "text-slate-700" : "text-slate-500"}`}
                >
                  {snippet}
                </p>
              </div>
              {unread && (
                <span
                  aria-label={`${m.unreadCount} unread`}
                  className="h-2 w-2 rounded-full bg-emerald-600 mt-1.5 shrink-0"
                />
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
}: {
  items: NotificationRow[];
  onClose: () => void;
}) {
  if (items.length === 0) return <EmptyState kind="activity" />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const meta = activityIconFor(n.type);
        const Icon = meta.icon;
        const href = n.linkPath || "#";
        return (
          <li key={n.id}>
            <Link
              href={href}
              onClick={onClose}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-emerald-50/40 transition-colors"
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
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Open a chat. If the trades messaging dock is mounted on the current
 * page (always true on tradesman authenticated routes via _app.tsx) it
 * pops the floating chat window in-place. Falls through to the
 * full-page /chat/:matchId on tradesman-bare pages.
 */
function openChatFromInbox(
  _router: ReturnType<typeof useRouter>,
  matchId: string,
) {
  const id = Number(matchId);
  if (!Number.isFinite(id) || id <= 0) return;
  window.dispatchEvent(new CustomEvent("vmb:openChat", { detail: { matchId: id } }));
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

function Avatar({
  source,
  projectName,
}: {
  source: "recommended" | "subscribed";
  projectName: string;
}) {
  const initial = (projectName || "?").trim().charAt(0).toUpperCase() || "?";
  const grad =
    source === "recommended"
      ? "linear-gradient(135deg,#fcd34d,#f59e0b)"
      : "linear-gradient(135deg,#6ee7b7,#10b981)";
  return (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white font-bold text-sm"
      style={{ background: grad }}
      aria-hidden
    >
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
          body: "When you match with a homeowner, your conversations land here.",
        }
      : {
          icon: Sparkles,
          title: "All caught up",
          body: "Match-formed alerts and other updates will land here.",
        };
  const Icon = copy.icon;
  return (
    <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
        <Icon className="h-5 w-5 text-emerald-600" />
      </span>
      <p className="text-[13.5px] font-extrabold text-slate-900">
        {copy.title}
      </p>
      <p className="text-[12.5px] text-slate-500 leading-snug max-w-[260px]">
        {copy.body}
      </p>
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
    <span className={className || "text-[11px] text-slate-400 shrink-0"}>
      {t}
    </span>
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
