// web/pages/projects/index.tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useEffect, useMemo, useRef, useState } from "react";
import ProjectTabs, { type ProjectTabKey } from "@/components/ProjectTabs";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import ProjectHero from "@/components/project/ProjectHero";
import ProjectImageCard from "@/components/project/ProjectImageCard";
import ProjectInfoCard from "@/components/project/ProjectInfoCard";
import BedroomHero from "@/assets/hero.jpg";
import { useTradesmanLabels } from "@/hooks/useTradesmanLabels";
import CompletedProjectCard from "@/components/project/CompletedProjectCard";
import ProjectFilters, {
  type ProjectFiltersValue,
} from "@/components/filters/ProjectFilters";

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

/* ===== Outer page: auth + gate ===== */
export default function ProjectsPage() {
  return (
    <AuthedOnly>
      <ProjectsGate />
    </AuthedOnly>
  );
}

/* Small component that decides where to send the user.
   It NEVER renders the owner list until the check is done, so no flicker and no hook-order changes. */
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

/* ===== Actual owner projects UI (all the hooks live here) ===== */

const ALL_TABS: ProjectTabKey[] = [
  "mine",
  "archived",
  "completed",
  "completedCommunity",
  "recommended",
];

const VERTICAL_TABS = [
  {
    key: "mine" as const,
    label: "My Projects",
    color: "#22c55e",
    icon: (p: React.SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <path d="M9 7V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" strokeWidth="1.75" />
        <rect x="3.5" y="7" width="17" height="11" rx="2" strokeWidth="1.75" />
        <path d="M3.5 11.5h17" strokeWidth="1.75" />
        <path d="M11.25 11.5v2.5h1.5v-2.5" strokeWidth="1.75" />
      </svg>
    ),
    testId: "tab-my-projects",
  },
  {
    key: "completed" as const,
    label: "My Completed Projects",
    color: "#0ea5e9",
    icon: (p: React.SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <path
          d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z"
          strokeWidth="1.75"
        />
        <path
          d="M8.5 12.5l2.5 2.5 4.5-5"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
    testId: "tab-my-completed-projects",
  },
  {
    key: "completedCommunity" as const,
    label: "Completed Community Projects",
    color: "#10b981",
    icon: (p: React.SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}>
        <circle cx="8" cy="10" r="2.5" strokeWidth="1.75" />
        <circle cx="16" cy="10" r="2.5" strokeWidth="1.75" />
        <path
          d="M4.5 17c.6-2 2.8-3.5 5.5-3.5S15 15 15.5 17"
          strokeWidth="1.75"
        />
        <rect
          x="15.5"
          y="4"
          width="5"
          height="4"
          rx="0.75"
          strokeWidth="1.75"
        />
        <path
          d="M16.5 6l1.2 1.2L20 5"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    ),
    testId: "tab-completed-community-projects",
  },
];

// helpers
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

function OwnerProjects() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // ---- Tab + URL sync ----
  const allowedTabs = useMemo(() => new Set<ProjectTabKey>(ALL_TABS), []);
  function getUrlTab(): ProjectTabKey | undefined {
    const raw = router.query?.tab;
    const t = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
    return t && allowedTabs.has(t as ProjectTabKey)
      ? (t as ProjectTabKey)
      : undefined;
  }
  const [tab, setTab] = useState<ProjectTabKey>("mine");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!router.isReady || synced) return;
    const urlTab = getUrlTab();
    if (urlTab) {
      setTab(urlTab);
      setSynced(true);
      return;
    }
    setTab("mine");
    setSynced(true);
    const q = new URLSearchParams(
      Object.entries(router.query).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v]] : []
      ) as [string, string][]
    );
    q.set("tab", "mine");
    router.replace(`${router.pathname}?${q.toString()}`, undefined, {
      shallow: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, synced]);

  useEffect(() => {
    if (!synced || !router.isReady) return;
    const urlTab = getUrlTab();
    if (urlTab === tab) return;
    const q = new URLSearchParams(
      Object.entries(router.query).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v]] : []
      ) as [string, string][]
    );
    q.set("tab", tab);
    router.replace(`${router.pathname}?${q.toString()}`, undefined, {
      shallow: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, synced, router.isReady]);

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
    if (authLoading || !user || !synced) return;
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, synced, inputsKey]);

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

  const VerticalTabs = () => (
    <nav
      className="hidden xl:block fixed left-8 top-40 z-30 w-[220px] select-none"
      role="tablist"
      aria-label="Projects tabs"
      aria-orientation="vertical"
      data-testid="projects-tabs"
    >
      <ul className="space-y-3">
        {VERTICAL_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <li key={t.key}>
              <button
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                data-testid={t.testId}
                title={t.label}
                className={[
                  "group flex items-start gap-2 text-left transition-colors",
                  active
                    ? "text-slate-900"
                    : "text-slate-600 hover:text-slate-800",
                  "text-[16px] font-semibold leading-snug tracking-[0.005em]",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="mt-0.5 inline-block h-5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: active ? t.color : "transparent" }}
                />
                <t.icon
                  className="h-[18px] w-[18px] mt-0.5 shrink-0"
                  aria-hidden
                />
                <span className="block max-w-[180px] whitespace-normal break-words">
                  {t.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

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
      className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 xl:ml-[260px]"
      data-testid="projects-page"
    >
      <VerticalTabs />

      <div className="xl:hidden mb-3">
        <ProjectTabs
          value={tab}
          onChange={setTab}
          orientation="horizontal"
          className="[&_*]:text-[14px]"
        />
      </div>

      <ProjectHero
        className="mb-5"
        imageSrc={BedroomHero}
        primaryCtaHref="/projects/new"
        primaryCtaLabel="Post a Job"
      />

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

              // ✅ Use labels map from useTradesmanLabels, not the hook itself
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
