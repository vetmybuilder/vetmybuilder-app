// web/pages/projects/index.tsx
import Head from "next/head";
import Link from "next/link";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { type ProjectTabKey } from "@/components/ProjectTabs";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { getJobCategoryImage } from "@/utils/jobCategoryImage";
import { useTradesmanLabels } from "@/hooks/useTradesmanLabels";
import CompletedProjectCard from "@/components/project/CompletedProjectCard";
import ProjectTypeChecklist from "@/components/filters/ProjectTypeChecklist";
import FavouriteTradesmenSection from "@/components/tradesmen/FavouriteTradesmenSection";
import FavouritesListMobile from "@/components/tradesmen/FavouritesListMobile";
import RecommendationsListMobile from "@/components/tradesmen/RecommendationsListMobile";
import PushPrompt from "@/components/PushPrompt";
import { Home, Heart, FolderOpen, Shield, Building2, Star, Lightbulb, ChevronDown, ChevronUp, Plus, CheckCircle2 } from "lucide-react";
import Layout from "@/components/Layout";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
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
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
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
  const { user, loading: authLoading, profileComplete } = useAuth();

  // ---- Tab derived from URL (single source of truth) ----
  // Initialise synchronously from window.location so the correct tab paints
  // on the first client render. Without this, useState seeds "mine" and the
  // url-sync effect below switches to the real tab on the next tick — which
  // shows a brief flash of the wrong tab (e.g. when navigating back from a
  // recommendation profile to ?tab=recommendations).
  const [tab, setTab] = useState<OwnerTab>(() => {
    if (typeof window === "undefined") return "mine";
    const allowed: OwnerTab[] = [
      "mine",
      "recommended",
      "favourites",
      "recommendations",
    ];
    const t = new URL(window.location.href).searchParams.get("tab");
    return (allowed.includes(t as OwnerTab) ? t : "mine") as OwnerTab;
  });
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // Show push prompt after signup, but ONLY once the homeowner has a
  // postcode on file (profileComplete=true). Without this guard, a
  // stale `vmb:showPushPrompt` flag from a prior session can fire the
  // notifications modal before the SSO user has been routed through
  // /signup/complete to enter their location.
  useEffect(() => {
    if (profileComplete !== true) return;
    try {
      if (sessionStorage.getItem("vmb:showPushPrompt") === "1") {
        sessionStorage.removeItem("vmb:showPushPrompt");
        setShowPushPrompt(true);
      }
    } catch {}
  }, [profileComplete]);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query?.tab;
    const t = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;

    // Completed views are gone from the homeowner experience (closures are
    // archive-only after CR3). Any stale link or bookmark hitting these
    // tabs is silently rewritten to the default /projects view.
    if (t === "completed" || t === "completedCommunity") {
      router.replace({ pathname: "/projects" }, undefined, { shallow: true });
      return;
    }

    const allowed: OwnerTab[] = [
      "mine",
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
  }, [router.isReady, router.query.tab, tab, router]);

  // ---- Filters ----
  // Multi-select on desktop (checkbox sidebar). Mobile still uses a single-
  // type dropdown, so we expose chipType (the first selected type) to it.
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const chipType = selectedTypes[0] ?? "";
  const [chipStatus, setChipStatus] = useState<string>("");
  // Mobile tab handler sets a fresh chipStatus and then pushes a tab change
  // through the URL — that tab change should NOT auto-clear the status it
  // just set. Flag set by the mobile handler, consumed once.
  const skipFilterResetRef = useRef(false);
  // Sorting
  const [sort, setSort] = useState<"createdAt" | "name">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Persist filter selections in sessionStorage per-tab so a homeowner
  // who picks "Insulation" on /projects, taps a job, then hits Back
  // (browser arrow or the in-app "My jobs" chevron) lands on /projects
  // with their filters intact. Tab change still resets — each tab gets
  // its own slot, the load effect below rehydrates the new tab.
  function filterStorageKey(forTab: string) {
    return `vmb:projects:filters:${forTab}`;
  }
  function loadFiltersFor(forTab: string): {
    selectedTypes: string[];
    chipStatus: string;
    sort: "createdAt" | "name";
    order: "asc" | "desc";
  } | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(filterStorageKey(forTab));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        selectedTypes: Array.isArray(parsed.selectedTypes)
          ? parsed.selectedTypes.filter((t: unknown) => typeof t === "string")
          : [],
        chipStatus: typeof parsed.chipStatus === "string" ? parsed.chipStatus : "",
        sort: parsed.sort === "name" ? "name" : "createdAt",
        order: parsed.order === "asc" ? "asc" : "desc",
      };
    } catch {
      return null;
    }
  }

  // Tab-change handler: pull the new tab's saved selections in. Mobile
  // tab handler (skipFilterResetRef) still wins so it can set a fresh
  // chipStatus without us trampling it on the same tick.
  useEffect(() => {
    if (skipFilterResetRef.current) {
      skipFilterResetRef.current = false;
      return;
    }
    const stored = loadFiltersFor(tab);
    setSelectedTypes(stored?.selectedTypes ?? []);
    setChipStatus(stored?.chipStatus ?? "");
    setSort(stored?.sort ?? "createdAt");
    setOrder(stored?.order ?? "desc");
  }, [tab]);

  // Persist on every filter change. Skips the very first paint so the
  // hydrate effect above can populate state without us writing the
  // initial-blank values back over the saved blob.
  const persistMountedRef = useRef(false);
  useEffect(() => {
    if (!persistMountedRef.current) {
      persistMountedRef.current = true;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        filterStorageKey(tab),
        JSON.stringify({ selectedTypes, chipStatus, sort, order }),
      );
    } catch {
      /* sessionStorage full / blocked - filters just won't persist */
    }
  }, [tab, selectedTypes, chipStatus, sort, order]);

  // Single-shot load: server returns every row for the current tab. The
  // client filters by checkbox selection and progressively reveals rows
  // with `visibleCount` to keep the initial paint cheap on very long lists.
  const FETCH_PAGE_SIZE = 500;
  const VISIBLE_BATCH = 20;
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [announce, setAnnounce] = useState("");
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH);

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
    setVisibleCount(VISIBLE_BATCH);
  }, [tab, sort, order]);

  // Reset the progressive-render window when the filter shape changes so a
  // newly-narrow list starts from the top rather than mid-scroll.
  useEffect(() => {
    setVisibleCount(VISIBLE_BATCH);
  }, [selectedTypes, chipStatus]);

  async function fetchAll() {
    const mySeq = ++reqSeqRef.current;

    // Never fetch projects for non-projects tabs
    if (tab === "favourites" || tab === "recommendations") {
      setLoading(false);
      setItems([]);
      setTotal(0);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        tab: String(tab),
        sort,
        order,
        page: "1",
        pageSize: String(FETCH_PAGE_SIZE),
      });
      // Type filter is applied client-side so multi-select works without
      // round-tripping. Status remains server-side because the API has
      // tab-specific status semantics (e.g. "mine" hides completed by default).
      if (chipStatus) params.set("status", chipStatus as any);

      const res = await api.get<ApiList>(`/api/projects?${params.toString()}`);

      // ignore stale responses (old tab/filters)
      if (mySeq !== reqSeqRef.current) return;

      const newItems = res.data.items ?? [];
      const nextTotal = Number(res.data.total ?? newItems.length);

      setItems(newItems);
      setTotal(nextTotal);
      setAnnounce(`Loaded ${newItems.length} of ${nextTotal} projects`);
    } catch {
      if (mySeq !== reqSeqRef.current) return;
      setItems([]);
      setTotal(0);
    } finally {
      if (mySeq === reqSeqRef.current) {
        setLoading(false);
      }
    }
  }

  const inputsKey = `${tab}|${chipStatus}|${sort}|${order}`;
  useEffect(() => {
    if (authLoading || !user || !router.isReady) return;

    if (tab === "favourites" || tab === "recommendations") {
      // No project fetch for favourites / recommendations tabs
      reqSeqRef.current += 1; // invalidate in-flight
      setLoading(false);
      setItems([]);
      setTotal(0);
      return;
    }

    fetchAll();

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
    // Coalesce bursts (e.g. several chat_message_new in a row) into one
    // refetch a beat later. Without this every keystroke from the other
    // party would round-trip the whole list.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const RELOAD_TYPES = new Set([
      "recommendation_new",
      "chat_message_new",
      "match_formed",
    ]);
    function onNotif(e: Event) {
      const data = (e as CustomEvent).detail || {};
      const t = String(data?.type || "").toLowerCase();
      if (!RELOAD_TYPES.has(t)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fetchAll();
      }, 400);
    }
    window.addEventListener("vmb:notification", onNotif);
    return () => {
      window.removeEventListener("vmb:notification", onNotif);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, inputsKey]);

  // Filter the loaded rows by the checkbox selection. Empty selection
  // means "all" — same contract the old single-value filter used.
  const filteredItems = useMemo(() => {
    if (selectedTypes.length === 0) return items;
    const set = new Set(selectedTypes);
    return items.filter((p) => p.type && set.has(p.type));
  }, [items, selectedTypes]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );
  const hasMoreVisible = visibleCount < filteredItems.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab === "favourites" || tab === "recommendations") return;
    if (!sentinelRef.current) return;
    if (!hasMoreVisible) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) =>
            Math.min(c + VISIBLE_BATCH, filteredItems.length),
          );
        }
      },
      { rootMargin: "300px" },
    );

    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [hasMoreVisible, filteredItems.length, tab]);

  const isCompletedLikeView =
    tab === "completed" || tab === "completedCommunity";

  const { labels: trades } = useTradesmanLabels(
    isCompletedLikeView,
    isCompletedLikeView ? (items as any[]) || [] : [],
    api,
  );

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

  // Skeleton tuned to the new horizontal hero-row layout so the loading
  // state doesn't visually contradict the row rhythm below it.
  const HeroRowSkeleton = () => (
    <div className="rounded-3xl border border-amber-100 bg-white p-3 animate-pulse flex items-stretch gap-5">
      <div className="w-[148px] h-[120px] rounded-2xl bg-zinc-200 shrink-0" />
      <div className="flex-1 flex flex-col justify-center gap-2">
        <div className="h-3 w-24 bg-zinc-200 rounded" />
        <div className="h-5 w-3/5 bg-zinc-200 rounded" />
        <div className="flex gap-3 mt-1">
          <div className="h-3 w-16 bg-zinc-200 rounded" />
          <div className="h-3 w-20 bg-zinc-200 rounded" />
          <div className="h-3 w-16 bg-zinc-200 rounded" />
        </div>
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
    return filteredItems.map((p) => ({
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
  }, [filteredItems, tab]);

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
            onChangeType={(v) => setSelectedTypes(v ? [v] : [])}
            chipStatus={chipStatus}
            onChangeStatus={setChipStatus}
            sort={mobileSort}
            onChangeSort={handleMobileSortChange}
            items={mobileItems}
            loading={loading}
            counts={mobileCounts}
            hasMore={false}
            onLoadMore={undefined}
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
    <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-4 pb-12 relative overflow-hidden">
      <BrandWatermarkScatter />
      <div
        className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10"
        data-testid="projects-page"
      >

        {/* In-page title bar removed - SiteHeader now renders the
            contextual "My jobs" / "Favourites" / etc. title in the
            centre, so a second copy here would be redundant. */}

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
            {/* Two-column desktop layout: permanent left filter panel
                (formerly two dropdowns in the top toolbar) + right
                column with the safety banner stacked on top of the
                actual job rows. Collapses to a single column under lg. */}
            <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-6">
              <aside
                className="self-start"
                data-testid="projects-filter-sidebar"
              >
                {/* Sticky behaviour was making the filter drift below the
                    Safety card as the user scrolled, which read as a
                    misalignment. With both columns scrolling together
                    their top edges stay locked. */}
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm px-4 py-4">
                  <ProjectTypeChecklist
                    selectedTypes={selectedTypes}
                    onChangeTypes={setSelectedTypes}
                  />
                </div>
              </aside>

              <div className="min-w-0">
                {/* SAFETY & VERIFICATION — now sits inside the right
                    column of the grid so the filter panel runs the full
                    height of the list, not just the rows. */}
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

            {tab === "completed" || tab === "completedCommunity" ? (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                data-testid="projects-card-grid-completed"
              >
                {filteredItems.map((p) => {
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
                {filteredItems.length === 0 && !loading && (
                  <div className="col-span-full" data-testid="projects-empty">
                    <div className="rounded-3xl bg-white border border-amber-100 shadow-sm px-6 py-12 text-center">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mx-auto mb-4">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </span>
                      <div
                        className="text-[16px] font-black tracking-tight text-slate-900"
                        style={{ fontFamily: "'Sora', sans-serif" }}
                      >
                        No completed jobs yet
                      </div>
                      <p className="mt-1.5 text-[13px] text-slate-500 leading-relaxed max-w-md mx-auto">
                        Once a job is wrapped up and marked as complete, it'll
                        live here as a record of work done by your community.
                      </p>
                      <Link
                        href="/projects?tab=mine"
                        className="mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-extrabold text-white shadow-sm hover:shadow-md transition-all"
                        style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                      >
                        View live jobs
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Desktop live-jobs view: horizontal hero rows. Each project
              // is a single wide card with photo on the left, title +
              // metadata in the middle, and Open CTA on the right. Replaces
              // the older 4-col grid of photo-card + info-card stacks.
              // Mobile still uses ProjectsListMobile above.
              <div className="space-y-3" data-testid="projects-card-grid">
                {visibleItems.map((p) => {
                  const href =
                    p.status === "completed"
                      ? `/projects/${p.id}/completed`
                      : `/projects/${p.id}`;
                  const imageUrl =
                    p.coverPhotoUrl || getJobCategoryImage(p.type);
                  return (
                    <Link
                      key={p.id}
                      href={href}
                      data-testid={`project-card-link-${p.id}`}
                      className="group block bg-white rounded-3xl shadow-sm border border-amber-100 hover:shadow-xl hover:shadow-zinc-300/40 hover:border-amber-200 transition-all p-3"
                    >
                      <div className="flex items-stretch gap-5">
                        {/* Photo */}
                        <div
                          className="relative w-[148px] h-[120px] rounded-2xl overflow-hidden shrink-0 bg-zinc-100"
                          style={{
                            backgroundImage: `url(${imageUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                          aria-hidden
                        >
                          {p.status === "live" && (
                            <span className="animate-live-glow absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em]">
                              Live
                            </span>
                          )}
                          {p.status === "completed" && (
                            <span className="absolute top-2 left-2 inline-flex items-center rounded-full bg-indigo-500 text-white px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em]">
                              Completed
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          {p.type && (
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-700">
                              {p.type}
                            </p>
                          )}
                          <h3
                            className="mt-0.5 text-[18px] font-black text-slate-900 truncate"
                            style={{ fontFamily: "'Sora', sans-serif" }}
                          >
                            {p.name}
                          </h3>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-600">
                            {p.location && (
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <span aria-hidden>📍</span> {p.location}
                              </span>
                            )}
                            {p.propertyType && (
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <span aria-hidden>🏠</span> {p.propertyType}
                              </span>
                            )}
                            {p.bedrooms != null && (
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <span aria-hidden>🛏️</span> {p.bedrooms} beds
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: count chips + Open CTA. Counts come from
                            attachMatchCounts on the server (matchedCount =
                            mutual swipes, unreadCount = unseen homeowner
                            messages). Both default to 0 if the API is older
                            or the data isn't there yet. */}
                        <div className="hidden lg:flex flex-col justify-center items-end shrink-0 gap-2 pr-4">
                          <div className="flex items-center gap-2">
                            {((p as any).unreadCount ?? 0) > 0 && (
                              <span className="inline-flex items-baseline gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5">
                                <span className="text-[13px] font-black leading-none">
                                  {(p as any).unreadCount}
                                </span>
                                <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]">
                                  msgs
                                </span>
                              </span>
                            )}
                            {((p as any).matchedCount ?? 0) > 0 && (
                              <span className="inline-flex items-baseline gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5">
                                <span className="text-[13px] font-black leading-none">
                                  {(p as any).matchedCount}
                                </span>
                                <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]">
                                  {(p as any).matchedCount === 1 ? "match" : "matches"}
                                </span>
                              </span>
                            )}
                            {/* Single combined pill: trades who right-
                                swiped (any source) and the homeowner
                                hasn't reciprocated yet. The paid_unlock
                                "priority" distinction stays out of the
                                list view — it shows up inside the
                                shortlist via the "Wants this job" badge,
                                which is where it's actually
                                actionable. */}
                            {((p as any).interestCount ?? 0) > 0 && (
                              <span className="inline-flex items-baseline gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5">
                                <span className="text-[13px] font-black leading-none">
                                  {(p as any).interestCount}
                                </span>
                                <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]">
                                  {(p as any).interestCount === 1 ? "interest" : "interests"}
                                </span>
                              </span>
                            )}
                          </div>
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-indigo-600 group-hover:text-indigo-800 transition-colors">
                            <span
                              aria-hidden
                              className="transition-transform duration-300 ease-out group-hover:translate-x-1"
                            >
                              →
                            </span>
                            View
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {loading &&
                  [...Array(3)].map((_, i) => <HeroRowSkeleton key={`sk-${i}`} />)}
                {filteredItems.length === 0 && !loading && (
                  <div data-testid="projects-empty">
                    {items.length === 0 ? (
                      <EmptyState onNewProject={() => router.push("/projects/new")} />
                    ) : (
                      <div className="bg-white rounded-2xl border border-amber-100 shadow-sm flex flex-col items-center justify-center py-16 px-6 text-center">
                        <h3 className="mb-2 text-base font-semibold text-slate-900">
                          No jobs match those filters
                        </h3>
                        <p className="max-w-sm text-sm text-slate-500">
                          Try clearing a checkbox or two on the left.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* IntersectionObserver target — keep just above the end-of-
                list caption so more rows reveal as the user scrolls. */}
            <div ref={sentinelRef} />

            {!loading && filteredItems.length > 0 && !hasMoreVisible && (
              <p
                className="mt-10 text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-indigo-600"
                data-testid="projects-end"
              >
                {filteredItems.length === 1
                  ? "End of list - 1 job"
                  : `End of list - ${filteredItems.length} jobs`}
              </p>
            )}
            <div className="sr-only" aria-live="polite">{announce}</div>
              </div>{/* /right grid column */}
            </div>{/* /2-col grid */}
          </div>
        )}
      </div>

      {showPushPrompt && (
        <PushPrompt onComplete={() => setShowPushPrompt(false)} />
      )}

      {/* Floating Post-a-Job FAB removed - the action lives in the
          SiteHeader's right cluster now (testid header-post-a-job),
          so it's always reachable without a separate floating button. */}
    </div>
        </Layout>
      </div>
    </>
  );
}

