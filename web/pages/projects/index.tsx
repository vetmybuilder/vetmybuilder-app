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
  status?: string;
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

export default function ProjectsPage() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<"mine" | "recommended">("mine");

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

  useEffect(() => {
    setPage(1);
  }, [tab, dName, dType, dLocation, dProperty, status, sort, order]);

  useEffect(() => {
    if (authLoading || !user) return;
    let alive = true;
    setLoading(true);

    const params = new URLSearchParams({
      tab,
      status,
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
    status,
    sort,
    order,
    page,
  ]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / pageSize)),
    [data.total]
  );

  const toggleSort = (col: "name" | "createdAt") => {
    if (sort === col) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setOrder(col === "createdAt" ? "desc" : "asc");
    }
  };
  const sortIcon = (col: "name" | "createdAt") => {
    if (sort !== col) return "↕︎";
    return order === "asc" ? "▲" : "▼";
  };

  const ids = {
    name: "proj-filter-name",
    type: "proj-filter-type",
    location: "proj-filter-location",
    property: "proj-filter-property",
    status: "proj-filter-status",
  };

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

        <div
          className="mb-4 flex gap-2"
          role="tablist"
          aria-label="Projects tabs"
          data-testid="projects-tabs"
        >
          <button
            role="tab"
            aria-selected={tab === "mine"}
            className={`inline-flex items-center rounded-full px-4 sm:px-5 py-2 text-sm font-medium transition ${
              tab === "mine"
                ? "bg-indigo-600 text-white shadow ring-1 ring-indigo-500"
                : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
            }`}
            onClick={() => setTab("mine")}
            id="tab-my-projects"
            data-testid="tab-my-projects"
            name="tab-my-projects"
          >
            My Projects
          </button>
          <button
            role="tab"
            aria-selected={tab === "recommended"}
            className={`inline-flex items-center rounded-full px-4 sm:px-5 py-2 text-sm font-medium transition ${
              tab === "recommended"
                ? "bg-indigo-600 text-white shadow ring-1 ring-indigo-500"
                : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
            }`}
            onClick={() => setTab("recommended")}
            id="tab-my-recommendations"
            data-testid="tab-my-recommendations"
            name="tab-my-recommendations"
            aria-label="My Recommendations"
          >
            My Recommendations
          </button>
        </div>

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
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

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
                      aria-sort={
                        sort === "name"
                          ? order === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <span className="label">Name</span>{" "}
                      <span className="text-xs" aria-hidden="true">
                        {sortIcon("name")}
                      </span>
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
                      aria-sort={
                        sort === "createdAt"
                          ? order === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <span className="label">Created</span>{" "}
                      <span className="text-xs" aria-hidden="true">
                        {sortIcon("createdAt")}
                      </span>
                    </th>
                    <th
                      data-testid="th-status"
                      id="th-status"
                      data-colname="Status"
                    >
                      <span className="label">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
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
                        <StatusBadge value={p.status || "pending"} size="sm" />
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
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
                name="pager-prev"
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
                name="pager-next"
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
