// web/pages/tradesman/jobs.tsx
//
// Mobile-first swipe deck for builders — /tradesman/jobs.
// Bare layout (no site chrome); mirrors the homeowner swipe deck at /projects/[id].
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { MoreHorizontal } from "lucide-react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useMobileMenu } from "@/utils/mobileMenu";
import { useSseEvent } from "@/utils/useSseEvent";
import TradesmanOnly from "@/components/TradesmanOnly";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import JobSwipeDeck from "@/components/tradesmen/JobSwipeDeck";
import type { JobCardData } from "@/components/tradesmen/JobCard";

/** Map a raw deck item + builder trade_types → JobCardData */
function toCardData(item: any, builderTrades: string[]): JobCardData {
  const projectTrades: string[] =
    Array.isArray(item.trades) && item.trades.length > 0
      ? item.trades
      : item.type
        ? [item.type]
        : [];

  const builderSet = new Set(
    builderTrades.map((t: string) => t.toLowerCase()),
  );
  const matchedTrades = projectTrades.filter((t) =>
    builderSet.has(t.toLowerCase()),
  );

  return {
    projectId: item.projectId ?? item.id,
    title: item.title ?? item.name ?? "Untitled job",
    type: item.type ?? "",
    location: item.location ?? "",
    distanceMiles: item.distanceMiles ?? undefined,
    budget: item.budget ?? null,
    propertyType: item.propertyType ?? null,
    bedrooms: item.bedrooms ?? null,
    description: item.description ?? "",
    trades: projectTrades,
    matchedTrades,
    postedAt: item.postedAt ?? item.createdAt ?? new Date().toISOString(),
    aiScore: item.aiScore ?? null,
    priceBandEstimate: item.priceBandEstimate ?? null,
    answersJson: item.answersJson ?? null,
    aiSummary: item.aiSummary ?? null,
    aiKeyConcerns: Array.isArray(item.aiKeyConcerns) ? item.aiKeyConcerns : [],
  };
}

export default function TradesmanJobsDeckPage() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { openMenu } = useMobileMenu();

  const [jobs, setJobs] = useState<JobCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // remaining count after swipes (starts at jobs.length, decremented per swipe)
  const [remaining, setRemaining] = useState(0);
  // True when there are zero live projects in the system at all - drives a
  // different empty-state copy than the regular "you've swiped everything".
  const [noJobsYet, setNoJobsYet] = useState(false);
  // Toast message for new project arrivals
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep builder trades in a ref for SSE callback (avoid stale closure)
  const builderTradesRef = useRef<string[]>([]);
  // Top card surfaced by the deck - mirrored into the desktop left rail.
  const [topJob, setTopJob] = useState<JobCardData | null>(null);

  useEffect(() => {
    // Wait for both the router AND Firebase auth before firing. Without
    // the auth guard the request goes out with no Bearer token, the
    // server 401s, and the page silently shows the "No jobs posted yet"
    // empty state — even when the API would have returned a card.
    if (!router.isReady || authLoading || !user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch builder's own trades so we can compute matchedTrades per card
        const [deckRes, meRes] = await Promise.allSettled([
          api.get("/api/tradesmen/jobs?mode=deck&limit=20"),
          api.get("/api/tradesmen/me"),
        ]);

        if (!alive) return;

        const deckData =
          deckRes.status === "fulfilled" ? deckRes.value.data : null;
        const meData =
          meRes.status === "fulfilled" ? meRes.value.data : null;

        // Builder's trade_types — MySQL stores it as a CSV string;
        // /api/tradesmen/me may return it as that string, an array, or null.
        const rawTrades =
          meData?.profile?.trade_types ??
          meData?.trade_types ??
          meData?.tradeTypes ??
          null;
        const builderTrades: string[] = Array.isArray(rawTrades)
          ? rawTrades.map(String)
          : typeof rawTrades === "string"
            ? rawTrades.split(",").map((s) => s.trim()).filter(Boolean)
            : [];

        const rawItems: any[] = deckData?.items ?? deckData?.jobs ?? [];
        let cards = rawItems.map((item) => toCardData(item, builderTrades));

        // Honour ?focus=N from /tradesman/jobs/list — when the builder taps
        // "Open in deck →" on a list row we want THAT job on top of the
        // stack, not whatever the AI score order happens to put first.
        const focusRaw = router.query.focus;
        const focusId = Number(
          Array.isArray(focusRaw) ? focusRaw[0] : focusRaw,
        );
        if (Number.isFinite(focusId) && focusId > 0) {
          const idx = cards.findIndex((c) => c.projectId === focusId);
          if (idx > 0) {
            cards = [cards[idx], ...cards.slice(0, idx), ...cards.slice(idx + 1)];
          }
        }

        setJobs(cards);
        setRemaining(cards.length);
        setNoJobsYet((deckData?.totalLive ?? 0) === 0);
        builderTradesRef.current = builderTrades;
      } catch (e: any) {
        if (alive) {
          setError(
            e?.response?.data?.error || e?.message || "Failed to load jobs",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.focus, authLoading, user?.uid]);

  // ── SSE: listen for new project matches ────────────────────────────────────
  useSseEvent<{ projectId: number; projectName: string; projectType: string; location: string }>(
    "new_project_match",
    async (data) => {
      // Refetch the deck and merge in any new cards
      try {
        const deckRes = await api.get("/api/tradesmen/jobs?mode=deck&limit=20");
        const rawItems: any[] = deckRes.data?.items ?? deckRes.data?.jobs ?? [];
        const newCards = rawItems.map((item) =>
          toCardData(item, builderTradesRef.current),
        );
        setJobs((prev) => {
          const existingIds = new Set(prev.map((c) => c.projectId));
          const added = newCards.filter((c) => !existingIds.has(c.projectId));
          if (added.length === 0) return prev;
          // Append new cards at the BOTTOM of the stack so the current top is undisturbed
          return [...prev, ...added];
        });
      } catch {
        /* ignore refetch errors */
      }
      // Show toast
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(`New job posted — just added`);
      toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    },
    !loading,
  );

  return (
    <TradesmanOnly>
      <>
        <Head>
          <title>Jobs near you • VetMyBuilder</title>
        </Head>

        <main
          className="fixed inset-0 overflow-y-auto no-scrollbar bg-[#dde7d2] md:bg-[#fef6e9] flex flex-col md:block"
          data-testid="tradesman-jobs-deck"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          {/* Desktop SiteHeader sits at the top of the scroll container.
              `position: sticky` inside an overflow-y-auto ancestor pins it
              to the viewport top without colliding with the mobile
              fixed-inset shell (which doesn't render this branch). */}
          <div className="hidden md:block">
            <SiteHeader />
          </div>

          {/* VMB watermark scatter - desktop only (component is md:block) */}
          <BrandWatermarkScatter />

          {/* Safe-area top spacer */}
          <div style={{ height: "env(safe-area-inset-top)" }} />

          {/* New-job toast */}
          {toast && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-600 text-white text-[12px] font-bold shadow-lg pointer-events-none">
              {toast}
            </div>
          )}

          {/* Mobile top bar — same shape as the homeowner project view:
              centered page title + "..." more-menu icon on the right. In
              flex flow above the deck (no absolute overlay), so the
              composition matches the homeowner side. */}
          <div className="md:hidden px-4 pt-2 pb-3 flex items-center justify-between">
            {/* Left spacer to keep the title centred (no back button on
                /tradesman/jobs since it's a top-level destination). */}
            <span className="w-10 h-10 shrink-0" aria-hidden />

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] font-extrabold tracking-tight text-gray-900 truncate">
                Jobs near you
              </span>
              {remaining > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold shrink-0">
                  {remaining} new
                </span>
              )}
            </div>

            <button
              type="button"
              aria-label="More options"
              onClick={openMenu}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"
            >
              <MoreHorizontal className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          {/* Desktop title block — mirrors the homeowner shortlist
              header. Hidden on mobile in favour of the compact top bar. */}
          <div className="hidden md:block text-center pt-6 pb-4 relative z-10">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
              Jobs near you
            </div>
            <h1
              className="text-[22px] font-black tracking-tight text-slate-900 leading-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Pick your{" "}
              <span
                className="text-emerald-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
              >
                next job
              </span>
            </h1>
          </div>

          {/* Card N of M hint — desktop only. Removed on mobile to keep
              the chrome minimal and match the homeowner project view. */}
          {!loading && !error && jobs.length > 0 && (
            <div className="hidden md:block text-center text-[12px] font-semibold text-emerald-700 mb-1 relative z-10">
              Card {Math.min(jobs.length - remaining + 1, jobs.length)} of{" "}
              {jobs.length}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center pt-24 relative z-10">
              <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                Loading jobs…
              </span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="mx-4 mt-6 rounded-2xl bg-white/80 px-4 py-5 text-center text-[13px] text-rose-600 font-semibold shadow-sm relative z-10">
              {error}
            </div>
          )}

          {/* Deck — edge-to-edge on mobile (flex-1 so it takes ALL
              remaining vertical space inside the flex-column main),
              two-column with job-detail rail on desktop. */}
          {!loading && !error && (
            <div className="md:px-0 md:mx-auto md:max-w-[900px] md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6 relative z-10 flex-1 min-h-0 md:flex-none flex flex-col md:block">
              <DesktopJobDetailRail job={topJob} />

              <div className="md:max-w-xl flex-1 min-h-0 md:min-h-[520px] md:h-[520px]">
                <JobSwipeDeck
                  jobs={jobs}
                  noJobsYet={noJobsYet}
                  onConsumed={() => setRemaining((n) => Math.max(0, n - 1))}
                  onTopChange={setTopJob}
                />
              </div>
            </div>
          )}
        </main>
      </>
    </TradesmanOnly>
  );
}

// Desktop-only left rail summarising the current top-of-deck job.
// Mirrors the homeowner shortlist's "LIVE JOB" card so the tradesman has
// the project context anchored beside the swipe deck instead of having
// to flip the card to read it.
function DesktopJobDetailRail({ job }: { job: JobCardData | null }) {
  if (!job) {
    return <aside className="hidden md:block" aria-hidden />;
  }

  const propertyLine = [
    job.propertyType,
    job.bedrooms != null ? `${job.bedrooms} bed` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const budget = job.budget || job.priceBandEstimate || null;
  const summary = job.aiSummary || job.description || null;

  return (
    <aside className="hidden md:block">
      <div className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm sticky top-6">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-1.5">
          This job
        </div>
        <h2
          className="text-[19px] font-black tracking-tight leading-tight text-slate-900"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {job.title}
        </h2>

        <div className="mt-3 space-y-2 text-[13px] text-slate-600">
          {job.location && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{"\u{1F4CD}"}</span>
              <span className="truncate">{job.location}</span>
            </div>
          )}
          {job.type && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{"\u{1F527}"}</span>
              <span className="truncate capitalize">{job.type}</span>
            </div>
          )}
          {propertyLine && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400">{"\u{1F3E0}"}</span>
              <span className="truncate">{propertyLine}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{"\u{1F464}"}</span>
            <span className="truncate">Posted by a homeowner</span>
          </div>
        </div>

        {budget && (
          <div className="mt-4 inline-flex items-center px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[12px] font-extrabold">
            {budget}
          </div>
        )}

        {job.aiScore != null && (
          <div className="mt-4">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-1">
              AI match
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                  style={{ width: `${Math.max(0, Math.min(100, job.aiScore))}%` }}
                />
              </div>
              <span className="text-[12px] font-extrabold text-slate-700">
                {job.aiScore}%
              </span>
            </div>
          </div>
        )}

        {job.matchedTrades.length > 0 && (
          <div className="mt-4">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-1.5">
              Your trades match
            </div>
            <div className="flex flex-wrap gap-1.5">
              {job.matchedTrades.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-extrabold capitalize"
                >
                  {t} {"✓"}
                </span>
              ))}
            </div>
          </div>
        )}

        {summary && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-1.5">
              Summary
            </div>
            <p className="text-[12.5px] text-slate-600 leading-relaxed line-clamp-6 whitespace-pre-line">
              {summary}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
