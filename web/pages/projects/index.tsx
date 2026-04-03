// web/pages/projects/index.tsx
import Head from "next/head";
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
import FavouriteTradesmenSection from "@/components/tradesmen/FavouriteTradesmenSection";
import SafetyVerificationCard from "@/components/SafetyVerificationCard";
import { Home, Heart } from "lucide-react";

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

// local tab type so we can include "favourites"
type OwnerTab = ProjectTabKey | "favourites";

/* ===== Outer page: auth + gate ===== */
export default function ProjectsPage() {
  return (
    <>
      <Head>
        <title>My Projects — VetMyBuilder</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>
      <AuthedOnly>
        <ProjectsGate />
      </AuthedOnly>
    </>
  );
}

/* Small component that decides where to send the user. */
function ProjectsGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "redirect">(
    "checking",
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
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-400">
        Redirecting…
      </div>
    );
  }

  if (status !== "ok") {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-400">
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

/* ===== Tab helper (shown above Safety card) ===== */

const TAB_META: Partial<
  Record<
    OwnerTab,
    {
      title: string;
      desc: string;
      activeColor: string;
      icon: "mine" | "completed" | "community" | "favourites";
    }
  >
> = {
  mine: {
    title: "My Projects",
    desc: "Live and draft jobs you're currently running.",
    activeColor: "#22c55e",
    icon: "mine",
  },
  completed: {
    title: "Completed",
    desc: "Projects you've marked as completed",
    activeColor: "#0ea5e9",
    icon: "completed",
  },
  completedCommunity: {
    title: "Community",
    desc: "Completed projects shared by others in your area.",
    activeColor: "#f97316",
    icon: "community",
  },
  favourites: {
    title: "Favourites",
    desc: "Tradespeople you've saved.",
    activeColor: "#6366f1",
    icon: "favourites",
  },
};

function ProjectsTabHelperBanner({ tab }: { tab: OwnerTab }) {
  const meta = TAB_META[tab];
  if (!meta) return null;

  const badgeClass =
    "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 ring-1 ring-black/10";

  return (
    <section
      aria-label="Projects tab helper"
      data-testid="projects-tab-helper-inline"
      className="mb-4"
    >
      <div
        className="w-full rounded-2xl px-4 py-3 text-white shadow-sm"
        style={{ backgroundColor: meta.activeColor }}
      >
        <div className="flex items-start gap-3">
          <span className={badgeClass}>
            {meta.icon === "mine" && (
              <Home className="h-5 w-5" style={{ color: meta.activeColor }} />
            )}

            {meta.icon === "completed" && (
              <span
                className="text-base leading-none"
                style={{ color: meta.activeColor }}
              >
                ✓
              </span>
            )}

            {meta.icon === "community" && (
              <span
                className="text-base leading-none"
                style={{ color: meta.activeColor }}
              >
                ★
              </span>
            )}

            {meta.icon === "favourites" && (
              // ✅ match the old helper look: white badge + red heart
              <Heart className="h-5 w-5 text-rose-600" />
            )}
          </span>

          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold leading-tight">
              {meta.title} <span className="opacity-95">—</span>{" "}
              <span className="font-medium opacity-95">{meta.desc}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===== Actual owner projects UI ===== */

function OwnerProjects() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // ---- Tab derived from URL (single source of truth) ----
  const [tab, setTab] = useState<OwnerTab>("mine");

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query?.tab;
    const t = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;

    const allowed: OwnerTab[] = [
      "mine",
      "archived",
      "completed",
      "completedCommunity",
      "recommended",
      "favourites",
    ];
    const next: OwnerTab = allowed.includes(t as OwnerTab)
      ? (t as OwnerTab)
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

  // Cancel / ignore stale responses (tab switching causes overlapping requests)
  const reqSeqRef = useRef(0);

  useEffect(() => {
    // bump sequence to invalidate any in-flight responses from previous inputs
    reqSeqRef.current += 1;

    setItems([]);
    setTotal(0);
    setPage(1);
    setHasMore(true);
  }, [tab, chipType, chipStatus, sort, order]);

  async function fetchPage(p = 1) {
    const mySeq = ++reqSeqRef.current;

    // Never fetch projects for favourites tab
    if (tab === "favourites") {
      setLoading(false);
      setItems([]);
      setTotal(0);
      setHasMore(false);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        tab: String(tab),
        sort,
        order,
        page: String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (chipType) params.set("type", chipType);
      if (chipStatus) params.set("status", chipStatus as any);

      const res = await api.get<ApiList>(`/api/projects?${params.toString()}`);

      // ignore stale responses (old tab/filters)
      if (mySeq !== reqSeqRef.current) return;

      const newItems = res.data.items ?? [];
      const nextTotal = Number(res.data.total ?? 0);

      setItems((prev) => {
        const merged = p === 1 ? newItems : [...prev, ...newItems];
        const totalSoFar = merged.length;

        // keep these in sync with the same response we just applied
        setTotal(nextTotal);
        setHasMore(totalSoFar < nextTotal);
        setPage(p);
        setAnnounce(`Loaded ${totalSoFar} of ${nextTotal} projects`);

        return merged;
      });
    } catch {
      if (mySeq !== reqSeqRef.current) return;
      if (p === 1) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
      }
    } finally {
      if (mySeq === reqSeqRef.current) {
        setLoading(false);
      }
    }
  }

  const inputsKey = `${tab}|${chipType}|${chipStatus}|${sort}|${order}`;
  useEffect(() => {
    if (authLoading || !user || !router.isReady) return;

    if (tab === "favourites") {
      // No project fetch for favourites tab
      reqSeqRef.current += 1; // invalidate in-flight
      setLoading(false);
      setItems([]);
      setTotal(0);
      setHasMore(false);
      return;
    }

    fetchPage(1);

    // invalidate if inputs change / component unmounts before request resolves
    return () => {
      reqSeqRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, router.isReady, inputsKey]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab === "favourites") return; // no infinite scroll for favourites
    if (!sentinelRef.current) return;

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.some((e) => e.isIntersecting);
        if (vis && hasMore && !loading) {
          fetchPage(page + 1);
        }
      },
      { rootMargin: "200px" },
    );

    io.observe(sentinelRef.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, page, inputsKey, tab]);

  const isCompletedLikeView =
    tab === "completed" || tab === "completedCommunity";

  const { labels: trades } = useTradesmanLabels(
    isCompletedLikeView,
    isCompletedLikeView ? (items as any[]) || [] : [],
    api,
  );

  const { typeOptions, statusOptions } = useMemo(() => {
    const types = new Set<string>();
    const statuses = new Set<Status>();
    for (const p of items) {
      if (p?.type) types.add(p.type);
      if (p?.status) statuses.add(p.status);
    }
    const typeOptions = Array.from(types).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    const orderMap: Record<Status, number> = {
      live: 0,
      pending: 1,
      completed: 2,
      archived: 3,
    };
    const statusOptions = Array.from(statuses).sort(
      (a, b) => orderMap[a] - orderMap[b],
    );
    return { typeOptions, statusOptions };
  }, [items]);

  const SkeletonCard = () => (
    <div className="rounded-2xl border border-zinc-200 p-3 animate-pulse">
      <div className="aspect-[4/3] rounded-xl bg-zinc-200 mb-3" />
      <div className="h-4 w-3/4 bg-zinc-200 rounded mb-2" />
      <div className="space-y-2">
        <div className="h-3 w-1/2 bg-zinc-200 rounded" />
        <div className="h-3 w-2/3 bg-zinc-200 rounded" />
        <div className="h-3 w-1/3 bg-zinc-200 rounded" />
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-stone-50">
      {/* Background bands matching homepage hero */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
        <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
      </div>
    <div
      className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
      data-testid="projects-page"
    >
      {/* top padding so content doesn’t crash into header */}
      <div className="pt-4" />

      {/* helper banner sits ABOVE safety card */}
      <ProjectsTabHelperBanner tab={tab} />

      {/* Safety & verification card at the top */}
      <section
        aria-label="Safety and verification"
        data-testid="projects-safety-card"
        className="mb-6"
      >
        <SafetyVerificationCard />
      </section>

      {/* Projects filters only for project tabs (not favourites) */}
      {tab !== "favourites" && (
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
      )}

      {/* Main content */}
      {tab === "favourites" ? (
        <div className="mt-2" data-testid="projects-list-favourites">
          <FavouriteTradesmenSection />
        </div>
      ) : (
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
                  (p as any)._winnerTradesmanName,
                );

                const fromHook = normalizeHookLabel(
                  (trades as any)?.[recId] ??
                    (trades as any)?.[String(recId)] ??
                    (trades as any)?.[Number(recId)],
                );

                // Prefer UUID public_id; fall back to Firebase UID so the
                // tradesman link always works (tradesman.get.js accepts both).
                const tradesmanPublicId =
                  (p as any)._winnerTradesmanPublicId ||
                  (p as any)._winnerTradesmanUid ||
                  null;

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
                    tradesmanPublicId={tradesmanPublicId}
                    onOpenBuilder={() => {
                      if (tradesmanPublicId) {
                        router.push(`/tradesman/${encodeURIComponent(tradesmanPublicId)}`);
                        return;
                      }
                      if (!recId) return;
                      const n = Number(recId);
                      const slug = Number.isFinite(n)
                        ? String(n)
                        : String(recId);
                      router.push(`/builders/${encodeURIComponent(slug)}`);
                    }}
                    hasGallery={hasGallery(p)}
                  />
                );
              })}
              {loading &&
                [...Array(4)].map((_, i) => <SkeletonCard key={`skc-${i}`} />)}
              {items.length === 0 && !loading && (
                <div
                  className="col-span-full py-12 text-center text-sm text-zinc-400"
                  data-testid="projects-empty"
                >
                  No projects yet.
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
                  className="col-span-full py-12 text-center text-sm text-zinc-400"
                  data-testid="projects-empty"
                >
                  No projects yet.
                </div>
              )}
            </div>
          )}

          <div ref={sentinelRef} />

          <div className="flex flex-col items-center gap-3 mt-8">
            <div className="text-sm text-zinc-400">
              Showing {items.length} of {total}
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-bold text-white hover:bg-zinc-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
      )}
    </div>
    </div>
  );
}
