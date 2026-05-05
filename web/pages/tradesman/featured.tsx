// web/pages/tradesman/featured.tsx
import * as React from "react";
import { useRouter } from "next/router";
import TradesmanOnly from "@/components/TradesmanOnly";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { useApi } from "@/utils/api";

type FeaturedTradesman = {
  builderId: string;
  publicId?: string | null;
  companyName: string | null;
  displayName: string | null;
  tier?: string | null;
  purchasedPlan?: string | null;
  avatarUrl?: string | null;
  gallery?: string[];
  stats?: {
    completed: number;
    photos: number;
    reviews: number;
    stars: number;
  };
  score?: number | null;
  location?: { outward?: string | null };
  badge?: string | null;
};

type ApiResponse = {
  items: FeaturedTradesman[];
  total: number;
  page: number;
  limit: number;
};

function FeaturedListInner() {
  const api = useApi();
  const router = useRouter();
  const projectId = Array.isArray(router.query.projectId)
    ? router.query.projectId[0]
    : router.query.projectId;

  const PAGE_SIZE = 20;

  const [items, setItems] = React.useState<FeaturedTradesman[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const fetchPage = React.useCallback(
    async (nextPage: number) => {
      try {
        setLoading(true);
        setErr(null);

        const params = new URLSearchParams({
          page: String(nextPage),
          limit: String(PAGE_SIZE),
          onlyGold: "true",
        });

        if (projectId) {
          params.set("projectId", String(projectId));
        }

        const res = await api.get<ApiResponse>(
          `/api/tradesmen/featured?${params.toString()}`
        );

        const data = res?.data ?? (res as any);
        const newItems = Array.isArray(data.items) ? data.items : [];
        const nextTotal = Number(data.total ?? newItems.length);
        setTotal(nextTotal);

        // Merge + sort by rank (score desc, then name A→Z)
        setItems((prev) => {
          const merged = nextPage === 1 ? newItems : [...prev, ...newItems];

          merged.sort((a, b) => {
            const sa = typeof a.score === "number" ? a.score : -Infinity;
            const sb = typeof b.score === "number" ? b.score : -Infinity;
            if (sb !== sa) return sb - sa;

            const nameA = (a.companyName || a.displayName || "").toLowerCase();
            const nameB = (b.companyName || b.displayName || "").toLowerCase();
            return nameA.localeCompare(nameB);
          });

          return merged;
        });

        // hasMore based on page * PAGE_SIZE vs total
        setHasMore(nextPage * PAGE_SIZE < nextTotal);
        setPage(nextPage);
      } catch (e: any) {
        console.error("[/tradesman/featured] fetch error", e);
        if (nextPage === 1) {
          setItems([]);
          setTotal(0);
        }
        setHasMore(false);
        setErr(e?.message || "Failed to load featured tradesmen");
      } finally {
        setLoading(false);
      }
    },
    [api, projectId]
  );

  // initial load
  React.useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // lazy-load on scroll
  React.useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis && hasMore && !loading) {
          fetchPage(page + 1);
        }
      },
      { rootMargin: "200px" }
    );

    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, page, fetchPage]);

  const handleBack = () => {
    // Go back to where the user came from (project list / project view)
    router.back();
  };

  const titleCount =
    total > 0
      ? `Showing top ${Math.min(
          items.length,
          total
        )} of ${total} featured tradesmen`
      : "Featured tradesmen";

  return (
    <div className="min-h-screen md:bg-[#fef6e9] relative overflow-hidden">
      <div className="hidden md:block">
        <SiteHeader />
      </div>
      <BrandWatermarkScatter />
      <div
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 relative z-10"
        data-testid="featured-tradesmen-page"
      >
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="hidden sm:inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
      >
        ← Back to Jobs
      </button>

      {/* Header text */}
      <h1 className="mb-4 text-sm sm:text-base font-medium text-slate-600">
        {titleCount}
      </h1>

      {err && (
        <p className="mb-4 text-sm text-rose-600" data-testid="featured-error">
          {err}
        </p>
      )}

      {/* List */}
      <div className="space-y-4">
        {items.map((t) => (
          <FeaturedRow
            key={t.builderId}
            item={t}
            onClick={() => router.push(`/tradesman/${t.publicId || t.builderId}`)}
          />
        ))}

        {loading && items.length === 0 && (
          <p className="text-sm text-slate-500">Loading featured tradesmen…</p>
        )}

        {!loading && items.length === 0 && !err && (
          <p className="text-sm text-slate-500">
            No featured tradesmen are available yet.
          </p>
        )}

        {/* sentinel for lazy-load */}
        <div ref={sentinelRef} />
      </div>
      </div>
    </div>
  );
}

function FeaturedRow({
  item,
  onClick,
}: {
  item: FeaturedTradesman;
  onClick: () => void;
}) {
  const name = item.companyName || item.displayName || "Tradesman";
  const area = item.location?.outward || "Area not set";
  const score = typeof item.score === "number" ? item.score.toFixed(0) : "—";
  const completed = item.stats?.completed ?? 0;
  const photos = item.stats?.photos ?? item.gallery?.length ?? 0;
  const likes = item.stats?.reviews ?? 0;

  // Use purchasedPlan (preferred), fall back to tier
  const planRaw =
    (item as any).purchasedPlan ?? (item.tier ? String(item.tier) : null);
  const planLabel = planRaw
    ? String(planRaw).trim().charAt(0).toUpperCase() +
      String(planRaw).trim().slice(1).toLowerCase()
    : null;

  const avatar =
    item.avatarUrl ||
    (Array.isArray(item.gallery) && item.gallery.length > 0
      ? item.gallery[0]
      : null);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-stretch gap-4 rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="h-20 w-24 overflow-hidden rounded-2xl bg-slate-200">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-600">
              {getInitials(name)}
            </div>
          )}
        </div>
      </div>

      {/* Middle content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base sm:text-lg font-semibold text-slate-900">
            {name}
          </span>
          {planLabel && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
              {planLabel}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{area}</span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>VMB score: {score}</span>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>Completed: {completed}</span>
          <span>Photos: {photos}</span>
          <span>Likes: {likes}</span>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col items-end justify-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
          Ranked by VMB score
        </span>
        <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm group-hover:bg-indigo-500">
          View profile
        </span>
      </div>
    </button>
  );
}

function getInitials(name: string) {
  if (!name) return "T";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

/* -------- outer auth wrapper -------- */

export default function FeaturedTradesmenPage() {
  return (
    <TradesmanOnly>
      <FeaturedListInner />
    </TradesmanOnly>
  );
}
