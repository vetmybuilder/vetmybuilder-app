// web/pages/matches.tsx
//
// Homeowner-side conversation list. WhatsApp / iMessage style: one row per
// match, last message preview, timestamp, unread dot, filter pills replacing
// the old tabs. Visual target lives in
// web/public/mocks/matches-redesign.html (Option A).
//
// Tradesmen who land here get bounced to /tradesman/matches because
// /api/matches filters by p.ownerUserId.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";
import EnableNotificationsBanner from "@/components/EnableNotificationsBanner";
import { useMobileMenu } from "@/utils/mobileMenu";
import { useRole } from "@/utils/useRole";
import { useAuth } from "@/utils/auth";

type MatchStatus = "waiting" | "matched";
type MatchSource = "recommended" | "ai-matched" | "paid-unlock";
type Filter = "all" | "matched" | "pitches" | "waiting";

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
  trades: string[];
  yearsTrading: number;
  googleRating: number | null;
  googleReviewCount: number;
  vmbScore: number;
  chVerified: boolean;
  likesCount: number;
  winsCount: number;
  source: MatchSource;
  status: MatchStatus;
  whyMatch: string;
  lastMessage: LastMessage | null;
  unreadCount: number;
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #a5b4fc, #6366f1)",
  "linear-gradient(135deg, #6ee7b7, #10b981)",
  "linear-gradient(135deg, #fcd34d, #f59e0b)",
  "linear-gradient(135deg, #fda4af, #f43f5e)",
  "linear-gradient(135deg, #5eead4, #0d9488)",
];

function pickAvatarGradient(seed: string): string {
  const ch = (seed || "?").charAt(0);
  const idx = ch.charCodeAt(0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx] || AVATAR_GRADIENTS[0]!;
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Same-day -> HH:mm. Yesterday -> "Yesterday". Same week -> short weekday.
// Older -> "D MMM".
function formatRowTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000,
  );
  if (diffDays <= 0) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return WEEKDAYS_SHORT[d.getDay()] || "";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

type RowKind = "paid" | "matched" | "recommended" | "waiting";

function rowKind(row: MatchRow): RowKind {
  if (row.status === "waiting") return "waiting";
  if (row.source === "paid-unlock") return "paid";
  if (row.source === "recommended") return "recommended";
  return "matched";
}

const KIND_BADGE: Record<
  RowKind,
  { glyph: string; classes: string; label: string }
> = {
  paid: {
    glyph: "⚡",
    classes:
      "bg-gradient-to-br from-amber-400 to-amber-500 text-white border-2 border-white",
    label: "Paid pitch",
  },
  matched: {
    glyph: "♥",
    classes:
      "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-white",
    label: "Matched",
  },
  recommended: {
    glyph: "★",
    classes:
      "bg-gradient-to-br from-violet-500 to-indigo-600 text-white border-2 border-white",
    label: "Recommended",
  },
  waiting: {
    glyph: "⏳",
    classes: "bg-slate-300 text-slate-700 border-2 border-white",
    label: "Waiting",
  },
};

function contextLine(row: MatchRow): { text: string; tone: string } {
  const kind = rowKind(row);
  const project = row.projectTitle || "this project";
  if (kind === "paid") {
    return {
      text: `⚡ Paid pitch · ${project}`,
      tone: "text-amber-700",
    };
  }
  if (kind === "recommended") {
    // whyMatch already says "Recommended ..." but for the conversation list we
    // want a tighter line. Fall back to a generic recommended label - the
    // detail page surfaces who recommended.
    return {
      text: `★ Recommended · ${project}`,
      tone: "text-indigo-700",
    };
  }
  if (kind === "matched") {
    return {
      text: `♥ Matched · ${project}`,
      tone: "text-emerald-700",
    };
  }
  // waiting
  return {
    text: `⏳ Pending match · ${project}`,
    tone: "text-slate-500",
  };
}

function previewText(
  row: MatchRow,
  viewerUid: string | null,
): { text: string; italic: boolean; truncate: boolean } {
  const lm = row.lastMessage;
  if (!lm || (!lm.body && lm.attachmentCount === 0)) {
    if (row.status === "waiting") {
      return {
        text: "Builder swiped right - swipe back to start chatting.",
        italic: true,
        truncate: true,
      };
    }
    return { text: "No messages yet", italic: true, truncate: true };
  }
  const isMine = !!(viewerUid && lm.senderUid && lm.senderUid === viewerUid);
  let body = lm.body || "";
  if (!body && lm.attachmentCount > 0) {
    body = lm.attachmentCount === 1 ? "Photo" : `${lm.attachmentCount} photos`;
  }
  const prefix = isMine ? "You: " : "";
  return { text: `${prefix}${body}`, italic: false, truncate: true };
}

function ConversationRow({
  row,
  viewerUid,
  onOpen,
}: {
  row: MatchRow;
  viewerUid: string | null;
  onOpen: (row: MatchRow) => void;
}) {
  const kind = rowKind(row);
  const initial = (row.companyName || "?").charAt(0).toUpperCase();
  const avatarStyle = {
    backgroundImage: pickAvatarGradient(row.companyName || "?"),
  };
  const badge = KIND_BADGE[kind];
  const context = contextLine(row);
  const preview = previewText(row, viewerUid);
  const time = formatRowTime(row.lastMessage?.createdAt || null);
  const isWaiting = kind === "waiting";
  const hasUnread = row.unreadCount > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={row.companyName}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row);
        }
      }}
      className={`px-5 py-3 border-b border-slate-100 active:bg-slate-50 flex items-start gap-3 cursor-pointer ${
        isWaiting ? "opacity-70" : ""
      }`}
      data-testid="match-row"
    >
      <div className="relative w-12 h-12 shrink-0">
        <div
          className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-white font-extrabold text-[15px]"
          style={avatarStyle}
          aria-hidden
        >
          {row.photoUrl ? (
            <img
              src={row.photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            initial
          )}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${badge.classes}`}
          title={badge.label}
          aria-label={badge.label}
        >
          {badge.glyph}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[14.5px] font-extrabold text-slate-900 truncate">
            {row.companyName}
          </div>
          {time && (
            <span
              className={`text-[10.5px] font-semibold shrink-0 ${
                hasUnread ? "text-indigo-600" : "text-slate-400"
              }`}
            >
              {time}
            </span>
          )}
        </div>
        <div
          className={`text-[10.5px] font-bold uppercase tracking-wider mt-0.5 ${context.tone}`}
        >
          {context.text}
        </div>
        <div className="flex items-start gap-2 mt-1">
          <p
            className={`flex-1 text-[12.5px] leading-snug truncate ${
              preview.italic ? "italic text-slate-400" : "text-slate-600"
            }`}
          >
            {preview.text}
          </p>
          {hasUnread && (
            <span
              className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5"
              aria-label={`${row.unreadCount} unread`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const FILTER_EMPTY: Record<
  Filter,
  { emoji: string; title: string; sub: string }
> = {
  all: {
    emoji: "📬",
    title: "No conversations yet",
    sub: "When a builder matches with you, or pays to pitch, the thread shows up here.",
  },
  matched: {
    emoji: "🤝",
    title: "No matches yet",
    sub: "When you and a builder both swipe right, they appear here with chat and contact details.",
  },
  pitches: {
    emoji: "⚡",
    title: "No pitches yet",
    sub: "Builders who pay to message you about a job land here.",
  },
  waiting: {
    emoji: "⏳",
    title: "Nothing waiting",
    sub: "Pending swipes show up here until both sides have picked.",
  },
};

function MatchesPageInner() {
  const router = useRouter();
  const { openMenu } = useMobileMenu();
  const api = useApi();
  const { role, loading: roleLoading } = useRole();
  const { user } = useAuth();
  const viewerUid = user?.uid || null;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  // /matches is the homeowner-side cross-project list. /api/matches filters
  // by `p.ownerUserId = uid`, so a tradesman who lands here would just see
  // an empty list. Send them to /tradesman/matches.
  useEffect(() => {
    if (roleLoading) return;
    if (role === "tradesman") {
      router.replace("/tradesman/matches");
    }
  }, [role, roleLoading, router]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (roleLoading || role === "tradesman") return;
    let cancelled = false;

    async function load() {
      try {
        const res = await api.get("/api/matches");
        if (cancelled) return;
        const rows: MatchRow[] = Array.isArray(res.data?.matches)
          ? res.data.matches
          : [];
        setMatches(rows);
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Background refresh every 30s keeps timestamps + unread counts fresh
    // without making the page feel laggy. Setting state from a stale fetch
    // after unmount is guarded by the cancelled flag.
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [role, roleLoading]);

  const isPaid = (m: MatchRow) => m.source === "paid-unlock";
  const counts = useMemo(() => {
    const matched = matches.filter(
      (m) => m.status === "matched" && !isPaid(m),
    ).length;
    const pitches = matches.filter(
      (m) => m.status === "matched" && isPaid(m),
    ).length;
    const waiting = matches.filter((m) => m.status === "waiting").length;
    return {
      all: matches.length,
      matched,
      pitches,
      waiting,
    };
  }, [matches]);

  // Unread paid-pitch count drives the amber tint on the Pitches pill.
  const unreadPitches = useMemo(
    () =>
      matches.filter(
        (m) => m.status === "matched" && isPaid(m) && m.unreadCount > 0,
      ).length,
    [matches],
  );

  const visible = useMemo(() => {
    return matches.filter((m) => {
      if (filter === "all") return true;
      if (filter === "matched") return m.status === "matched" && !isPaid(m);
      if (filter === "pitches") return m.status === "matched" && isPaid(m);
      return m.status === "waiting";
    });
  }, [matches, filter]);

  // Sort: unread first, then most recent message, then waiting rows last.
  const ordered = useMemo(() => {
    const arr = [...visible];
    arr.sort((a, b) => {
      // Waiting always sinks below active threads in the unfiltered view.
      const aWait = a.status === "waiting" ? 1 : 0;
      const bWait = b.status === "waiting" ? 1 : 0;
      if (aWait !== bWait) return aWait - bWait;
      // Unread first.
      const aUnread = a.unreadCount > 0 ? 0 : 1;
      const bUnread = b.unreadCount > 0 ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      // Most recent message wins.
      const aT = a.lastMessage?.createdAt
        ? Date.parse(a.lastMessage.createdAt)
        : 0;
      const bT = b.lastMessage?.createdAt
        ? Date.parse(b.lastMessage.createdAt)
        : 0;
      return bT - aT;
    });
    return arr;
  }, [visible]);

  function openRow(row: MatchRow) {
    if (row.status === "matched") {
      router.push(`/chat/${row.matchId}`);
    } else {
      router.push(`/match/${row.matchId}`);
    }
  }

  type Pill = {
    key: Filter;
    label: string;
    count: number;
    glyph?: string;
    activeClass: string;
    inactiveClass: string;
    countClass: string;
  };
  const pills: Pill[] = [
    {
      key: "all",
      label: "All",
      count: counts.all,
      activeClass: "bg-slate-900 text-white",
      inactiveClass: "bg-slate-100 text-slate-700",
      countClass: "opacity-70",
    },
    {
      key: "matched",
      label: "Matched",
      count: counts.matched,
      activeClass: "bg-slate-900 text-white",
      inactiveClass: "bg-slate-100 text-slate-700",
      countClass: "text-slate-400",
    },
    {
      key: "pitches",
      label: "Pitches",
      count: counts.pitches,
      glyph: "⚡",
      activeClass: "bg-amber-500 text-white",
      inactiveClass:
        unreadPitches > 0
          ? "bg-amber-50 text-amber-800"
          : "bg-slate-100 text-slate-700",
      countClass: filter === "pitches" ? "opacity-70" : "text-amber-500",
    },
    {
      key: "waiting",
      label: "Waiting",
      count: counts.waiting,
      activeClass: "bg-slate-900 text-white",
      inactiveClass: "bg-slate-100 text-slate-500",
      countClass: "text-slate-400",
    },
  ];

  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto text-gray-900"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      {/* Status-bar spacer */}
      <div style={{ height: "env(safe-area-inset-top)" }} />

      {/* Top bar */}
      <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">
            Messages
          </h1>
          <span className="text-[12px] text-slate-400 font-bold">
            {counts.all}
          </span>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          onClick={openMenu}
          className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700"
        >
          <span aria-hidden className="text-[18px] leading-none">
            ≡
          </span>
        </button>
      </div>

      {/* "Turn on notifications" banner - hides itself when push is
          already granted, dismissed for the session, or unsupported. */}
      <EnableNotificationsBanner />

      {/* Filter pills */}
      <div
        className="px-3 pt-2 pb-2 flex gap-1.5 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {pills.map((p) => {
          const active = filter === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-[11.5px] font-bold ${
                active ? p.activeClass : p.inactiveClass
              } ${active ? "font-extrabold" : ""}`}
              aria-pressed={active}
            >
              {p.glyph ? <span className="mr-0.5">{p.glyph}</span> : null}
              {p.label}{" "}
              <span className={`ml-0.5 ${p.countClass}`}>{p.count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading && matches.length === 0 ? (
        <div className="px-5 py-6 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-12 h-12 rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-100 rounded w-2/3" />
                <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-5/6" />
              </div>
            </div>
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="py-16 text-center px-6">
          <div className="text-[32px] opacity-60" aria-hidden>
            {FILTER_EMPTY[filter].emoji}
          </div>
          <div className="text-[16px] font-extrabold text-gray-900 mt-2.5">
            {FILTER_EMPTY[filter].title}
          </div>
          <div className="text-[13px] text-gray-500 mt-1.5">
            {FILTER_EMPTY[filter].sub}
          </div>
        </div>
      ) : (
        <div>
          {ordered.map((row) => (
            <ConversationRow
              key={row.matchId}
              row={row}
              viewerUid={viewerUid}
              onOpen={openRow}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export default function MatchesPage() {
  return (
    <AuthedOnly>
      <MatchesPageInner />
    </AuthedOnly>
  );
}
