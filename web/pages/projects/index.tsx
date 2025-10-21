import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/utils/auth";
import ProjectTabs, { type ProjectTabKey } from "@/components/ProjectTabs";
import { useTradesmanLabels } from "@/hooks/useTradesmanLabels";
import { useRouter } from "next/router";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  status?: "pending" | "live" | "completed" | "archived";
  ownerUserId?: string;

  completedAt?: string | null;
  archivedAt?: string | null;

  _winnerRecommendationId?: number | string;
  _winnerBuilderId?: number | string;
  _hasClosurePhotos?: 0 | 1 | boolean;

  _winnerTradesmanName?: string | null; // optional, prefer if present
};

type ApiList = {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
};

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// Accept 'archived' here so URL ?tab=archived is valid, but we don't show a pill for it.
const ALL_TABS: ProjectTabKey[] = [
  "mine",
  "archived",             // allowed but hidden in ProjectTabs
  "completed",
  "completedCommunity",
  "recommended",
];

export default function ProjectsPage() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // ---- Tab state + URL sync (robust; won't overwrite ?tab=archived on mount) ----
  const allowedTabs = useMemo(
    () => new Set<ProjectTabKey>(ALL_TABS),
    []
  );

  function getUrlTab(): ProjectTabKey | undefined {
    const raw = router.query?.tab;
    const t = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
    return t && allowedTabs.has(t as ProjectTabKey)
      ? (t as ProjectTabKey)
      : undefined;
  }

  // start with default; we'll sync once on initial mount
  const [tab, setTab] = useState<ProjectTabKey>("mine");
  const [synced, setSynced] = useState(false);

  // Initial sync: if URL has a valid tab, use it. If not, set default "mine" and write it once.
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

  // Reflect user-initiated tab changes into the URL (after initial sync)
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

  // Filters
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fProperty, setFProperty] = useState("");

  // "mine" only
  const [status, setStatus] = useState<"all" | "pending" | "live">("all");

  const dName = useDebounced(fName);
  const dType = useDebounced(fType);
  const dLocation = useDebounced(fLocation);
  const dProperty = useDebounced(fProperty);

  // Sorting & paging
  const [sort, setSort] = useState<"createdAt" | "name">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Data
  const [data, setData] = useState<ApiList>({
    items: [],
    total: 0,
    page: 1,
    pageSize,
  });
  const [loading, setLoading] = useState(true);

  // Completed views (mine + community) use tradesman labels
  const isCompletedTab = tab === "completed" || tab === "completedCommunity";
  const { labels: trades, loading: tradesLoading } = useTradesmanLabels(
    isCompletedTab,
    (data.items as any[]) || [],
    api
  );

  // For Completed Community, we may need to resolve readable names from closure
  const [communityNames, setCommunityNames] = useState<Record<number, string>>(
    {}
  );

  // Use special 5-column view for BOTH completed tabs
  const isCompletedLikeView =
    tab === "completed" || tab === "completedCommunity";

  // reset page & clear status for tabs that don't use it
  useEffect(() => {
    setPage(1);
    if (tab !== "mine") setStatus("all");
  }, [tab]);

  // Only "mine" honors the status filter
  const effectiveStatus = useMemo(() => {
    if (tab !== "mine") return "all";
    return status;
  }, [tab, status]);

  // Load list (includes `tab` so switching tabs refetches)
  useEffect(() => {
    if (authLoading || !user || !synced) return;
    let alive = true;
    setLoading(true);

    const params = new URLSearchParams({
      tab,
      status: effectiveStatus,
      name: dName,
      type: dType,
      location: dLocation,
      property: dProperty,
      sort,
      order,
      page: String(page),
      pageSize: String(pageSize),
    });

    (async () => {
      try {
        const res = await api.get<ApiList>(
          `/api/projects?${params.toString()}`
        );
        if (!alive) return;
        setData({
          items: res.data.items ?? [],
          total: Number(res.data.total ?? 0),
          page: Number(res.data.page ?? 1),
          pageSize: Number(res.data.pageSize ?? pageSize),
        });
        // reset any extra names when list changes
        setCommunityNames({});
      } catch {
        if (!alive) return;
        setData({ items: [], total: 0, page: 1, pageSize });
        setCommunityNames({});
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    api,
    authLoading,
    user,
    synced,
    tab,
    dName,
    dType,
    dLocation,
    dProperty,
    effectiveStatus,
    sort,
    order,
    page,
  ]);

  // For Completed Community rows that still show "#id"/blank from the hook,
  // fetch closure and lift a readable name
  useEffect(() => {
    if (tab !== "completedCommunity" || loading) return;

    const pending = (data.items || []).filter((p) => {
      const recId = (p as any)._winnerRecommendationId;
      const hookLabel = (trades as any)?.[recId];
      const serverLabel = (p as any)._winnerTradesmanName;
      const current =
        communityNames[p.id] ||
        (typeof serverLabel === "string" ? serverLabel.trim() : "") ||
        (typeof hookLabel === "string" ? hookLabel.trim() : "");
      return (
        !current ||
        /^#\d+$/i.test(current) ||
        current === "=" ||
        current === "—"
      );
    });

    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates: Record<number, string> = {};
      for (const p of pending) {
        try {
          const { data: closure } = await api.get<any>(
            `/api/projects/${p.id}/closure`
          );
          const name =
            closure?.winnerTradesmanName ??
            closure?.winner_tradesman_name ??
            closure?.winnerBuilderName ??
            closure?.winner_builder_name ??
            closure?.builderName ??
            closure?.companyName ??
            closure?.tradesmanName ??
            closure?.name ??
            "";
          if (name && !cancelled) {
            updates[p.id] = String(name);
          }
        } catch {
          // ignore row failure
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setCommunityNames((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, loading, data.items, trades, api, communityNames]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / pageSize)),
    [data.total, pageSize]
  );

  const toggleSort = (col: "name" | "createdAt") => {
    if (sort === col) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(col);
      setOrder(col === "createdAt" ? "desc" : "asc");
    }
  };

  const ids = {
    name: "proj-filter-name",
    type: "proj-filter-type",
    location: "proj-filter-location",
    property: "proj-filter-property",
    status: "proj-filter-status",
  };

  /** Navigate to /builders/[id] using the winner recommendation id */
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

    alert("Sorry, we couldn’t find the builder profile for this row yet.");
  }

  const formatClosedAt = (p: Project) => {
    const when = (p.completedAt as any) || (p.archivedAt as any) || p.createdAt;
    try {
      return new Date(when).toLocaleString();
    } catch {
      return String(when ?? "");
    }
  };

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="projects-page"
      >
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold" data-testid="projects-title">
            Projects
          </h1>
          <Link
            className="btn"
            href="/projects/new"
            id="btn-create-project"
            data-testid="btn-create-project"
          >
            Create a new Project
          </Link>
        </div>

        <ProjectTabs value={tab} onChange={setTab} />

        <div className="mt-4 rounded-2xl border border-indigo-200/60 bg-white/90 shadow-sm ring-1 ring-indigo-200/40 backdrop-blur">
          {/* Filters */}
          <div
            className="card mb-0 border-0 shadow-none px-4 sm:px-6 pt-4"
            data-testid="projects-filters"
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <div>
                <label className="text-xs text-zinc-500" htmlFor={ids.name}>
                  Name
                </label>
                <input
                  id={ids.name}
                  className="input"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="Search name..."
                  data-testid="filter-name"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500" htmlFor={ids.type}>
                  Type
                </label>
                <input
                  id={ids.type}
                  className="input"
                  value={fType}
                  onChange={(e) => setFType(e.target.value)}
                  placeholder="Kitchen, Bathroom..."
                  data-testid="filter-type"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500" htmlFor={ids.location}>
                  Location
                </label>
                <input
                  id={ids.location}
                  className="input"
                  value={fLocation}
                  onChange={(e) => setFLocation(e.target.value)}
                  placeholder="Postcode, city..."
                  data-testid="filter-location"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500" htmlFor={ids.property}>
                  Property
                </label>
                <input
                  id={ids.property}
                  className="input"
                  value={fProperty}
                  onChange={(e) => setFProperty(e.target.value)}
                  placeholder="Semi-Detached, Flat..."
                  data-testid="filter-property"
                />
              </div>

              {tab === "mine" && (
                <div>
                  <label className="text-xs text-zinc-500" htmlFor={ids.status}>
                    Status
                  </label>
                  <select
                    id={ids.status}
                    className="input"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    data-testid="filter-status"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="live">Live</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <p className="px-4 sm:px-6 py-4" data-testid="projects-loading">
              Loading...
            </p>
          ) : (
            <div className="px-2 sm:px-4 pb-4" data-testid="projects-list">
              <div className="overflow-x-auto">
                {isCompletedLikeView ? (
                  // Shared 5-column table for My Completed & Completed Community
                  <table
                    className="table min-w-full"
                    data-testid="projects-table-completed"
                    id="projects-table-completed"
                  >
                    <thead>
                      <tr>
                        <th data-testid="th-type" id="th-type" data-colname="Type">
                          <span className="label">Type</span>
                        </th>
                        <th data-testid="th-location" id="th-location" data-colname="Location">
                          <span className="label">Location</span>
                        </th>
                        <th
                          className="cursor-pointer select-none"
                          onClick={() => toggleSort("createdAt")}
                          data-testid="th-closed"
                          id="th-closed"
                          data-colname="Date Closed"
                        >
                          <span className="label">Date Closed</span>
                        </th>
                        <th data-testid="col-tradesman" id="th-tradesman" data-colname="Tradesman">
                          <span className="label">Tradesman</span>
                        </th>
                        <th data-testid="col-gallery" id="th-gallery" data-colname="Gallery">
                          <span className="label">Gallery</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((p) => {
                        const recId = (p as any)._winnerRecommendationId;

                        // Prefer any explicit server-provided name
                        const fromServer =
                          (p as any)._winnerTradesmanName &&
                          String((p as any)._winnerTradesmanName).trim();

                        // Hook label (valid if not "#id" or placeholders)
                        const fromHookRaw =
                          (trades as any)?.[recId] ??
                          (tradesLoading ? "Loading…" : "—");
                        const fromHook =
                          typeof fromHookRaw === "string" &&
                          !/^#\d+$/i.test(fromHookRaw.trim()) &&
                          fromHookRaw.trim() !== "="
                            ? fromHookRaw
                            : "";

                        // Fallback resolved from /closure (community tab only)
                        const fromCommunity =
                          tab === "completedCommunity"
                            ? communityNames[p.id]
                            : "";

                        const label =
                          (fromServer as string) ||
                          (fromHook as string) ||
                          (fromCommunity as string) ||
                          "—";

                        return (
                          <tr key={p.id} data-testid={`row-${p.id}`} id={`row-${p.id}`}>
                            <td data-testid={`cell-${p.id}-type`}>{p.type}</td>
                            <td data-testid={`cell-${p.id}-location`}>{p.location}</td>
                            <td data-testid={`cell-${p.id}-closed`}>{formatClosedAt(p)}</td>
                            <td data-testid={`cell-${p.id}-tradesman`}>
                              <button
                                type="button"
                                onClick={() => openBuilderProfile(p)}
                                className="inline-flex items-center gap-1 text-indigo-600 underline hover:text-indigo-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-sm"
                                role="link"
                                title={
                                  label && label !== "—"
                                    ? `Open builder profile for ${label}`
                                    : "Open builder profile"
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openBuilderProfile(p);
                                  }
                                }}
                                data-testid={`link-${p.id}-tradesman`}
                              >
                                {label}
                              </button>
                            </td>
                            <td className="text-right whitespace-nowrap" data-testid={`cell-${p.id}-gallery`}>
                              {(p as any)._hasClosurePhotos ||
                              (p as any)._hasClosurePhotos === 1 ? (
                                <Link
                                  href={`/projects/${p.id}/completed`}
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 hover:underline"
                                  data-testid={`btn-${p.id}-view-gallery`}
                                  aria-label={`View gallery for ${p.name}`}
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M3 19V5a2 2 0 0 1 2-2h14" />
                                    <path d="M21 8l-5 5-3-3-6 6" />
                                  </svg>
                                  <span>View gallery</span>
                                </Link>
                              ) : (
                                <span className="text-slate-400" data-testid={`cell-${p.id}-no-gallery`}>
                                  No photos
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {data.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-sm text-zinc-400" data-testid="projects-empty">
                            No projects.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  // Default table for other tabs (Mine, Recommended, and also when tab=archived)
                  <table
                    className="table min-w-full"
                    data-testid="projects-table"
                    id="projects-table"
                  >
                    <thead>
                      <tr>
                        <th
                          className="cursor-pointer select-none"
                          onClick={() => toggleSort("name")}
                          data-testid="th-name"
                          id="th-name"
                          data-colname="Name"
                        >
                          <span className="label">Name</span>
                        </th>
                        <th data-testid="th-type" id="th-type" data-colname="Type">
                          <span className="label">Type</span>
                        </th>
                        <th data-testid="th-location" id="th-location" data-colname="Location">
                          <span className="label">Location</span>
                        </th>
                        <th data-testid="th-property" id="th-property" data-colname="Property">
                          <span className="label">Property</span>
                        </th>
                        <th data-testid="th-beds" id="th-beds" data-colname="Beds">
                          <span className="label">Beds</span>
                        </th>
                        <th
                          className="cursor-pointer select-none"
                          onClick={() => toggleSort("createdAt")}
                          data-testid="th-created"
                          id="th-created"
                          data-colname="Created"
                        >
                          <span className="label">Created</span>
                        </th>
                        <th data-testid="th-status" id="th-status" data-colname="Status">
                          <span className="label">Status</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((p) => (
                        <tr key={p.id} data-testid={`row-${p.id}`} id={`row-${p.id}`}>
                          <td data-testid={`cell-${p.id}-name`}>
                            <Link
                              className="link"
                              href={`/projects/${p.id}`}
                              data-testid={`link-${p.id}-name`}
                              id={`link-${p.id}-name`}
                              aria-label={`Open project ${p.name}`}
                            >
                              {p.name}
                            </Link>
                          </td>
                          <td data-testid={`cell-${p.id}-type`}>{p.type}</td>
                          <td data-testid={`cell-${p.id}-location`}>{p.location}</td>
                          <td data-testid={`cell-${p.id}-property`}>{p.propertyType}</td>
                          <td data-testid={`cell-${p.id}-beds`}>{p.bedrooms}</td>
                          <td data-testid={`cell-${p.id}-created`}>
                            {new Date(p.createdAt).toLocaleString()}
                          </td>
                          <td data-testid={`cell-${p.id}-status`}>
                            <StatusBadge value={p.status || "pending"} size="sm" />
                          </td>
                        </tr>
                      ))}
                      {data.items.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-sm text-zinc-400" data-testid="projects-empty">
                            No projects.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex items-center justify-between mt-4" data-testid="projects-pager">
                <button
                  className="btn disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  id="pager-prev"
                  data-testid="pager-prev"
                >
                  Prev
                </button>
                <div className="text-sm" data-testid="pager-summary" id="pager-summary">
                  Page {page} / {totalPages} &nbsp; • &nbsp; Total: {data.total}
                </div>
                <button
                  className="btn disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  id="pager-next"
                  data-testid="pager-next"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
