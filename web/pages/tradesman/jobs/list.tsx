// web/pages/tradesman/jobs/list.tsx
//
// Mobile-first browse view for tradesman jobs — /tradesman/jobs/list.
// Bare layout (no site chrome). Filter bar + scrollable list of JobListRow.
// NO contact button anywhere — the only per-row affordance is "Open in deck →".

import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useMobileMenu } from "@/utils/mobileMenu";
import { useSseEvent } from "@/utils/useSseEvent";
import TradesmanOnly from "@/components/TradesmanOnly";
import JobListRow, { type JobListRowData } from "@/components/tradesmen/JobListRow";
import JobDetailsSheet from "@/components/tradesmen/JobDetailsSheet";

// ─── types ──────────────────────────────────────────────────────────────────

type RawJob = {
  projectId?: number;
  id?: number;
  title?: string;
  name?: string;
  type?: string;
  location?: string;
  budget?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  trades?: string[];
  postedAt?: string | null;
  createdAt?: string | null;
  aiScore?: number | null;
  swipeStateLabel?: string | null;
  matchId?: number | null;
};

// Budget buckets considered "£15k+", used by the £15k+ filter chip.
const HIGH_BUDGET_PREFIXES = ["£15k", "£30k", "£60k"];

// Infinite-scroll page size — first 10 render immediately, then the
// IntersectionObserver fetches the next 10 as the sentinel approaches.
const PAGE_SIZE = 10;

// ─── helpers ─────────────────────────────────────────────────────────────────

function toListRow(item: RawJob, builderTrades: string[]): JobListRowData {
  const projectTrades: string[] =
    Array.isArray(item.trades) && item.trades.length > 0
      ? item.trades
      : item.type
        ? [item.type]
        : [];

  const builderSet = new Set(builderTrades.map((t) => t.toLowerCase()));
  const matchedTrades = projectTrades.filter((t) =>
    builderSet.has(t.toLowerCase()),
  );

  return {
    projectId: item.projectId ?? item.id ?? 0,
    title: item.title ?? item.name ?? "Untitled job",
    type: item.type ?? "",
    location: item.location ?? "",
    budget: item.budget ?? null,
    propertyType: item.propertyType ?? null,
    bedrooms: item.bedrooms ?? null,
    trades: projectTrades,
    matchedTrades,
    postedAt: item.postedAt ?? item.createdAt ?? new Date().toISOString(),
    aiScore: item.aiScore ?? null,
    swipeStateLabel: item.swipeStateLabel ?? null,
    matchId: item.matchId ?? null,
  };
}

// ─── filter types ────────────────────────────────────────────────────────────

type FilterChip = "all" | "within5mi" | "£15k+" | "my-trades" | "new-today";

// ─── component ───────────────────────────────────────────────────────────────

export default function TradesmanJobsListPage() {
  const api = useApi();
  const router = useRouter();
  const { openMenu } = useMobileMenu();

  // Bottom-sheet state. `openSheetForId` holds the projectId of the row
  // the sheet is currently showing details for; null = closed. The sheet
  // also needs to know whether the builder is currently subscribed to
  // pick the right engagement panel (subscriber vs dual-CTA).
  const [openSheetForId, setOpenSheetForId] = useState<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/subscriptions/me")
      .then((r) => {
        if (!cancelled) setIsSubscribed(!!r.data?.subscription);
      })
      .catch(() => {
        if (!cancelled) setIsSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Raw items from the API (unfiltered)
  const [allItems, setAllItems] = useState<JobListRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // Builder's own trade_types (for "My trades" filter)
  const [builderTrades, setBuilderTrades] = useState<string[]>([]);
  const builderTradesRef = useRef<string[]>([]);

  // SSE: IDs of recently-added rows — highlighted briefly with bg-emerald-50
  const [newRowIds, setNewRowIds] = useState<Set<number>>(new Set());

  // Filter chip state (single-select / radio)
  const [activeChip, setActiveChip] = useState<FilterChip>("all");

  // Search input (committed on Enter or blur)
  const [searchInput, setSearchInput] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");

  // Cancel / ignore stale responses (search recommit causes overlapping requests)
  const reqSeqRef = useRef(0);

  // ── paged fetch helper ────────────────────────────────────────────────────
  // Single source of truth for hitting /api/tradesmen/jobs. Replaces the
  // bottom of the list when offset === 0, appends otherwise.
  async function fetchPage(offset: number, trades: string[]) {
    const mySeq = ++reqSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (committedSearch.trim()) q.set("q", committedSearch.trim());

      const { data } = await api.get(`/api/tradesmen/jobs?${q.toString()}`);
      if (mySeq !== reqSeqRef.current) return;

      const rawItems: RawJob[] = data?.items ?? data?.jobs ?? [];
      const nextItems = rawItems.map((item) => toListRow(item, trades));
      const nextTotal = Number(data?.total ?? 0);

      setAllItems((prev) => {
        const merged = offset === 0 ? nextItems : [...prev, ...nextItems];
        setTotal(nextTotal);
        setHasMore(merged.length < nextTotal);
        return merged;
      });
    } catch (e: any) {
      if (mySeq !== reqSeqRef.current) return;
      setError(
        e?.response?.data?.error || e?.message || "Failed to load jobs",
      );
      if (offset === 0) {
        setAllItems([]);
        setHasMore(false);
      }
    } finally {
      if (mySeq === reqSeqRef.current) setLoading(false);
    }
  }

  // ── initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meRes = await api.get("/api/tradesmen/me").catch(() => null);
        if (!alive) return;

        const meData = meRes?.data ?? null;
        const rawTrades =
          meData?.profile?.trade_types ??
          meData?.trade_types ??
          meData?.tradeTypes ??
          null;
        const trades: string[] = Array.isArray(rawTrades)
          ? rawTrades.map(String)
          : typeof rawTrades === "string"
            ? rawTrades.split(",").map((s) => s.trim()).filter(Boolean)
            : [];

        setBuilderTrades(trades);
        builderTradesRef.current = trades;

        await fetchPage(0, trades);
      } catch (e: any) {
        if (alive) {
          setError(
            e?.response?.data?.error || e?.message || "Failed to load jobs",
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── re-fetch when search is committed (resets to page 1) ─────────────────
  const didFirstSearchSkip = useRef(false);
  useEffect(() => {
    if (!didFirstSearchSkip.current) {
      didFirstSearchSkip.current = true;
      return;
    }
    setAllItems([]);
    setHasMore(true);
    fetchPage(0, builderTradesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSearch]);

  // ── SSE: real-time new project notifications ───────────────────────────────
  useSseEvent<{ projectId: number }>(
    "new_project_match",
    async () => {
      // Refetch page 1 and prepend any new rows.
      try {
        const q = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: "0",
        });
        if (committedSearch.trim()) q.set("q", committedSearch.trim());
        const { data } = await api.get(`/api/tradesmen/jobs?${q.toString()}`);
        const rawItems: RawJob[] = data?.items ?? data?.jobs ?? [];
        const refreshed = rawItems.map((item) =>
          toListRow(item, builderTradesRef.current),
        );
        setAllItems((prev) => {
          const existingIds = new Set(prev.map((j) => j.projectId));
          const added = refreshed.filter((j) => !existingIds.has(j.projectId));
          if (added.length === 0) return prev;
          const addedIds = added.map((j) => j.projectId);
          setNewRowIds((prev) => new Set([...prev, ...addedIds]));
          setTimeout(() => {
            setNewRowIds((prev) => {
              const next = new Set(prev);
              for (const id of addedIds) next.delete(id);
              return next;
            });
          }, 2000);
          return [...added, ...prev];
        });
      } catch {
        /* ignore */
      }
    },
    !loading,
  );

  // ── client-side filtering ─────────────────────────────────────────────────
  const filteredItems = useMemo<JobListRowData[]>(() => {
    switch (activeChip) {
      case "all":
        return allItems;

      case "within5mi":
        // TODO: proper distance filtering requires geocoded project lat/lng — out of scope here.
        // When the builder has typed a postcode in the search input, we pass `near` to the backend
        // (handled via committedSearch → `q` param). Without lat/lng per-row we cannot filter
        // client-side, so this chip shows all items as-is.
        return allItems;

      case "£15k+":
        return allItems.filter(
          (j) =>
            j.budget != null &&
            HIGH_BUDGET_PREFIXES.some((p) => j.budget!.startsWith(p)),
        );

      case "my-trades": {
        const builderSet = new Set(builderTrades.map((t) => t.toLowerCase()));
        return allItems.filter((j) =>
          j.trades.some((t) => builderSet.has(t.toLowerCase())),
        );
      }

      case "new-today": {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        return allItems.filter(
          (j) => new Date(j.postedAt).getTime() >= cutoff,
        );
      }

      default:
        return allItems;
    }
  }, [allItems, activeChip, builderTrades]);

  // ── handlers ──────────────────────────────────────────────────────────────

  function commitSearch() {
    if (searchInput !== committedSearch) {
      setCommittedSearch(searchInput);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitSearch();
  }

  function resetFilters() {
    setActiveChip("all");
    setSearchInput("");
    setCommittedSearch("");
  }

  // ── infinite scroll sentinel ──────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!hasMore || loading || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fetchPage(allItems.length, builderTradesRef.current);
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, error, allItems.length]);

  // ── chip definitions ───────────────────────────────────────────────────────

  const CHIPS: { id: FilterChip; label: string }[] = [
    { id: "all", label: "All" },
    { id: "within5mi", label: "Within 5mi" },
    { id: "£15k+", label: "£15k+" },
    { id: "my-trades", label: "My trades" },
    { id: "new-today", label: "New today" },
  ];

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <TradesmanOnly>
      <>
        <Head>
          <title>Browse jobs • VetMyBuilder</title>
        </Head>

        <main
          className="fixed inset-0 flex flex-col overflow-hidden"
          data-testid="tradesman-jobs-list"
          style={{
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          {/* Safe-area top spacer */}
          <div style={{ height: "env(safe-area-inset-top)" }} />

          {/* ── Top bar ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white border-b border-gray-100 shrink-0">
            <span className="text-[15px] font-extrabold text-gray-900 flex-1">
              Browse jobs
            </span>
            <button
              type="button"
              aria-label="Open menu"
              onClick={openMenu}
              className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center"
            >
              <span className="text-[16px] leading-none text-gray-900">☰</span>
            </button>
          </div>

          {/* ── Filter bar ───────────────────────────────────────────────── */}
          <div className="bg-white border-b border-gray-100 px-3 pt-2.5 pb-2 shrink-0">
            {/* Search input */}
            <input
              type="text"
              className="w-full px-3 py-2 bg-gray-100 rounded-full text-[12.5px] text-gray-500 outline-none"
              placeholder="🔍 Search jobs by title or area"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={commitSearch}
              data-testid="list-search-input"
            />

            {/* Chip row */}
            <div
              className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5"
              style={{ scrollbarWidth: "none" }}
              data-testid="filter-chip-row"
            >
              {CHIPS.map(({ id, label }) => {
                const isActive = activeChip === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveChip(id)}
                    data-testid={`chip-${id}`}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors${
                      isActive
                        ? " border-emerald-500 bg-emerald-50 text-emerald-700"
                        : " border-zinc-200 bg-white text-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── List body ────────────────────────────────────────────────── */}
          <div
            className="flex-1 overflow-y-auto bg-stone-50"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            data-testid="jobs-list-body"
          >
            {/* Initial loading (subsequent pages use the inline "Loading more…" below) */}
            {loading && allItems.length === 0 && (
              <div className="flex items-center justify-center pt-16">
                <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                  Loading jobs…
                </span>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div
                className="mx-3 mt-3 rounded-xl bg-white px-4 py-4 text-[13px] text-rose-600 font-semibold border border-rose-100"
                role="alert"
                data-testid="list-error"
              >
                {error}
              </div>
            )}

            {/* Empty state — only after the first page has resolved */}
            {!loading && !error && filteredItems.length === 0 && (
              <div
                className="mx-3 mt-3 rounded-xl bg-white px-4 py-5 text-center border border-gray-100"
                data-testid="list-empty"
              >
                <p className="text-[13px] font-semibold text-gray-500">
                  No jobs match your filters.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-2 text-[12px] font-bold text-emerald-700 underline"
                  data-testid="list-clear-filters"
                >
                  Try clearing filters
                </button>
              </div>
            )}

            {/* Job rows */}
            {!error && (
              <div className="mx-3 mt-3 flex flex-col gap-2 pb-4" data-testid="jobs-rows">
                {filteredItems.map((job) => (
                  <div
                    key={job.projectId}
                    className={`rounded-xl transition-colors duration-[2000ms] ${
                      newRowIds.has(job.projectId) ? "bg-emerald-50" : "bg-transparent"
                    }`}
                  >
                    <JobListRow
                      data={job}
                      onOpen={(pid) => setOpenSheetForId(pid)}
                    />
                  </div>
                ))}

                {loading && allItems.length > 0 && (
                  <div
                    className="text-center py-3 text-[12px] font-semibold text-emerald-600 animate-pulse"
                    data-testid="jobs-loading-more"
                  >
                    Loading more…
                  </div>
                )}

                <div ref={sentinelRef} aria-hidden className="h-1" />
              </div>
            )}
          </div>
        </main>

        <JobDetailsSheet
          open={openSheetForId != null}
          subject={(() => {
            if (openSheetForId == null) return null;
            const job = filteredItems.find(
              (j) => j.projectId === openSheetForId,
            );
            if (!job) return null;
            return {
              projectId: job.projectId,
              title: job.title,
              homeownerFirstName: null,
            };
          })()}
          isSubscribed={isSubscribed}
          onClose={() => setOpenSheetForId(null)}
          onSubscribe={() => {
            setOpenSheetForId(null);
            router.push("/tradesman/billing");
          }}
          onPitch={async (projectId) => {
            // Mock checkout activates the unlock immediately; in real
            // Stripe mode we'd be redirected to hosted checkout. Once
            // unlocked, drop the builder into the unified chat thread.
            try {
              const res = await api.post(
                `/api/projects/${projectId}/unlock-contact/checkout`,
                {},
              );
              setOpenSheetForId(null);
              // Already-active unlock - go straight to chat using the
              // matchId in the response.
              if (res.data?.alreadyUnlocked && res.data?.matchId) {
                router.push(`/chat/${res.data.matchId}`);
                return;
              }
              const url = res.data?.url || res.data?.hosted_url;
              const sessionId = res.data?.sessionId;
              const isMock = String(url || "").includes("/payments/mock/");
              if (isMock && sessionId) {
                await api.post("/api/payments/mock/pay", { sessionId });
                let matchId: number | string | undefined;
                try {
                  const lookup = await api.post(
                    `/api/projects/${projectId}/unlock-contact/checkout`,
                    {},
                  );
                  matchId = lookup.data?.matchId;
                } catch {
                  /* fall through */
                }
                if (matchId) {
                  router.push(`/chat/${matchId}`);
                } else {
                  // eslint-disable-next-line no-console
                  console.warn("Could not resolve matchId after paid unlock");
                  router.push("/tradesman/jobs/list");
                }
                return;
              }
              if (url) {
                window.location.href = url;
              }
            } catch (err: any) {
              if (
                err?.response?.status === 409 &&
                err?.response?.data?.alreadySubscribed
              ) {
                // Subscriber slipped through (e.g. cached state). Pivot
                // them to the swipe deck rather than failing silently.
                setIsSubscribed(true);
                setOpenSheetForId(null);
                router.push(`/tradesman/jobs?focus=${projectId}`);
                return;
              }
              alert(
                err?.response?.data?.error ||
                  err?.message ||
                  "Couldn't start unlock. Please try again.",
              );
            }
          }}
          onSwipe={(projectId) => {
            setOpenSheetForId(null);
            router.push(`/tradesman/jobs?focus=${projectId}`);
          }}
        />
      </>
    </TradesmanOnly>
  );
}
