// web/pages/tradesman/matches.tsx
//
// Tradesman cross-project matches list. Mirrors the homeowner /matches
// page in scope but built for the builder side: shows every pair where
// both swipes are in (status='matched'), newest first. Each row deep-links
// into the existing /chat/<matchId> conversation and the /match/<matchId>
// celebration / contact reveal screen.
//
// The companion swipe deck for incoming homeowner picks the builder
// hasn't responded to lives at /tradesman/leads. These two surfaces are
// kept separate so each list has predictable semantics: matches here are
// formed deals; leads there are decisions still to make.

import Head from "next/head";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useMobileMenu } from "@/utils/mobileMenu";
import TradesmanOnly from "@/components/TradesmanOnly";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import BrandWordmark from "@/components/BrandWordmark";
import ChatWindow from "@/components/messaging/ChatWindow";
import { ChevronLeft, Handshake, MessagesSquare, Sparkles, Star } from "lucide-react";
import { getJobCategoryImage } from "@/utils/jobCategoryImage";

type MatchSource = "recommended" | "subscribed";

type TradesmanMatchRow = {
  matchId: string;
  projectId: number;
  projectName: string;
  projectType: string;
  projectLocation: string;
  homeownerFirstName: string;
  source: MatchSource;
  matchedAt: string;
};

export default function TradesmanMatchesPage() {
  const api = useApi();
  const router = useRouter();
  const { openMenu } = useMobileMenu();
  const { user, loading: authLoading } = useAuth();

  const [matches, setMatches] = useState<TradesmanMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Desktop V9: which match's preview pane is currently shown. Falls
  // back to the first match in the list once data lands.
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const res = await api.get<{ matches: TradesmanMatchRow[] }>(
        "/api/tradesman/matches",
      );
      const rows = Array.isArray(res.data?.matches) ? res.data.matches : [];
      setMatches(rows);
      // Default the desktop preview pane to the most recent match.
      setActiveMatchId((current) => current ?? rows[0]?.matchId ?? null);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    setLoading(true);
    fetchMatches();
  }, [authLoading, user, fetchMatches]);

  // Live: when a new match forms with this builder, refetch so the row
  // lands in the list without a manual reload. Both fireMatchFormed paths
  // emit a `match_formed` notification to the builder uid; the global
  // SSE dispatcher in _app.tsx re-broadcasts every notification as a
  // `vmb:notification` DOM event.
  useEffect(() => {
    function onNotif(e: Event) {
      const data = (e as CustomEvent).detail || {};
      const t = String(data?.type || "").toLowerCase();
      if (t === "match_formed") {
        fetchMatches();
      }
    }
    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
  }, [fetchMatches]);

  return (
    <TradesmanOnly>
      <Head>
        <title>Matches - VetMyBuilder</title>
      </Head>

      {/* MOBILE - existing app-shell layout, unchanged. */}
      <main
        className="md:hidden fixed inset-0 bg-white overflow-y-auto text-gray-900"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
        data-testid="tradesman-matches-list"
      >
        <div style={{ height: "env(safe-area-inset-top)" }} />

        {/* Top bar */}
        <div className="px-5 pt-3 pb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="w-[38px] h-[38px] rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Open menu"
            onClick={openMenu}
            className="w-[38px] h-[38px] rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <span aria-hidden className="text-[18px] leading-none">
              ≡
            </span>
          </button>
        </div>

        {/* Hero */}
        <section className="px-6 pt-5 pb-4 text-center">
          <div className="text-[34px] leading-none mb-2.5" aria-hidden>
            🤝
          </div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] leading-[1.15] text-gray-900">
            Your matches
          </h1>
          <p className="mt-2.5 mx-4 text-[14px] text-gray-500 leading-[1.5]">
            Homeowners who picked you back. Tap a card to chat or reveal
            contact details.
          </p>
        </section>

        {/* Quick link to the leads deck */}
        <div className="px-5 mb-4">
          <Link
            href="/tradesman/leads"
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold text-[13px]"
            data-testid="link-incoming-interest"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Incoming interest deck
            </span>
            <span className="text-[18px] leading-none">›</span>
          </Link>
        </div>

        {/* List */}
        {loading ? (
          <div className="px-5 space-y-2.5">
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="px-5 pb-12 space-y-2.5">
            {matches.map((row) => (
              <MatchRow
                key={row.matchId}
                row={row}
                onOpen={() => router.push(`/match/${row.matchId}`)}
              />
            ))}
          </div>
        )}
      </main>

      {/* DESKTOP - V9 split-view: match list pane (left) + active-match
          preview pane (right) with the open-full-chat CTA. The chat
          thread itself still lives at /chat/:matchId; this pane is the
          discovery + context surface that lets you triage many active
          conversations without page-hopping. */}
      <div
        className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden"
        data-testid="tradesman-matches-desktop"
      >
        <SiteHeader />
        <BrandWatermarkScatter />

        <div className="mx-auto max-w-7xl px-6 pb-12 relative z-10">
          <div className="text-center pt-6 pb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
              Your matches
            </div>
            <h1
              className="text-[26px] font-black tracking-tight text-slate-900 leading-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Talk to{" "}
              <span
                className="text-emerald-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
              >
                your homeowners
              </span>
            </h1>
          </div>

          {loading ? (
            <div className="bg-white border border-amber-100 rounded-3xl shadow-sm flex items-center justify-center py-24">
              <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                Loading matches…
              </span>
            </div>
          ) : matches.length === 0 ? (
            <DesktopEmptyState />
          ) : (
            <DesktopSplitView
              matches={matches}
              activeMatchId={activeMatchId ?? matches[0]?.matchId ?? null}
              onSelect={(id) => setActiveMatchId(id)}
            />
          )}
        </div>
      </div>
    </TradesmanOnly>
  );
}

function MatchRow({
  row,
  onOpen,
}: {
  row: TradesmanMatchRow;
  onOpen: () => void;
}) {
  // Trade matches are with JOBS, not people. Use the same job category
  // hero image the trade saw on the swipe card so they instantly
  // recognise which match this is. Privacy: homeowner identity isn't
  // surfaced on the list view (pre-paid contact reveal lives on
  // /match/:matchId).
  const isRec = row.source === "recommended";
  const heroImage = getJobCategoryImage(row.projectType);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid={`tradesman-match-row-${row.matchId}`}
      className="block w-full text-left bg-white border border-gray-200 rounded-[18px] p-4 active:scale-[0.99] transition-transform cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-2xl bg-cover bg-center shrink-0 ring-2"
          style={{
            backgroundImage: `url(${heroImage})`,
            ...(isRec
              ? { boxShadow: "inset 0 0 0 2px #f59e0b" }
              : { boxShadow: "inset 0 0 0 2px #10b981" }),
          }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold tracking-tight text-gray-900 truncate">
            {row.projectName}
          </div>
          {(row.projectType || row.projectLocation) && (
            <div className="mt-0.5 text-[12.5px] text-gray-600 truncate">
              {[row.projectType, row.projectLocation].filter(Boolean).join(" · ")}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isRec ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[10.5px] font-bold">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                Recommended
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 border border-gray-200 text-gray-700 px-2 py-0.5 text-[10.5px] font-bold">
                <Sparkles className="w-3 h-3" />
                Matched
              </span>
            )}
          </div>
        </div>
        <div
          className="text-gray-400 text-[20px] leading-none self-center"
          aria-hidden
        >
          ›
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
        <Link
          href={`/chat/${row.matchId}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-[11.5px] font-extrabold"
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          Chat
        </Link>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      className="bg-white border border-gray-200 rounded-[18px] p-4"
      aria-hidden
    >
      <div className="flex items-start gap-3 animate-pulse">
        <div className="w-12 h-12 rounded-full bg-gray-100" />
        <div className="flex-1">
          <div className="h-3.5 w-1/3 bg-gray-100 rounded" />
          <div className="mt-2 h-3 w-2/3 bg-gray-100 rounded" />
          <div className="mt-2 h-2.5 w-1/2 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-7 py-12 text-center">
      <div
        className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4"
        style={{
          background: "linear-gradient(135deg, #6ee7b7, #10b981)",
          boxShadow: "0 12px 36px rgba(16,185,129,0.25)",
        }}
        aria-hidden
      >
        <Handshake className="w-9 h-9 text-white" />
      </div>
      <h2 className="text-[22px] font-extrabold tracking-[-0.02em] text-gray-900">
        No matches yet
      </h2>
      <p className="mt-2 mx-2 text-[13.5px] text-gray-500 leading-[1.5]">
        Once you and a homeowner both swipe right, the match lands here. Keep
        swiping in the deck to find your next job.
      </p>
      <div className="mt-6 flex flex-col gap-2.5 max-w-[300px] mx-auto">
        <Link
          href="/tradesman/jobs"
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-extrabold text-[14px] shadow-md"
          style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
        >
          Discover new jobs
        </Link>
        <Link
          href="/tradesman/leads"
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-emerald-200 text-emerald-700 font-bold text-[13px]"
        >
          Open incoming interest
        </Link>
      </div>
    </div>
  );
}

// ─── Desktop V9 split-view ─────────────────────────────────────────────

function DesktopSplitView({
  matches,
  activeMatchId,
  onSelect,
}: {
  matches: TradesmanMatchRow[];
  activeMatchId: string | null;
  onSelect: (matchId: string) => void;
}) {
  const active =
    matches.find((m) => m.matchId === activeMatchId) ?? matches[0] ?? null;

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4">
      {/* List pane */}
      <aside className="bg-white border border-amber-100 rounded-3xl overflow-hidden shadow-sm self-start">
        <div className="px-4 py-2.5 border-b border-slate-100 text-[11.5px] font-bold text-slate-500">
          {matches.length} {matches.length === 1 ? "match" : "matches"}
        </div>
        <ul
          className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto"
          data-testid="desktop-matches-list"
        >
          {matches.map((row) => (
            <DesktopMatchListItem
              key={row.matchId}
              row={row}
              isActive={active?.matchId === row.matchId}
              onClick={() => onSelect(row.matchId)}
            />
          ))}
        </ul>
      </aside>

      {/* Preview pane - inline chat thread for the active match. The
          ChatWindow inline variant provides its own header (avatar +
          other party name + project name) and composer, so the page
          itself doesn't render any chrome around it. */}
      <main
        className="h-[640px]"
        data-testid="desktop-match-preview"
      >
        {active ? (
          <ChatWindow
            key={active.matchId}
            matchId={Number(active.matchId)}
            variant="inline"
          />
        ) : (
          <div className="h-full bg-white border border-amber-100 rounded-3xl shadow-sm flex items-center justify-center text-slate-400 text-[13px]">
            Pick a match to preview the conversation.
          </div>
        )}
      </main>
    </div>
  );
}

function DesktopMatchListItem({
  row,
  isActive,
  onClick,
}: {
  row: TradesmanMatchRow;
  isActive: boolean;
  onClick: () => void;
}) {
  // Trade matches are with JOBS, not people - use the same job category
  // hero image as the swipe card so the trade instantly recognises which
  // match this is. Homeowner identity stays private until /match/:id.
  const isRec = row.source === "recommended";
  const heroImage = getJobCategoryImage(row.projectType);
  const sourceClass = isRec
    ? "bg-emerald-50 text-emerald-700"
    : "bg-indigo-50 text-indigo-700";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left flex items-start gap-2.5 px-3.5 py-2.5 transition-colors ${
          isActive ? "bg-emerald-50/60" : "hover:bg-emerald-50/30"
        }`}
        data-testid={`desktop-match-list-${row.matchId}`}
      >
        <span
          className="shrink-0 h-9 w-9 rounded-xl bg-cover bg-center"
          style={{
            backgroundImage: `url(${heroImage})`,
            boxShadow: isRec
              ? "inset 0 0 0 2px #f59e0b"
              : "inset 0 0 0 2px #10b981",
          }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3
              className="text-[12.5px] font-black text-slate-900 truncate flex-1"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              {row.projectName}
            </h3>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${sourceClass}`}
            >
              {isRec ? "Recommended" : "Matched"}
            </span>
            {row.projectLocation && (
              <span className="text-[10.5px] text-slate-500 truncate">
                {row.projectLocation}
              </span>
            )}
          </div>
          {row.projectType && (
            <div className="mt-1 text-[11px] text-slate-500 truncate">
              {row.projectType}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

function DesktopEmptyState() {
  return (
    <div className="bg-white border border-amber-100 rounded-3xl shadow-sm px-6 py-12 text-center max-w-2xl mx-auto">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-white"
        style={{ background: "linear-gradient(135deg, #6ee7b7, #10b981)" }}
      >
        <Handshake className="w-10 h-10" />
      </div>
      <h3
        className="text-[20px] font-extrabold text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        No matches yet
      </h3>
      <p className="mt-2 text-[13.5px] text-slate-500 max-w-[360px] mx-auto leading-relaxed">
        Mutual right-swipes show up here. Keep swiping on jobs and
        responding to incoming interest to fill this list.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link
          href="/tradesman/jobs"
          className="px-4 py-2 rounded-full text-[12.5px] font-extrabold text-emerald-700 border-2 border-emerald-200 hover:border-emerald-400"
        >
          Browse jobs
        </Link>
        <Link
          href="/tradesman/leads"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700"
        >
          Open incoming interest
        </Link>
      </div>
    </div>
  );
}
