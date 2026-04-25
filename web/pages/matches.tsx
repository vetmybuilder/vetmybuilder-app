// web/pages/matches.tsx
//
// Cross-project matches page for homeowners. Fetches /api/matches and
// renders a mobile-first, full-screen list with New/Contacted/Archived
// tabs. On "new" and "contacted" tabs, matches are grouped by source
// (recommended vs. ai-matched). Tapping a card navigates to the per-match
// page at /match/:matchId.
//
// Visual language mirrors /inbox exactly — same hero structure, same tab
// pills, same card rounding, same indigo accents.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeft } from "lucide-react";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";

type MatchStatus = "new" | "contacted" | "archived";
type MatchSource = "recommended" | "ai-matched";

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

type Tab = MatchStatus;

const EMPTY_COPY: Record<Tab, { emoji: string; title: string; sub: string }> = {
  new: {
    emoji: "💫",
    title: "No matches yet",
    sub: "Keep swiping — we'll notify you when a builder matches with you.",
  },
  contacted: {
    emoji: "📞",
    title: "No active follow-ups",
    sub: "Matches you've reached out to will show up here.",
  },
  archived: {
    emoji: "📦",
    title: "No archived matches",
    sub: "Matches you archive will appear here.",
  },
};

// Mirrors desktop ShortlistSection scoreColor: green ≥55, amber ≥30, red otherwise.
function scoreColorClass(score: number): string {
  if (score >= 55) return "bg-gradient-to-br from-emerald-500 to-emerald-600";
  if (score >= 30) return "bg-gradient-to-br from-amber-500 to-amber-600";
  return "bg-gradient-to-br from-red-500 to-red-600";
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div
      className={`w-full h-full rounded-full ${scoreColorClass(score)} flex items-center justify-center text-white text-[11px] font-extrabold shadow`}
      aria-label={`Score: ${score}`}
      data-testid="match-score-badge"
    >
      {score}
    </div>
  );
}

function MatchCard({
  row,
  onOpen,
}: {
  row: MatchRow;
  onOpen: (matchId: string) => void;
}) {
  const isRec = row.source === "recommended";
  const initial = (row.companyName || "?").charAt(0).toUpperCase();
  const avatarStyle = {
    backgroundImage: pickAvatarGradient(row.companyName || "?"),
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={row.companyName}
      onClick={() => onOpen(row.matchId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(row.matchId);
        }
      }}
      className={`mx-5 mb-3 p-4 rounded-[20px] border cursor-pointer ${
        isRec
          ? "border-indigo-200 bg-gradient-to-br from-[#fafbff] via-white to-white"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-14 h-14 shrink-0">
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-white font-extrabold text-[17px]"
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
          {typeof row.vmbScore === "number" && row.vmbScore > 0 && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white p-[2px] shadow">
              <ScoreBadge score={row.vmbScore} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold tracking-tight text-gray-900 truncate">
            {row.companyName}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-gray-500">
            {row.googleRating != null && (
              <span className="inline-flex items-center gap-1 text-gray-700 font-bold">
                <span className="text-amber-500">★</span>
                {row.googleRating.toFixed(1)}
                <span className="text-gray-400 font-semibold">
                  ({row.googleReviewCount})
                </span>
              </span>
            )}
            {row.yearsTrading > 0 && (
              <span className="font-semibold">{row.yearsTrading} yrs</span>
            )}
            {row.chVerified && (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold">
                ✓ Verified
              </span>
            )}
          </div>
          <div
            className={`text-[11px] font-bold mt-1.5 ${
              isRec ? "text-indigo-700" : "text-gray-500"
            }`}
          >
            {isRec ? "★ " : "✨ "}
            {row.whyMatch}
          </div>
        </div>
        <div
          className="text-gray-400 text-[22px] font-semibold self-center"
          aria-hidden
        >
          ›
        </div>
      </div>
      <div className="inline-flex items-center gap-1 mt-2.5 bg-gray-100 text-gray-700 text-[11px] font-bold px-2.5 py-1 rounded-full max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
        {row.projectTitle}
      </div>
      {row.trades.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {row.trades.slice(0, 4).map((t) => (
            <span
              key={t}
              className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchesPageInner() {
  const router = useRouter();
  const api = useApi();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [tab, setTab] = useState<Tab>("new");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/matches")
      .then((res) => {
        if (cancelled) return;
        const rows: MatchRow[] = Array.isArray(res.data?.matches)
          ? res.data.matches
          : [];
        setMatches(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setMatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts: Record<Tab, number> = {
    new: matches.filter((m) => m.status === "new").length,
    contacted: matches.filter((m) => m.status === "contacted").length,
    archived: matches.filter((m) => m.status === "archived").length,
  };

  const visible = matches.filter((m) => m.status === tab);

  const tabDefs: { key: Tab; label: string }[] = [
    { key: "new", label: "New" },
    { key: "contacted", label: "Contacted" },
    { key: "archived", label: "Archived" },
  ];

  function openMatch(matchId: string) {
    router.push(`/match/${matchId}`);
  }

  const grouped = {
    recommended: visible.filter((m) => m.source === "recommended"),
    aiMatched: visible.filter((m) => m.source === "ai-matched"),
  };

  const showGroups = tab !== "archived";

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
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-[15px] font-bold text-gray-500 tracking-tight">
          Matches
        </div>
        <div className="w-10" />
      </div>

      {/* Hero */}
      <section className="px-6 pt-2 pb-4 text-center">
        <div className="text-[34px] leading-none mb-2.5" aria-hidden>
          ♥
        </div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
          Your matches
        </h1>
        <p className="mt-2.5 mx-4 text-[14px] text-gray-500 leading-[1.5]">
          Builders who picked you back. Tap a card to call, message, or WhatsApp
          them.
        </p>
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1 bg-gray-100 rounded-2xl p-1 mx-5 mb-4"
      >
        {tabDefs.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`py-2 rounded-xl text-[13px] font-extrabold flex items-center justify-center ${
                active ? "bg-white shadow text-gray-900" : "text-gray-500"
              }`}
            >
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`ml-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-[32px] opacity-60" aria-hidden>
            {EMPTY_COPY[tab].emoji}
          </div>
          <div className="text-[16px] font-extrabold text-gray-900 mt-2.5">
            {EMPTY_COPY[tab].title}
          </div>
          <div className="text-[13px] text-gray-500 mt-1.5 mx-6">
            {EMPTY_COPY[tab].sub}
          </div>
        </div>
      ) : showGroups ? (
        <div>
          {grouped.recommended.length > 0 && (
            <>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-indigo-600 px-6 pt-2 pb-2.5">
                ★ Recommended by your network
              </div>
              {grouped.recommended.map((row) => (
                <MatchCard key={row.matchId} row={row} onOpen={openMatch} />
              ))}
            </>
          )}
          {grouped.aiMatched.length > 0 && (
            <>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-400 px-6 pt-2 pb-2.5">
                ✨ AI-matched
              </div>
              {grouped.aiMatched.map((row) => (
                <MatchCard key={row.matchId} row={row} onOpen={openMatch} />
              ))}
            </>
          )}
        </div>
      ) : (
        <div>
          {visible.map((row) => (
            <MatchCard key={row.matchId} row={row} onOpen={openMatch} />
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
