// web/pages/tradesman/jobs.tsx
//
// Mobile-first swipe deck for builders — /tradesman/jobs.
// Bare layout (no site chrome); mirrors the homeowner swipe deck at /projects/[id].
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useMobileMenu } from "@/utils/mobileMenu";
import { useSseEvent } from "@/utils/useSseEvent";
import TradesmanOnly from "@/components/TradesmanOnly";
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
    ownerFirstName: item.ownerFirstName ?? null,
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

  useEffect(() => {
    if (!router.isReady) return;
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
  }, [router.isReady, router.query.focus]);

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
          className="fixed inset-0 overflow-y-auto"
          data-testid="tradesman-jobs-deck"
          style={{
            background:
              "linear-gradient(160deg, #ecfdf5 0%, #d1fae5 40%, #f0fdf4 100%)",
            paddingBottom: "env(safe-area-inset-bottom)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          {/* Safe-area top spacer */}
          <div style={{ height: "env(safe-area-inset-top)" }} />

          {/* New-job toast */}
          {toast && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-emerald-600 text-white text-[12px] font-bold shadow-lg pointer-events-none">
              {toast}
            </div>
          )}

          {/* Top bar */}
          <div className="px-4 pt-2 pb-3 flex items-center justify-between">
            {/* Title + badge */}
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-extrabold tracking-tight text-gray-900">
                Jobs near you
              </span>
              {remaining > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold">
                  {remaining} new
                </span>
              )}
            </div>

            {/* Hamburger / menu */}
            <button
              type="button"
              aria-label="Open menu"
              onClick={openMenu}
              className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm"
              style={{ backdropFilter: "blur(8px)" }}
            >
              <span className="text-[20px] leading-none text-gray-700">☰</span>
            </button>
          </div>

          {/* Card N of M hint */}
          {!loading && !error && jobs.length > 0 && (
            <div className="text-center text-[12px] font-semibold text-emerald-700 mb-1">
              Card {Math.min(jobs.length - remaining + 1, jobs.length)} of{" "}
              {jobs.length}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center pt-24">
              <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                Loading jobs…
              </span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="mx-4 mt-6 rounded-2xl bg-white/80 px-4 py-5 text-center text-[13px] text-rose-600 font-semibold shadow-sm">
              {error}
            </div>
          )}

          {/* Deck */}
          {!loading && !error && (
            <div className="px-4">
              <JobSwipeDeck
                jobs={jobs}
                noJobsYet={noJobsYet}
                onConsumed={() => setRemaining((n) => Math.max(0, n - 1))}
              />
            </div>
          )}
        </main>
      </>
    </TradesmanOnly>
  );
}
