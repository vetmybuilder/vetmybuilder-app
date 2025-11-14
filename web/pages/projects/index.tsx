// web/pages/projects/index.tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ProjectTabKey } from "@/components/ProjectTabs";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import ProjectImageCard from "@/components/project/ProjectImageCard";
import ProjectInfoCard from "@/components/project/ProjectInfoCard";
import { useTradesmanLabels } from "@/hooks/useTradesmanLabels";
import CompletedProjectCard from "@/components/project/CompletedProjectCard";
import ProjectFilters, {
  type ProjectFiltersValue,
} from "@/components/filters/ProjectFilters";
import { FeaturedSimpleStrip } from "@/components/tradesmen/FeaturedSimpleCard";

type Status = "pending" | "live" | "completed" | "archived";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  status?: Status;
  completedAt?: string | null;
  archivedAt?: string | null;
  coverPhotoUrl?: string | null;
  _winnerRecommendationId?: number | string;
  _winnerTradesmanName?: string | null;
  _hasClosurePhotos?: 0 | 1 | boolean;
  hasClosurePhotos?: boolean | number | null;
  closurePhotoCount?: number | null;
};

type ApiList = {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
};

type FeaturedLite = {
  builderId: string;
  companyName: string | null;
  displayName: string | null;
  mainPhotoUrl?: string | null;
  // optional extra fields (not strictly needed but useful)
  avatarUrl?: string | null;
  gallery?: string[];
};

/* ===== Outer page: auth + gate ===== */
export default function ProjectsPage() {
  return (
    <AuthedOnly>
      <ProjectsGate />
    </AuthedOnly>
  );
}

/* Small component that decides where to send the user. */
function ProjectsGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "redirect">(
    "checking"
  );

  useEffect(() => {
    let alive = true;
    if (!router.isReady || authLoading) return;

    // Fast path: cached flag (set by header or prior checks)
    try {
      if (sessionStorage.getItem("vmb:isTradesman") === "1") {
        setStatus("redirect");
        router.replace("/tradesman/projects");
        return;
      }
    } catch {}

    // Authoritative path
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isT =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
        if (!alive) return;
        if (isT) {
          try {
            sessionStorage.setItem("vmb:isTradesman", "1");
          } catch {}
          setStatus("redirect");
          router.replace("/tradesman/projects");
          return;
        }
      } catch {
        // ignore: means not a tradesman or not provisioned yet
      }
      if (alive) setStatus("ok");
    })();

    return () => {
      alive = false;
    };
  }, [api, router, authLoading]);

  if (status === "redirect") {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  if (status !== "ok") {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return <OwnerProjects />;
}

/* ===== Helpers ===== */

const normalizeHookLabel = (v: unknown) => {
  const s = (typeof v === "string" ? v : "").trim();
  if (!s) return "";
  if (/^#\d+$/i.test(s)) return "";
  if (s === "—" || s === "=") return "";
  return s;
};

const hasGallery = (p: Project) => {
  const v =
    p.hasClosurePhotos ??
    p._hasClosurePhotos ??
    p.closurePhotoCount ??
    (p as any).photosCount ??
    0;
  return typeof v === "boolean" ? v : Number(v) > 0;
};

/* ===== Actual owner projects UI ===== */

function OwnerProjects() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // ---- Tab derived from URL (single source of truth) ----
  const [tab, setTab] = useState<ProjectTabKey>("mine");

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query?.tab;
    const t = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;

    const allowed: ProjectTabKey[] = [
      "mine",
      "archived",
      "completed",
      "completedCommunity",
      "recommended",
    ];
    const next: ProjectTabKey = allowed.includes(t as ProjectTabKey)
      ? (t as ProjectTabKey)
      : "mine";

    if (next !== tab) {
      setTab(next);
    }
  }, [router.isReady, router.query.tab, tab]);

  // ---- Filters ----
  const [chipType, setChipType] = useState<string>("");
  const [chipStatus, setChipStatus] = useState<string>("");
  useEffect(() => {
    setChipType("");
    setChipStatus("");
  }, [tab]);

  // Sorting
  const [sort, setSort] = useState<"createdAt" | "name">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Progressive loading
  const PAGE_SIZE = 12;
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setPage(1);
    setHasMore(true);
  }, [tab, chipType, chipStatus, sort, order]);

  async function fetchPage(p = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        sort,
        order,
        page: String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (chipType) params.set("type", chipType);
      if (chipStatus) params.set("status", chipStatus as any);

      const res = await api.get<ApiList>(`/api/projects?${params.toString()}`);
      const newItems = res.data.items ?? [];
      setItems((prev) => (p === 1 ? newItems : [...prev, ...newItems]));
      const nextTotal = Number(res.data.total ?? 0);
      setTotal(nextTotal);
      const totalSoFar =
        p === 1 ? newItems.length : items.length + newItems.length;
      setHasMore(totalSoFar < nextTotal);
      setPage(p);
      setAnnounce(`Loaded ${totalSoFar} of ${nextTotal} projects`);
    } catch {
      if (p === 1) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  }

  const inputsKey = `${tab}|${chipType}|${chipStatus}|${sort}|${order}`;
  useEffect(() => {
    if (authLoading || !user || !router.isReady) return;
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, router.isReady, inputsKey]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis && hasMore && !loading) {
          fetchPage(page + 1);
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [hasMore, loading, page, inputsKey]);

  const isCompletedLikeView =
    tab === "completed" || tab === "completedCommunity";

  const { labels: trades } = useTradesmanLabels(
    isCompletedLikeView,
    (items as any[]) || [],
    api
  );

  const { typeOptions, statusOptions } = useMemo(() => {
    const types = new Set<string>();
    const statuses = new Set<Status>();
    for (const p of items) {
      if (p?.type) types.add(p.type);
      if (p?.status) statuses.add(p.status);
    }
    const typeOptions = Array.from(types).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
    const orderMap: Record<Status, number> = {
      live: 0,
      pending: 1,
      completed: 2,
      archived: 3,
    };
    const statusOptions = Array.from(statuses).sort(
      (a, b) => orderMap[a] - orderMap[b]
    );
    return { typeOptions, statusOptions };
  }, [items]);

  const toggleSort = (col: "name" | "createdAt") => {
    if (sort === col) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(col);
      setOrder(col === "createdAt" ? "desc" : "asc");
    }
  };

  // ---- Featured strip (replaces hero) ----
  const [featured, setFeatured] = useState<FeaturedLite[]>([]);
  const [featuredErr, setFeaturedErr] = useState<string | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setFeaturedLoading(true);
        setFeaturedErr(null);
        const res = await api.get(`/api/tradesmen/featured`, {
          params: { onlyGold: true, limit: 40 },
        } as any);
        const data: any = (res as any)?.data ?? res;

        const items: FeaturedLite[] = Array.isArray(data?.items)
          ? data.items.map((t: any) => {
              const avatarUrl =
                t.avatarUrl && String(t.avatarUrl).trim().length > 0
                  ? String(t.avatarUrl)
                  : null;

              const galleryArr = Array.isArray(t.gallery)
                ? t.gallery.map((g: any) => String(g))
                : [];

              const galleryFirst = galleryArr.length > 0 ? galleryArr[0] : null;

              // Fallback to any older image fields if present
              const legacyFallback =
                t.mainPhotoUrl ||
                t.photoUrl ||
                t.imageUrl ||
                t.coverPhotoUrl ||
                null;

              const mainPhotoUrl = avatarUrl || galleryFirst || legacyFallback;

              return {
                builderId: String(t.builderId),
                companyName: t.companyName ?? null,
                displayName: t.displayName ?? null,
                mainPhotoUrl,
                avatarUrl,
                gallery: galleryArr,
              };
            })
          : [];

        if (!cancelled) setFeatured(items);
      } catch (e: any) {
        if (!cancelled)
          setFeaturedErr(e?.message || "Failed to load featured tradesmen");
      } finally {
        if (!cancelled) setFeaturedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function openBuilderProfile(p: Project) {
    const fromRowRec = (p as any)._winnerRecommendationId;
    if (fromRowRec != null && String(fromRowRec).trim() !== "") {
      router.push(`/builders/${fromRowRec}`);
      return;
    }
    try {
      const { data: closure } = await api.get<any>(
        `/api/projects/${p.id}/closure`
      );
      const rid =
        closure?.winnerRecommendationId ??
        closure?.winner_rec_id ??
        closure?.winnerId ??
        null;
      if (rid != null && String(rid).trim() !== "") {
        router.push(`/builders/${rid}`);
        return;
      }
    } catch {
      // ignore
    }
    alert("Sorry, we couldn’t find the builder profile for this project yet.");
  }

  const SkeletonCard = () => (
    <div className="rounded-2xl border border-slate-200 p-3 animate-pulse">
      <div className="aspect-[4/3] rounded-xl bg-slate-200 mb-3" />
      <div className="h-4 w-3/4 bg-slate-200 rounded mb-2" />
      <div className="space-y-2">
        <div className="h-3 w-1/2 bg-slate-200 rounded" />
        <div className="h-3 w-2/3 bg-slate-200 rounded" />
        <div className="h-3 w-1/3 bg-slate-200 rounded" />
      </div>
    </div>
  );

  return (
    <div
      className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
      data-testid="projects-page"
    >
      {/* top padding so content doesn’t crash into header */}
      <div className="pt-4" />

      {/* Featured strip (no extra heading; strip renders its own title) */}
      <section
        aria-label="Featured Gold Tradesmen"
        data-testid="projects-featured-hero"
        className="mb-6"
      >
        {featuredLoading && (
          <p className="text-sm text-slate-500">Loading featured…</p>
        )}
        {featuredErr && <p className="text-sm text-rose-600">{featuredErr}</p>}

        {!featuredLoading && !featuredErr && featured.length === 0 && (
          <p className="text-sm text-slate-500">No featured tradesmen yet.</p>
        )}

        {featured.length > 0 && (
          <FeaturedSimpleStrip
            items={featured.map((t) => ({
              id: t.builderId,
              name: t.companyName || t.displayName || "Tradesman",
              img: t.mainPhotoUrl || null,
              onClick: () => router.push(`/tradesman/${t.builderId}`),
            }))}
            pageSize={4}
          />
        )}
      </section>

      <ProjectFilters
        typeOptions={typeOptions}
        statusOptions={statusOptions as any}
        items={items as any}
        value={{ type: chipType, status: chipStatus }}
        onChange={(next: ProjectFiltersValue) => {
          setChipType(next.type);
          setChipStatus(next.status);
        }}
      />

      <div className="mt-2" data-testid="projects-list">
        {tab === "completed" || tab === "completedCommunity" ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
            data-testid="projects-card-grid-completed"
          >
            {items.map((p) => {
              const recId =
                (p as any)._winnerRecommendationId ??
                (p as any)._winner_rec_id ??
                (p as any)._winnerId;

              const fromServer = normalizeHookLabel(
                (p as any)._winnerTradesmanName
              );

              const fromHook = normalizeHookLabel(
                (trades as any)?.[recId] ??
                  (trades as any)?.[String(recId)] ??
                  (trades as any)?.[Number(recId)]
              );

              const tradesmanLabel = fromServer || fromHook || "—";

              return (
                <CompletedProjectCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  status={p.status}
                  type={p.type}
                  location={p.location}
                  coverPhotoUrl={p.coverPhotoUrl}
                  tradesmanLabel={tradesmanLabel}
                  onOpenBuilder={() => openBuilderProfile(p)}
                  hasGallery={hasGallery(p)}
                />
              );
            })}
            {loading &&
              [...Array(4)].map((_, i) => <SkeletonCard key={`skc-${i}`} />)}
            {items.length === 0 && !loading && (
              <div
                className="col-span-full text-sm text-zinc-400"
                data-testid="projects-empty"
              >
                No projects.
              </div>
            )}
          </div>
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5"
            data-testid="projects-card-grid"
          >
            {items.map((p) => (
              <div className="contents" key={p.id}>
                <ProjectImageCard
                  id={p.id}
                  status={p.status}
                  imageUrl={
                    p.coverPhotoUrl ||
                    "https://cdn.home-designing.com/wp-content/uploads/2024/08/Graceful-Mid-Century-Modern-Living-Rooms.jpg"
                  }
                  name={p.name}
                />
                <ProjectInfoCard
                  id={p.id}
                  name={p.name}
                  type={p.type}
                  location={p.location}
                  propertyType={p.propertyType}
                  bedrooms={p.bedrooms}
                  createdAt={p.createdAt}
                  status={p.status}
                />
              </div>
            ))}
            {loading &&
              [...Array(4)].map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
            {items.length === 0 && !loading && (
              <div
                className="col-span-full text-sm text-zinc-400"
                data-testid="projects-empty"
              >
                No projects.
              </div>
            )}
          </div>
        )}

        <div ref={sentinelRef} />

        <div className="flex flex-col items-center gap-2 mt-6">
          <div className="text-sm text-slate-600">
            Showing {items.length} of {total}
          </div>
          <button
            className="btn disabled:opacity-50"
            onClick={() => fetchPage(page + 1)}
            disabled={!hasMore || loading}
            id="load-more"
            data-testid="load-more"
          >
            {loading ? "Loading…" : hasMore ? "Load more" : "All caught up"}
          </button>
          <div className="sr-only" aria-live="polite">
            {announce}
          </div>
        </div>
      </div>
    </div>
  );
}
