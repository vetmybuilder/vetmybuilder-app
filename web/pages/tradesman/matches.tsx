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
import BrandWordmark from "@/components/BrandWordmark";
import { Handshake, MessagesSquare, Sparkles, Star } from "lucide-react";

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

  const fetchMatches = useCallback(async () => {
    try {
      const res = await api.get<{ matches: TradesmanMatchRow[] }>(
        "/api/tradesman/matches",
      );
      const rows = Array.isArray(res.data?.matches) ? res.data.matches : [];
      setMatches(rows);
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

      <main
        className="fixed inset-0 bg-white overflow-y-auto text-gray-900"
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
          <BrandWordmark tone="emerald" />
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
  const initial = (row.homeownerFirstName || "?").charAt(0).toUpperCase();
  const isRec = row.source === "recommended";
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
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[18px] shrink-0"
          style={{
            background: isRec
              ? "linear-gradient(135deg, #fcd34d, #f59e0b)"
              : "linear-gradient(135deg, #6ee7b7, #10b981)",
          }}
          aria-hidden
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold tracking-tight text-gray-900 truncate">
            {row.homeownerFirstName}
          </div>
          <div className="mt-0.5 text-[12.5px] text-gray-600 truncate">
            {row.projectName}
          </div>
          {(row.projectType || row.projectLocation) && (
            <div className="mt-0.5 text-[11.5px] text-gray-400 truncate">
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
