// web/components/messaging/DesktopInbox.tsx
//
// Full-page desktop inbox at /matches. Two-pane reader (Apple Mail style)
// with Messages and Activity tabs across the top.
//
// - Left pane (~360px): list of threads (Messages tab) or notifications
//   (Activity tab). Click a row to select it.
// - Right pane: detail for the selected item.
//   - For a message thread: live chat fetched from /api/chat/:matchId/messages
//     plus a reply input that POSTs to the same endpoint.
//   - For an activity item: a summary card with an "Open" CTA that routes
//     to its linkPath (/projects/:id?openChat=:matchId for matches,
//     /tradesman/:uid for paid-unlock cards, etc.).
//
// Mobile is handled by a separate render branch in pages/matches.tsx.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Sparkles,
  Handshake,
  CreditCard,
  Bell,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useApi } from "@/utils/api";
import { useSseEvent } from "@/utils/useSseEvent";

type Tab = "messages" | "activity";

type LastMessage = {
  body: string | null;
  attachmentCount: number;
  senderUid: string | null;
  createdAt: string | null;
};

type MatchRow = {
  matchId: number;
  projectId: number;
  projectTitle: string | null;
  builderUid: string;
  companyName: string | null;
  photoUrl: string | null;
  lastMessage: LastMessage | null;
  unreadCount: number;
  status: string;
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

type ChatMessage = {
  id: number;
  senderUid: string;
  senderRole: "homeowner" | "tradesman";
  senderName: string;
  body: string;
  attachments?: string[];
  createdAt: string;
};

type ChatData = {
  matchId: number;
  projectId: number;
  projectName: string;
  otherParty: { role: string; uid: string; name: string };
  me: { role: string; uid: string };
  messages: ChatMessage[];
};

// Activity types we hide because the message tab already represents them.
const ACTIVITY_HIDDEN_TYPES = new Set(["inbox_message_new", "chat_message_new"]);

export default function DesktopInbox() {
  const api = useApi();
  const [tab, setTab] = useState<Tab>("messages");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [selectedNotifId, setSelectedNotifId] = useState<number | null>(null);

  /* ------------------------------ data ------------------------------ */

  const refetchMatches = useCallback(async () => {
    try {
      const res = await api.get<{ matches: MatchRow[] }>("/api/matches");
      const list = Array.isArray(res.data?.matches) ? res.data.matches : [];
      setMatches(list);
      setSelectedMatchId((prev) => prev ?? list[0]?.matchId ?? null);
    } catch {
      // network blip
    }
  }, [api]);

  const refetchNotifications = useCallback(async () => {
    try {
      const res = await api.get<{ items: NotificationRow[] }>(
        "/api/notifications?limit=100",
      );
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      const visible = items.filter((n) => !ACTIVITY_HIDDEN_TYPES.has(n.type));
      setNotifications(visible);
      setSelectedNotifId((prev) => prev ?? visible[0]?.id ?? null);
    } catch {
      // network blip
    }
  }, [api]);

  useEffect(() => {
    refetchMatches();
    refetchNotifications();
  }, [refetchMatches, refetchNotifications]);

  // SSE: refetch the relevant tab when a new event arrives.
  useSseEvent<{ type?: string; matchId?: number }>(
    "chat_message",
    () => {
      refetchMatches();
    },
  );
  useEffect(() => {
    function onAnyNotif(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const t = String(detail?.type || "");
      if (!t) return;
      // Refetch notifications for any non-message type, refetch matches
      // for message-related types (already covered by the useSseEvent
      // above for chat_message specifically).
      if (!ACTIVITY_HIDDEN_TYPES.has(t)) refetchNotifications();
    }
    window.addEventListener("vmb:notification", onAnyNotif);
    return () => window.removeEventListener("vmb:notification", onAnyNotif);
  }, [refetchNotifications]);

  // Mark the visible activity items as read when the user lands on the
  // Activity tab. Optimistic + best-effort.
  useEffect(() => {
    if (tab !== "activity") return;
    const unread = notifications.filter((n) => !n.readAt);
    if (unread.length === 0) return;
    api.post("/api/notifications/read-all", {}).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) =>
        unread.find((u) => u.id === n.id)
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ------------------------------ counts ------------------------------ */

  const messagesUnread = matches.reduce(
    (sum, m) => sum + (m.unreadCount || 0),
    0,
  );
  const activityUnread = notifications.filter((n) => !n.readAt).length;

  /* --------------------------- sorted lists --------------------------- */

  const sortedMatches = useMemo(() => {
    const ts = (m: MatchRow) =>
      m.lastMessage?.createdAt ? new Date(m.lastMessage.createdAt).getTime() : 0;
    return [...matches].sort((a, b) => {
      const dt = ts(b) - ts(a);
      if (dt !== 0) return dt;
      return b.matchId - a.matchId;
    });
  }, [matches]);

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [notifications]);

  /* --------------------------- selected items --------------------------- */

  const selectedMatch =
    sortedMatches.find((m) => m.matchId === selectedMatchId) ?? null;
  const selectedNotif =
    sortedNotifications.find((n) => n.id === selectedNotifId) ?? null;

  /* ------------------------------ render ------------------------------ */

  return (
    <div className="mx-auto max-w-6xl px-6 pt-6 pb-12">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1
            className="text-3xl font-black text-slate-900 tracking-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            Inbox
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Conversations and activity across all your jobs.
          </p>
        </div>
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

      <div
        className="bg-white rounded-3xl border border-amber-100 shadow-sm overflow-hidden grid grid-cols-[360px_1fr]"
        style={{ height: "70vh", minHeight: 520 }}
      >
        {/* Left pane: list */}
        <div className="border-r border-slate-100 overflow-y-auto bg-amber-50/20">
          {tab === "messages" ? (
            sortedMatches.length === 0 ? (
              <ListEmpty kind="messages" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {sortedMatches.map((m) => (
                  <MessageListRow
                    key={m.matchId}
                    match={m}
                    selected={m.matchId === selectedMatchId}
                    onSelect={() => setSelectedMatchId(m.matchId)}
                  />
                ))}
              </ul>
            )
          ) : sortedNotifications.length === 0 ? (
            <ListEmpty kind="activity" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sortedNotifications.map((n) => (
                <ActivityListRow
                  key={n.id}
                  notif={n}
                  selected={n.id === selectedNotifId}
                  onSelect={() => setSelectedNotifId(n.id)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Right pane: detail */}
        <div className="overflow-hidden flex flex-col">
          {tab === "messages" ? (
            selectedMatch ? (
              <ChatDetail key={selectedMatch.matchId} match={selectedMatch} />
            ) : (
              <DetailEmpty kind="messages" />
            )
          ) : selectedNotif ? (
            <ActivityDetail notif={selectedNotif} />
          ) : (
            <DetailEmpty kind="activity" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Tab pill
   ============================================================ */

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
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
        active ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
      style={
        active ? { background: "linear-gradient(135deg,#6366f1,#4f46e5)" } : {}
      }
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-extrabold px-1 ${
            active ? "bg-white/25 text-white" : "bg-indigo-600 text-white"
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/* ============================================================
   List rows
   ============================================================ */

function MessageListRow({
  match,
  selected,
  onSelect,
}: {
  match: MatchRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const unread = (match.unreadCount || 0) > 0;
  const snippet =
    match.lastMessage?.body?.trim() ||
    (match.lastMessage?.attachmentCount
      ? `${match.lastMessage.attachmentCount} photo${match.lastMessage.attachmentCount === 1 ? "" : "s"}`
      : "Say hi to get the conversation started.");
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
          selected ? "bg-amber-50/80" : "hover:bg-amber-50/40"
        }`}
      >
        <Avatar photoUrl={match.photoUrl} name={match.companyName} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[13px] truncate ${unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}
            >
              {match.companyName || "Tradesperson"}
            </span>
            <RelativeTime iso={match.lastMessage?.createdAt} />
          </div>
          {match.projectTitle && (
            <p className="text-[11.5px] text-indigo-700 font-bold truncate mt-0.5">
              {match.projectTitle}
            </p>
          )}
          <p
            className={`text-[12.5px] truncate mt-0.5 ${unread ? "text-slate-700" : "text-slate-500"}`}
          >
            {snippet}
          </p>
        </div>
        {unread && (
          <span
            aria-label={`${match.unreadCount} unread`}
            className="h-2 w-2 rounded-full bg-indigo-600 mt-1.5 shrink-0"
          />
        )}
      </button>
    </li>
  );
}

function ActivityListRow({
  notif,
  selected,
  onSelect,
}: {
  notif: NotificationRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = activityIconFor(notif.type);
  const Icon = meta.Icon;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
          selected ? "bg-amber-50/80" : "hover:bg-amber-50/40"
        }`}
      >
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}
        >
          <Icon className={`h-5 w-5 ${meta.fg}`} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[13px] truncate leading-snug ${!notif.readAt ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}
          >
            {notif.message}
          </p>
          <RelativeTime
            iso={notif.createdAt}
            className="block mt-1 text-[11px] text-slate-400"
          />
        </div>
        {!notif.readAt && (
          <span className="h-2 w-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
        )}
      </button>
    </li>
  );
}

/* ============================================================
   Detail panes
   ============================================================ */

function ChatDetail({ match }: { match: MatchRow }) {
  const api = useApi();
  const [data, setData] = useState<ChatData | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<ChatData>(`/api/chat/${match.matchId}/messages`);
      setData(res.data);
    } catch {
      setData(null);
    }
  }, [api, match.matchId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Refetch when a new chat message arrives for THIS match.
  useSseEvent<{ matchId: number }>("chat_message", (payload) => {
    if (!payload || Number(payload.matchId) !== Number(match.matchId)) return;
    reload();
  });

  // Scroll to bottom whenever messages change.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.post(`/api/chat/${match.matchId}/messages`, { body: text });
      setBody("");
      reload();
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
        <Avatar photoUrl={match.photoUrl} name={match.companyName} size={44} />
        <div className="min-w-0">
          <h2
            className="text-lg font-black text-slate-900 truncate"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {match.companyName || "Tradesperson"}
          </h2>
          {match.projectTitle && (
            <p className="text-[12px] text-indigo-700 font-bold truncate">
              {match.projectTitle}
            </p>
          )}
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-2">
        {!data ? (
          <p className="text-slate-400 text-sm">Loading conversation…</p>
        ) : data.messages.length === 0 ? (
          <p className="text-slate-400 text-sm">No messages yet. Say hi to get the conversation started.</p>
        ) : (
          data.messages.map((m) => (
            <ChatBubble
              key={m.id}
              who={m.senderRole === data.me.role ? "me" : "them"}
              text={m.body}
              attachments={m.attachments}
              time={formatTime(m.createdAt)}
            />
          ))
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a reply…"
            className="flex-1 rounded-full border border-slate-200 bg-amber-50/40 px-4 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-[13px] font-extrabold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}

function ActivityDetail({ notif }: { notif: NotificationRow }) {
  const meta = activityIconFor(notif.type);
  const Icon = meta.Icon;
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="flex items-start gap-4 mb-5">
        <span
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.bg}`}
        >
          <Icon className={`h-6 w-6 ${meta.fg}`} />
        </span>
        <div className="min-w-0">
          <h2
            className="text-lg font-black text-slate-900 leading-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {notif.message}
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {relativeShort(notif.createdAt)} ago
          </p>
        </div>
      </div>
      {notif.linkPath ? (
        <Link
          href={notif.linkPath}
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-extrabold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
        >
          Open
        </Link>
      ) : null}
    </div>
  );
}

function DetailEmpty({ kind }: { kind: Tab }) {
  return (
    <div className="flex-1 flex items-center justify-center px-8 py-12 text-center">
      <div className="max-w-[300px]">
        <p
          className="text-[15px] font-black text-slate-900"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {kind === "messages"
            ? "Pick a conversation"
            : "Pick an activity item"}
        </p>
        <p className="mt-1 text-[13px] text-slate-500">
          {kind === "messages"
            ? "Choose a thread on the left to read the conversation here."
            : "Choose an item on the left to see its details and open it."}
        </p>
      </div>
    </div>
  );
}

function ListEmpty({ kind }: { kind: Tab }) {
  return (
    <div className="px-6 py-12 flex flex-col items-center text-center gap-2">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
        {kind === "messages" ? (
          <MessageSquare className="h-5 w-5 text-amber-600" />
        ) : (
          <Sparkles className="h-5 w-5 text-amber-600" />
        )}
      </span>
      <p
        className="text-[14px] font-black text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {kind === "messages" ? "No messages yet" : "All caught up"}
      </p>
      <p className="text-[12.5px] text-slate-500 leading-snug max-w-[240px]">
        {kind === "messages"
          ? "When tradespeople reply to your jobs, your conversations will appear here."
          : "Recommendations from your community and other updates will land here."}
      </p>
    </div>
  );
}

/* ============================================================
   Tiny helpers
   ============================================================ */

function Avatar({
  photoUrl,
  name,
  size,
}: {
  photoUrl: string | null;
  name: string | null;
  size: number;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (photoUrl) {
    return (
      <span
        className="inline-block shrink-0 rounded-full overflow-hidden bg-slate-100"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

function ChatBubble({
  who,
  text,
  attachments,
  time,
}: {
  who: "me" | "them";
  text: string;
  attachments?: string[];
  time: string;
}) {
  return (
    <div className={who === "me" ? "flex justify-end" : "flex"}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] ${
          who === "me" ? "bg-indigo-600 text-white" : "bg-amber-50 text-slate-800"
        }`}
      >
        {text && <span className="whitespace-pre-wrap break-words">{text}</span>}
        {attachments && attachments.length > 0 && (
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {attachments.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-20 object-cover" />
              </a>
            ))}
          </div>
        )}
        <div
          className={`mt-1 text-[10.5px] ${who === "me" ? "text-white/70" : "text-slate-400"}`}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function activityIconFor(type: string): {
  Icon: typeof Sparkles;
  bg: string;
  fg: string;
} {
  if (type.startsWith("recommendation"))
    return { Icon: Sparkles, bg: "bg-amber-50", fg: "text-amber-600" };
  if (type === "match_formed")
    return { Icon: Handshake, bg: "bg-emerald-50", fg: "text-emerald-600" };
  if (type.startsWith("paid_unlock"))
    return { Icon: CreditCard, bg: "bg-indigo-50", fg: "text-indigo-600" };
  if (type === "classification_ready" || type === "project_match")
    return { Icon: ChevronRight, bg: "bg-sky-50", fg: "text-sky-600" };
  return { Icon: Bell, bg: "bg-slate-100", fg: "text-slate-600" };
}

function RelativeTime({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  if (!iso) return null;
  return (
    <span className={className || "text-[11px] text-slate-400 shrink-0"}>
      {relativeShort(iso)}
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
