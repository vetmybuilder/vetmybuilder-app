import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/utils/auth";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  status?: "pending" | "live" | "archived";
  ownerUserId?: string;
  isFavourite?: 0 | 1 | boolean;
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

type TabKey = "mine" | "recommended" | "community" | "favourites" | "archived";

/** Small icons */
function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden {...props}>
      <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM9 9a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2v4h1a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h2V9Z" />
    </svg>
  );
}
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
      {...props}
    >
      <path
        d="M18 6 6 18M6 6l12 12"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProjectsPage() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<TabKey>("mine");

  const [fName, setFName] = useState("");
  const [fType, setFType] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fProperty, setFProperty] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "live" | "archived">(
    "all"
  );

  const dName = useDebounced(fName);
  const dType = useDebounced(fType);
  const dLocation = useDebounced(fLocation);
  const dProperty = useDebounced(fProperty);

  const [sort, setSort] = useState<"createdAt" | "name">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState<ApiList>({
    items: [],
    total: 0,
    page: 1,
    pageSize,
  });
  const [loading, setLoading] = useState(true);

  // reset page & clear status for tabs that don't use it
  useEffect(() => {
    setPage(1);
    if (tab === "community" || tab === "favourites" || tab === "archived" || tab === "recommended") {
      setStatus("all");
    }
  }, [tab]);

  // Normalize status sent to API:
  // - Only "mine" honors the status filter (and never sends "archived").
  // - All other tabs force "all" to rely on server-side tab filtering.
  const effectiveStatus = useMemo(() => {
    if (tab !== "mine") return "all";
    if (status === "archived") return "all";
    return status;
  }, [tab, status]);

  useEffect(() => {
    if (authLoading || !user) return;
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
      } catch {
        if (!alive) return;
        setData({ items: [], total: 0, page: 1, pageSize });
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

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / pageSize)),
    [data.total]
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

  // optimistic favourite/unfavourite
  async function onAddFavourite(p: Project) {
    try {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === p.id ? { ...it, isFavourite: 1 } : it
        ),
      }));
      await api.post(`/api/projects/${p.id}/favourite`);
      if (tab === "community") {
        setData((prev) => ({
          ...prev,
          items: prev.items.filter((it) => it.id !== p.id),
          total: Math.max(0, prev.total - 1),
        }));
      }
    } catch {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === p.id ? { ...it, isFavourite: 0 } : it
        ),
      }));
    }
  }

  async function onRemoveFavourite(p: Project) {
    try {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === p.id ? { ...it, isFavourite: 0 } : it
        ),
      }));
      await api.post(`/api/projects/${p.id}/unfavourite`);
      if (tab === "favourites") {
        setData((prev) => ({
          ...prev,
          items: prev.items.filter((it) => it.id !== p.id),
          total: Math.max(0, prev.total - 1),
        }));
      }
    } catch {
      setData((prev) => ({
        ...prev,
        items: prev.items.map((it) =>
          it.id === p.id ? { ...it, isFavourite: 1 } : it
        ),
      }));
    }
  }

  // tab pill styles
  const tabStyle = (
    active: boolean,
    theme: "indigo" | "emerald" | "amber" | "rose"
  ) => {
    const activeMap = {
      indigo: "bg-indigo-600 text-white shadow ring-1 ring-indigo-500",
      emerald: "bg-emerald-600 text-white shadow ring-1 ring-emerald-500",
      amber: "bg-amber-600 text-white shadow ring-1 ring-amber-500",
      rose: "bg-rose-600 text-white shadow ring-1 ring-rose-500",
    } as const;
    const idleMap = {
      indigo:
        "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100",
      emerald:
        "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100",
      amber:
        "bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100",
      rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100",
    } as const;
    return `inline-flex items-center rounded-full px-4 sm:px-5 py-2 text-sm font-medium transition ${
      active ? activeMap[theme] : idleMap[theme]
    }`;
  };

  // compact, brand-aligned controls (no global .btn)
  const ctaAdd =
    "inline-flex items-center justify-center rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-amber-400 shadow-sm hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition";
  const iconGhost =
    "inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition";

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="projects-page"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold" data-testid="projects-title">
            Projects
          </h1>
          <Link
            className="btn"
            href="/projects/new"
            id="btn-create-project"
            data-testid="btn-create-project"
            aria-label="Create a new Project"
            data-name="create-project"
          >
            Create a new Project
          </Link>
        </div>

        {/* Tabs */}
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Projects tabs"
          data-testid="projects-tabs"
        >
          <button
            role="tab"
            aria-selected={tab === "mine"}
            className={tabStyle(tab === "mine", "indigo")}
            onClick={() => setTab("mine")}
            id="tab-my-projects"
            data-testid="tab-my-projects"
          >
            My Projects
          </button>

          <button
            role="tab"
            aria-selected={tab === "recommended"}
            className={tabStyle(tab === "recommended", "indigo")}
            onClick={() => setTab("recommended")}
            id="tab-my-recommendations"
            data-testid="tab-my-recommendations"
            aria-label="My Recommendations"
          >
            My Recommendations
          </button>

          <button
            role="tab"
            aria-selected={tab === "community"}
            className={tabStyle(tab === "community", "emerald")}
            onClick={() => setTab("community")}
            id="tab-community-projects"
            data-testid="tab-community-projects"
          >
            Community Projects
          </button>

          <button
            role="tab"
            aria-selected={tab === "favourites"}
            className={tabStyle(tab === "favourites", "amber")}
            onClick={() => setTab("favourites")}
            id="tab-favourites"
            data-testid="tab-favourites"
          >
            Favourites
          </button>

          <button
            role="tab"
            aria-selected={tab === "archived"}
            className={tabStyle(tab === "archived", "rose")}
            onClick={() => setTab("archived")}
            id="tab-archived"
            data-testid="tab-archived"
          >
            Archived
          </button>
        </div>

        {/* Filters */}
        <div
          className="card mb-3 grid grid-cols-1 md:grid-cols-5 gap-2"
          data-testid="projects-filters"
        >
          <div>
            <label className="text-xs text-zinc-500" htmlFor={ids.name}>
              Name
            </label>
            <input
              id={ids.name}
              name="name"
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
              name="type"
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
              name="location"
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
              name="property"
              className="input"
              value={fProperty}
              onChange={(e) => setFProperty(e.target.value)}
              placeholder="Semi-Detached, Flat..."
              data-testid="filter-property"
            />
          </div>

          {/* Status filter:
              - Visible ONLY for My Projects
              - Hidden for My Recommendations, Archived, Community, Favourites
              - In My Projects: options are All, Pending, Live (no Archived) */}
          {tab === "mine" && (
            <div>
              <label className="text-xs text-zinc-500" htmlFor={ids.status}>
                Status
              </label>
              <select
                id={ids.status}
                name="status"
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

        {/* Table */}
        {loading ? (
          <p data-testid="projects-loading">Loading...</p>
        ) : (
          <div className="card" data-testid="projects-list">
            <div className="overflow-x-auto">
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
                    <th
                      data-testid="th-location"
                      id="th-location"
                      data-colname="Location"
                    >
                      <span className="label">Location</span>
                    </th>
                    <th
                      data-testid="th-property"
                      id="th-property"
                      data-colname="Property"
                    >
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
                    <th
                      data-testid="th-status"
                      id="th-status"
                      data-colname="Status"
                    >
                      <span className="label">Status</span>
                    </th>

                    {(tab === "community" || tab === "favourites") && (
                      <th
                        data-testid="th-actions"
                        id="th-actions"
                        data-colname="Actions"
                        className="w-40"
                      >
                        <span className="label">Actions</span>
                        {tab === "favourites" && (
                          <button
                            type="button"
                            className="ml-2 inline-flex align-middle text-slate-400 hover:text-slate-600"
                            title="Removing a favourite moves it back to Community Projects"
                            aria-label="Actions help"
                            tabIndex={0}
                            data-testid="actions-tooltip"
                            onClick={(e) => e.preventDefault()}
                          >
                            <InfoIcon className="h-4 w-4" />
                          </button>
                        )}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => {
                    const isFav = p.isFavourite === 1 || p.isFavourite === true;
                    return (
                      <tr
                        key={p.id}
                        data-testid={`row-${p.id}`}
                        id={`row-${p.id}`}
                      >
                        <td data-testid={`cell-${p.id}-name`}>
                          <Link
                            className="link"
                            href={`/projects/${p.id}`}
                            data-testid={`link-${p.id}-name`}
                            id={`link-${p.id}-name`}
                            aria-label={`Open project ${p.name}`}
                            data-name={`project-${p.id}-link`}
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td data-testid={`cell-${p.id}-type`}>{p.type}</td>
                        <td data-testid={`cell-${p.id}-location`}>
                          {p.location}
                        </td>
                        <td data-testid={`cell-${p.id}-property`}>
                          {p.propertyType}
                        </td>
                        <td data-testid={`cell-${p.id}-beds`}>{p.bedrooms}</td>
                        <td data-testid={`cell-${p.id}-created`}>
                          {new Date(p.createdAt).toLocaleString()}
                        </td>
                        <td data-testid={`cell-${p.id}-status`}>
                          <StatusBadge
                            value={p.status || "pending"}
                            size="sm"
                          />
                        </td>

                        {(tab === "community" || tab === "favourites") && (
                          <td
                            data-testid={`cell-${p.id}-actions`}
                            className="py-2"
                          >
                            {tab === "community" ? (
                              <button
                                onClick={() => onAddFavourite(p)}
                                aria-label="Add to favourites"
                                data-testid={`btn-${p.id}-add-favourite`}
                                className="inline-flex items-center justify-center rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-amber-400 shadow-sm hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition"
                              >
                                Add to favourites
                              </button>
                            ) : (
                              <button
                                onClick={() => onRemoveFavourite(p)}
                                aria-label="Remove from favourites (moves back to Community Projects)"
                                title="Remove from favourites — moves back to Community Projects"
                                data-testid={`btn-${p.id}-remove-favourite`}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition"
                              >
                                <XIcon className="h-5 w-5" />
                                <span className="sr-only">
                                  Remove from favourites
                                </span>
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {data.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={
                          tab === "community" || tab === "favourites" ? 8 : 7
                        }
                        className="text-sm text-zinc-400"
                        data-testid="projects-empty"
                      >
                        No projects.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div
              className="flex items-center justify-between mt-4"
              data-testid="projects-pager"
            >
              <button
                className="btn disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                id="pager-prev"
                data-testid="pager-prev"
              >
                Prev
              </button>
              <div
                className="text-sm"
                data-testid="pager-summary"
                id="pager-summary"
              >
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
    </AuthedOnly>
  );
}
