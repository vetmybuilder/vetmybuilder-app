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
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import JobListRow, { type JobListRowData } from "@/components/tradesmen/JobListRow";

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

  // ── infinite scroll sentinels ─────────────────────────────────────────────
  // Mobile and desktop render separate scrollable surfaces, so each
  // viewport gets its own sentinel. IntersectionObserver only fires for
  // visible elements - the off-viewport sentinel (display:none under
  // md:hidden / hidden md:block) is silently ignored.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const sentinelDesktopRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || loading || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fetchPage(allItems.length, builderTradesRef.current);
        }
      },
      { rootMargin: "200px" },
    );
    if (sentinelRef.current) io.observe(sentinelRef.current);
    if (sentinelDesktopRef.current) io.observe(sentinelDesktopRef.current);
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

        {/* MOBILE - full-bleed app shell with the page's own top bar.
            Untouched from the existing build. */}
        <main
          className="md:hidden fixed inset-0 flex flex-col overflow-hidden"
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
                      onOpen={(pid) =>
                        router.push(`/tradesman/jobs?focus=${pid}`)
                      }
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

        {/* DESKTOP - V3 layout: cream + watermark, sticky filter rail
            on the left, compact rows on the right. Reuses the same
            search / chip / pagination state as mobile. */}
        <div
          className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden"
          data-testid="tradesman-jobs-list"
        >
          <SiteHeader />
          <BrandWatermarkScatter />

          <div className="mx-auto max-w-6xl px-6 pb-12 relative z-10">
            {/* Title block */}
            <div className="text-center pt-6 pb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
                Jobs near you
              </div>
              <h1
                className="text-[26px] font-black tracking-tight text-slate-900 leading-tight"
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

            <div className="grid md:grid-cols-[280px_1fr] gap-6">
              {/* LEFT RAIL — sticky filters */}
              <aside>
                <div className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm sticky top-6">
                  <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-1.5">
                    Filter
                  </div>
                  <h2
                    className="text-[17px] font-black text-slate-900 leading-tight mb-3"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    Narrow the list
                  </h2>

                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-full text-[12.5px] outline-none focus:border-emerald-400"
                    placeholder="🔍 Search title or area"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={commitSearch}
                  />

                  <div className="mt-4">
                    <div className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-1.5">
                      My focus
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CHIPS.map(({ id, label }) => {
                        const active = activeChip === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setActiveChip(id)}
                            data-testid={`chip-${id}`}
                            className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold border transition-colors ${
                              active
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-4 w-full text-[12px] font-bold text-emerald-700 underline"
                  >
                    Clear all
                  </button>
                </div>
              </aside>

              {/* MAIN COLUMN */}
              <main>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="text-[12px] font-bold text-slate-500">
                    {filteredItems.length} of {total} jobs match
                  </div>
                </div>

                {loading && allItems.length === 0 && (
                  <div className="bg-white border border-amber-100 rounded-2xl shadow-sm flex items-center justify-center py-16">
                    <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                      Loading jobs…
                    </span>
                  </div>
                )}

                {!loading && error && (
                  <div className="bg-white border border-rose-200 rounded-2xl shadow-sm px-5 py-4 text-[13px] text-rose-600 font-semibold">
                    {error}
                  </div>
                )}

                {!loading && !error && filteredItems.length === 0 && (
                  <div className="bg-white border border-amber-100 rounded-2xl shadow-sm px-5 py-8 text-center">
                    <p className="text-[13px] font-semibold text-slate-500">
                      No jobs match your filters.
                    </p>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="mt-2 text-[12px] font-bold text-emerald-700 underline"
                    >
                      Try clearing filters
                    </button>
                  </div>
                )}

                {!error && filteredItems.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {filteredItems.map((job) => (
                      <DesktopJobRow
                        key={job.projectId}
                        data={job}
                        highlight={newRowIds.has(job.projectId)}
                        onOpen={() =>
                          router.push(
                            `/tradesman/jobs?focus=${job.projectId}`,
                          )
                        }
                      />
                    ))}

                    {loading && allItems.length > 0 && (
                      <div className="text-center py-3 text-[12px] font-semibold text-emerald-600 animate-pulse">
                        Loading more…
                      </div>
                    )}

                    {!hasMore && allItems.length > 0 && (
                      <div className="text-center py-3 text-[11.5px] text-slate-400">
                        That&rsquo;s everything for now.
                      </div>
                    )}

                    <div ref={sentinelDesktopRef} aria-hidden className="h-1" />
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>

        {/* Paygate is mounted by /tradesman/jobs (the deck) on right-
            swipe of a paywalled card. The list view just routes to
            the focused deck on row tap; the deck owns the paygate
            UX, so no need to mount it here. */}
      </>
    </TradesmanOnly>
  );
}

// Compact V3-style row used by the desktop layout. Shares the same data
// shape as JobListRow so the page can flip between treatments without
// shaping data twice.
function DesktopJobRow({
  data,
  highlight,
  onOpen,
}: {
  data: JobListRowData;
  highlight: boolean;
  onOpen: () => void;
}) {
  const aiScore = data.aiScore ?? 0;
  const scoreColor =
    aiScore >= 80
      ? "text-emerald-700 bg-emerald-50"
      : aiScore >= 60
        ? "text-amber-700 bg-amber-50"
        : "text-slate-500 bg-slate-100";

  const swipePill = data.swipeStateLabel
    ? swipePillClasses(data.swipeStateLabel)
    : null;

  const isLowScore = (data.aiScore ?? 101) < 60;
  // The row is a `<div role="button">` rather than a `<button>` so we
  // can nest a real button inside for "Open in deck" without breaking
  // HTML's no-button-in-button rule. Click anywhere on the row body
  // opens the detail sheet (existing UX); the dedicated trailing
  // button bypasses the sheet and routes straight to the focused deck,
  // matching the mobile JobListRow affordance.
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
      data-testid={`job-list-row-${data.projectId}`}
      className={`w-full text-left cursor-pointer bg-white border rounded-xl px-4 py-3 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex items-center gap-3 ${
        highlight ? "border-emerald-300 bg-emerald-50/30" : "border-amber-100"
      }${isLowScore ? " opacity-65" : ""}`}
    >
      <div
        className={`shrink-0 w-11 h-11 rounded-full flex flex-col items-center justify-center font-black ${scoreColor}`}
      >
        <div className="text-[13px] leading-none">{aiScore}</div>
        <div className="text-[7.5px] font-bold uppercase opacity-70">match</div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            className="text-[13.5px] font-black text-slate-900 truncate"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {data.title}
          </h3>
          {swipePill && (
            <span
              className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold ${swipePill}`}
            >
              {data.swipeStateLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500">
          <span>{data.location || "—"}</span>
          {data.type && (
            <>
              <span>·</span>
              <span className="truncate">{data.type}</span>
            </>
          )}
          {data.propertyType && (
            <>
              <span>·</span>
              <span>{data.propertyType}{data.bedrooms != null ? `, ${data.bedrooms} bed` : ""}</span>
            </>
          )}
        </div>
      </div>

      {data.budget && (
        <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-extrabold">
          {data.budget}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        data-testid={`open-in-deck-${data.projectId}`}
        className="shrink-0 text-[12px] font-extrabold text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors"
      >
        Open in deck →
      </button>
    </div>
  );
}

function swipePillClasses(label: string): string {
  switch (label) {
    case "Matched":
      return "bg-emerald-100 text-emerald-800";
    case "Pending your match":
      return "bg-amber-50 text-amber-800";
    case "Awaiting homeowner":
      return "bg-indigo-50 text-indigo-700";
    case "You declined":
    case "Homeowner passed":
    case "Expired":
      return "bg-gray-100 text-gray-500";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
