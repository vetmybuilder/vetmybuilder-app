// web/pages/projects/index.tsx
import Head from "next/head";
import Link from "next/link";
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
import PushPrompt from "@/components/PushPrompt";
import { Home, Heart, FolderOpen, Shield, Building2, Star, Lightbulb, ChevronDown, ChevronUp, Plus, CheckCircle2 } from "lucide-react";


function EmptyState({ onNewProject }: { onNewProject: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100">
        <FolderOpen className="h-10 w-10 text-zinc-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-zinc-900">No projects yet</h3>
      <p className="mb-6 max-w-sm text-sm text-zinc-500">
        Start your first project to find verified builders in your area
      </p>
      <button
        onClick={onNewProject}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Post a Job
      </button>
    </div>
  );
}

type Status = "pending" | "live" | "completed";

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
        <title>My Jobs — VetMyBuilder</title>
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
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-400">
        Redirecting…
      </div>
    );
  }

  if (status !== "ok") {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-400">
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
      color: string;
    }
  >
> = {
  mine: {
    title: "My Jobs",
    desc: "Live and draft jobs you're currently running",
    color: "bg-red-500",
  },
  completed: {
    title: "Completed",
    desc: "Projects you've marked as completed",
    color: "bg-sky-500",
  },
  completedCommunity: {
    title: "Community",
    desc: "Completed projects shared by others in your area",
    color: "bg-orange-500",
  },
  favourites: {
    title: "Favourites",
    desc: "Tradespeople you've saved",
    color: "bg-indigo-500",
  },
};

function ProjectsTabHelperBanner({ tab }: { tab: OwnerTab }) {
  const meta = TAB_META[tab];
  if (!meta) return null;

  return (
    <section
      aria-label="Projects tab helper"
      data-testid="projects-tab-helper-inline"
      className="mb-6"
    >
      <div className={`flex items-center gap-3 rounded-2xl ${meta.color} px-6 py-4`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shrink-0">
          {tab === "mine" && <FolderOpen className="h-5 w-5 text-white" />}
          {tab === "completed" && <Home className="h-5 w-5 text-white" />}
          {tab === "completedCommunity" && <Star className="h-5 w-5 text-white" />}
          {tab === "favourites" && <Heart className="h-5 w-5 text-white" />}
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white leading-tight">{meta.title}</h1>
          <p className="text-sm text-white/80">{meta.desc}</p>
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
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // Show push prompt after signup (flag set by signup forms)
  useEffect(() => {
    try {
      if (sessionStorage.getItem("vmb:showPushPrompt") === "1") {
        sessionStorage.removeItem("vmb:showPushPrompt");
        setShowPushPrompt(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query?.tab;
    const t = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;

    const allowed: OwnerTab[] = [
      "mine",
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

  const [safetyOpen, setSafetyOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-hidden -mt-14">

      <div
        className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-12 pt-4 sm:pt-10"
        data-testid="projects-page"
      >

        {/* Tab title pill */}
        <ProjectsTabHelperBanner tab={tab} />

        {/* Safety & verification collapsible card */}
        <section
          aria-label="Safety and verification"
          data-testid="projects-safety-card"
          className="mb-6"
        >
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setSafetyOpen((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                  <Shield className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-900">Safety &amp; verification</h2>
                  <p className="text-sm text-zinc-500">We combine official checks with community signals to help you hire with confidence.</p>
                </div>
              </div>
              {safetyOpen
                ? <ChevronUp className="h-5 w-5 text-zinc-400 shrink-0 ml-4" />
                : <ChevronDown className="h-5 w-5 text-zinc-400 shrink-0 ml-4" />
              }
            </button>

            {safetyOpen && (
              <div className="border-t border-zinc-200 px-5 pb-5 pt-4 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                    <Building2 className="h-4 w-4 text-zinc-500" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">Verified businesses</p>
                    <p className="text-sm text-zinc-500">We check tradespeople against official UK business registers and show a verified badge when we confirm a match.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                    <Star className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">Trust score</p>
                    <p className="text-sm text-zinc-500">Every tradesperson is scored based on real signals: neighbour recommendations, completed work, photos, and responsiveness - not who pays the most.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <Lightbulb className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-emerald-700">Tip</p>
                    <p className="text-sm text-zinc-500">Always ask for a written quote, check proof of insurance, and keep all messages and agreements in writing.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Filters row */}
        {tab !== "favourites" && (
          <div className="mb-6">
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
          </div>
        )}

        {/* Main content */}
        {tab === "favourites" ? (
          <div data-testid="projects-list-favourites">
            <FavouriteTradesmenSection />
          </div>
        ) : (
          <div data-testid="projects-list">
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
                        const slug = Number.isFinite(n) ? String(n) : String(recId);
                        router.push(`/builders/${encodeURIComponent(slug)}`);
                      }}
                      hasGallery={hasGallery(p)}
                    />
                  );
                })}
                {loading && [...Array(4)].map((_, i) => <SkeletonCard key={`skc-${i}`} />)}
                {items.length === 0 && !loading && (
                  <div className="col-span-full" data-testid="projects-empty">
                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center justify-center py-20 px-6 text-center">
                      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100">
                        <FolderOpen className="h-10 w-10 text-zinc-400" />
                      </div>
                      <h3 className="mb-2 text-lg font-semibold text-zinc-900">No completed projects yet</h3>
                      <p className="max-w-sm text-sm text-zinc-500">
                        Projects you mark as complete will appear here.
                      </p>
                    </div>
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
                    <Link href={`/projects/${p.id}`} className="block hover:shadow-md transition-shadow rounded-3xl">
                      <ProjectImageCard
                        id={p.id}
                        status={p.status}
                        imageUrl={
                          p.coverPhotoUrl ||
                          "https://cdn.home-designing.com/wp-content/uploads/2024/08/Graceful-Mid-Century-Modern-Living-Rooms.jpg"
                        }
                        name={p.name}
                      />
                    </Link>
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
                {loading && [...Array(4)].map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
                {items.length === 0 && !loading && (
                  <div className="col-span-full" data-testid="projects-empty">
                    <EmptyState onNewProject={() => router.push("/projects/new")} />
                  </div>
                )}
              </div>
            )}

            <div ref={sentinelRef} />

            {/* Footer */}
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700 bg-white/80 backdrop-blur-sm rounded-full px-4 py-1.5">
                Showing {items.length} of {total} project{total !== 1 ? "s" : ""}
              </p>
              {hasMore ? (
                <button
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-zinc-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => fetchPage(page + 1)}
                  disabled={loading}
                  id="load-more"
                  data-testid="load-more"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </div>
            <div className="sr-only" aria-live="polite">{announce}</div>
          </div>
        )}
      </div>

      {showPushPrompt && (
        <PushPrompt onComplete={() => setShowPushPrompt(false)} />
      )}

      {/* Floating Post a Job button */}
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => router.push("/projects/new")}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-amber-400 px-6 py-4 text-base font-bold text-zinc-900 shadow-xl shadow-amber-400/40 hover:bg-amber-300 hover:scale-105 transition-all animate-bounce-slow"
        >
          <Plus className="h-5 w-5" />
          Post a Job
        </button>
      )}
    </div>
  );
}
