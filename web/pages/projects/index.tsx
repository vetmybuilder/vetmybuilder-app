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
import FavouritesListMobile from "@/components/tradesmen/FavouritesListMobile";
import RecommendationsListMobile from "@/components/tradesmen/RecommendationsListMobile";
import PushPrompt from "@/components/PushPrompt";
import { Home, Heart, FolderOpen, Shield, Building2, Star, Lightbulb, ChevronDown, ChevronUp, Plus, CheckCircle2 } from "lucide-react";
import Layout from "@/components/Layout";
import ProjectsListMobile, {
  type MobileTab,
  type MobileProject,
} from "@/components/project/ProjectsListMobile";


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
  priceBandEstimate?: string | null;
  answersJson?: Record<string, any> | null;
};

type ApiList = {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
};

// local tab type so we can include "favourites" and "recommendations"
type OwnerTab = ProjectTabKey | "favourites" | "recommendations";

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
        router.replace("/tradesman/jobs");
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
          router.replace("/tradesman/jobs");
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
      <>
        <div className="md:hidden p-6 text-sm text-zinc-400">Redirecting…</div>
        <div className="hidden md:block">
          <Layout>
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-400">
              Redirecting…
            </div>
          </Layout>
        </div>
      </>
    );
  }

  if (status !== "ok") {
    return (
      <>
        <div className="md:hidden p-6 text-sm text-zinc-400">Loading…</div>
        <div className="hidden md:block">
          <Layout>
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-zinc-400">
              Loading…
            </div>
          </Layout>
        </div>
      </>
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
  recommendations: {
    title: "Recommendations",
    desc: "Tradespeople recommended for your jobs",
    color: "bg-amber-500",
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
      "recommendations",
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
  // Mobile tab handler sets a fresh chipStatus and then pushes a tab change
  // through the URL — that tab change should NOT auto-clear the status it
  // just set. Flag set by the mobile handler, consumed once.
  const skipFilterResetRef = useRef(false);
  useEffect(() => {
    if (skipFilterResetRef.current) {
      skipFilterResetRef.current = false;
      return;
    }
    setChipType("");
    setChipStatus("");
  }, [tab]);

  // Sorting
  const [sort, setSort] = useState<"createdAt" | "name">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Progressive loading
  const PAGE_SIZE = 10;
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [announce, setAnnounce] = useState("");

  // Independent per-mobile-tab totals so the All/Live/Completed pill counts
  // stay correct regardless of which tab is currently selected.
  const [mobileCounts, setMobileCounts] = useState<{
    all?: number;
    live?: number;
    completed?: number;
  }>({});
  const countsSeqRef = useRef(0);

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

    // Never fetch projects for non-projects tabs
    if (tab === "favourites" || tab === "recommendations") {
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

    if (tab === "favourites" || tab === "recommendations") {
      // No project fetch for favourites / recommendations tabs
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

  // Fetch per-tab totals for the mobile pill counts. Re-runs whenever the
  // current items change (covers post / close / archive / status changes) so
  // the counts stay in sync with the underlying data. Depend on `user?.uid`
  // (stable string) rather than the `user` object so we don't refire on every
  // render where the auth context returns a fresh reference.
  const userUid = user?.uid;
  useEffect(() => {
    if (authLoading || !userUid || !router.isReady) return;
    const mySeq = ++countsSeqRef.current;

    (async () => {
      try {
        const fetchTotal = async (qs: string): Promise<number> => {
          const res = await api.get<ApiList>(
            `/api/projects?${qs}&page=1&pageSize=1`,
          );
          return Number(res.data.total ?? 0);
        };

        const [allTotal, liveTotal, completedTotal] = await Promise.all([
          fetchTotal("tab=mine"),
          fetchTotal("tab=mine&status=live"),
          fetchTotal("tab=completed"),
        ]);

        if (mySeq !== countsSeqRef.current) return;
        setMobileCounts({
          all: allTotal,
          live: liveTotal,
          completed: completedTotal,
        });
      } catch {
        // Counts are decorative — silently leave previous values on failure.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, userUid, router.isReady, items.length]);

  // Live: when a recommendation lands for one of the homeowner's projects,
  // refetch page 1 so the recommendationCount pill on the matching card
  // updates without a manual reload. GlobalSseDispatcher (mounted in
  // _app.tsx) re-broadcasts every server notification as `vmb:notification`.
  useEffect(() => {
    if (tab === "favourites" || tab === "recommendations") return;
    function onNotif(e: Event) {
      const data = (e as CustomEvent).detail || {};
      const t = String(data?.type || "").toLowerCase();
      if (t === "recommendation_new") {
        fetchPage(1);
      }
    }
    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, inputsKey]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab === "favourites" || tab === "recommendations") return; // no infinite scroll for favourites / recommendations
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

  // ---- Mobile tab derivation ----
  // Mobile shows All / Live / Completed which we map onto the
  // existing (tab + chipStatus) pair the API understands.
  const mobileTab: MobileTab = (() => {
    if (tab === "completed") return "completed";
    if (chipStatus === "live") return "live";
    return "all";
  })();
  const handleMobileTabChange = (next: MobileTab) => {
    // tab is URL-driven (see the router.query.tab effect above) — push the URL
    // and let the existing sync effect call setTab. Calling setTab directly
    // races the URL effect and reverts to "mine" on the next render.
    const targetTab: OwnerTab = next === "completed" ? "completed" : "mine";
    // Skip the auto-clear-on-tab-change reset: we're applying a status atomically.
    skipFilterResetRef.current = true;
    setChipStatus(next === "live" ? "live" : "");
    const query: Record<string, string> = {};
    if (targetTab !== "mine") query.tab = targetTab;
    router.replace({ pathname: "/projects", query }, undefined, { shallow: true });
  };

  // Mobile sort: map onto the existing (sort, order) pair.
  const mobileSort: "newest" | "oldest" =
    sort === "createdAt" && order === "asc" ? "oldest" : "newest";
  const handleMobileSortChange = (v: "newest" | "oldest") => {
    setSort("createdAt");
    setOrder(v === "oldest" ? "asc" : "desc");
  };

  // ---- Mobile items adapter ----
  // The same /api/projects endpoint serves every tab and returns p.* rows, so
  // the mobile cards can render directly from the loaded `items`. We adapt
  // explicitly here so the contract between the parent and the mobile list is
  // narrow and obvious — no `as any` slipping through.
  //
  // For the Completed view we hardcode `status="completed"` because the row
  // may have come from `status='archived' AND project_closures.projectId IS
  // NOT NULL`, but the user closed it intentionally so the pill should read
  // Completed.
  const mobileItems: MobileProject[] = useMemo(() => {
    return items.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type ?? null,
      location: p.location ?? null,
      propertyType: p.propertyType ?? null,
      bedrooms: p.bedrooms ?? null,
      status: tab === "completed" ? "completed" : (p.status ?? null),
      coverPhotoUrl: p.coverPhotoUrl ?? null,
      priceBandEstimate: p.priceBandEstimate ?? null,
      answersJson: p.answersJson ?? null,
      recommendationCount: (p as any).recommendationCount ?? null,
      description: (p as any).description ?? null,
      createdAt: p.createdAt ?? null,
      urgency: (p as any).urgency ?? null,
      matchedCount: (p as any).matchedCount ?? null,
      waitingCount: (p as any).waitingCount ?? null,
    }));
  }, [items, tab]);

  return (
    <>
      {/* MOBILE — bare, app-like view */}
      <div className="md:hidden">
        {tab === "favourites" ? (
          <FavouritesListMobile />
        ) : tab === "recommendations" ? (
          <RecommendationsListMobile />
        ) : (
          <ProjectsListMobile
            tab={mobileTab}
            onChangeTab={handleMobileTabChange}
            chipType={chipType}
            onChangeType={setChipType}
            chipStatus={chipStatus}
            onChangeStatus={setChipStatus}
            sort={mobileSort}
            onChangeSort={handleMobileSortChange}
            items={mobileItems}
            loading={loading}
            counts={mobileCounts}
            hasMore={hasMore}
            onLoadMore={() => fetchPage(page + 1)}
          />
        )}
        {showPushPrompt && (
          <PushPrompt onComplete={() => setShowPushPrompt(false)} />
        )}
      </div>

      {/* DESKTOP - Option C: toolbar (title + tabs + filters + Post-a-Job)
          + safety accordion + 4-col dense grid, all on a cream backdrop. */}
      <div className="hidden md:block">
        <Layout>
    <Head>
      <style>{`body { background: #fef6e9 !important; }`}</style>
    </Head>
    <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12">
      <div
        className="mx-auto max-w-7xl px-6 lg:px-8 pt-6"
        data-testid="projects-page"
      >

        {/* TOOLBAR - title + tabs + filters + Post-a-Job */}
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm px-4 py-3 mb-5 flex items-center gap-4 flex-wrap">
          <h1
            className="text-xl font-black tracking-tight text-slate-900"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            My{" "}
            <span
              className="text-indigo-600"
              style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
            >
              jobs
            </span>
          </h1>

          <div className="h-6 w-px bg-amber-200 hidden lg:block" />

          {/* Tabs */}
          <div className="inline-flex rounded-full bg-amber-50 p-1">
            {[
              { key: "mine" as OwnerTab, label: "Live" },
              { key: "completed" as OwnerTab, label: "Completed" },
              { key: "favourites" as OwnerTab, label: "Favourites" },
              { key: "recommendations" as OwnerTab, label: "Recommendations" },
            ].map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() =>
                    router.push(
                      { pathname: "/projects", query: { tab: t.key } },
                      undefined,
                      { shallow: true },
                    )
                  }
                  className={`rounded-full px-3 py-1 text-[12.5px] font-bold transition-colors ${
                    active
                      ? "text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  style={
                    active
                      ? { background: "linear-gradient(135deg,#6366f1,#4f46e5)" }
                      : {}
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {/* Filters */}
          {tab !== "favourites" && tab !== "recommendations" && (
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

          {/* Post a Job */}
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-extrabold text-white shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
            data-testid="btn-post-a-job"
          >
            <Plus className="h-4 w-4" />
            Post a job
          </Link>
        </div>

        {/* SAFETY & VERIFICATION - kept, brand-toned to amber/emerald cream palette */}
        <section
          aria-label="Safety and verification"
          data-testid="projects-safety-card"
          className="mb-5"
        >
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setSafetyOpen((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-amber-50/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                  <Shield className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-extrabold text-slate-900">Safety &amp; verification</h2>
                  <p className="text-sm text-slate-500">We combine official checks with community signals to help you hire with confidence.</p>
                </div>
              </div>
              {safetyOpen
                ? <ChevronUp className="h-5 w-5 text-amber-500 shrink-0 ml-4" />
                : <ChevronDown className="h-5 w-5 text-amber-500 shrink-0 ml-4" />
              }
            </button>

            {safetyOpen && (
              <div className="border-t border-amber-100 px-5 pb-5 pt-4 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <Building2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900">Verified businesses</p>
                    <p className="text-sm text-slate-500">We check tradespeople against official UK business registers and show a verified badge when we confirm a match.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <Star className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-900">Trust score</p>
                    <p className="text-sm text-slate-500">Every tradesperson is scored based on real signals: community recommendations, completed work, photos, and responsiveness - not who pays the most.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <Lightbulb className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-extrabold text-emerald-700">Tip</p>
                    <p className="text-sm text-slate-500">Always ask for a written quote, check proof of insurance, and keep all messages and agreements in writing.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Main content */}
        {tab === "favourites" ? (
          <div data-testid="projects-list-favourites">
            <FavouriteTradesmenSection />
          </div>
        ) : tab === "recommendations" ? (
          <div data-testid="projects-list-recommendations">
            <RecommendationsListMobile />
          </div>
        ) : (
          <div data-testid="projects-list">
            {tab === "completed" || tab === "completedCommunity" ? (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
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
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                data-testid="projects-card-grid"
              >
                {items.map((p) => (
                  <div key={p.id} className="flex flex-col gap-3">
                    <Link href={`/projects/${p.id}`} className="block hover:shadow-md transition-shadow rounded-3xl">
                      <ProjectImageCard
                        id={p.id}
                        status={p.status}
                        imageUrl={p.coverPhotoUrl}
                        type={p.type}
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
    </div>
        </Layout>
      </div>
    </>
  );
}

