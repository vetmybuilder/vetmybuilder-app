// web/pages/projects/index.tsx
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

  // Tabs: mine vs recommended
  const [tab, setTab] = useState<"mine" | "recommended">("mine");

  // Filters
  const [fName, setFName] = useState("");
  const [fType, setFType] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fProperty, setFProperty] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "live" | "archived">(
    "all"
  );

  // Debounced values for nicer UX
  const dName = useDebounced(fName);
  const dType = useDebounced(fType);
  const dLocation = useDebounced(fLocation);
  const dProperty = useDebounced(fProperty);

  // Sorting (only by name / createdAt)
  const [sort, setSort] = useState<"createdAt" | "name">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Paging
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

  // reset page on filter/sort changes
  useEffect(() => {
    setPage(1);
  }, [tab, dName, dType, dLocation, dProperty, status, sort, order]);

  // Fetch
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

  // Clickable header helpers
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

  // --- Tab button UI (high contrast) ---
  const tabBtnBase =
    "inline-flex items-center rounded-full px-4 sm:px-5 py-2 text-sm font-medium transition";
  const active =
    "bg-indigo-600 text-white shadow ring-1 ring-indigo-500";
  const inactive =
    "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100";

  return (
    <AuthedOnly>
      {/* PAGE CONTAINER — same width as before */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Projects</h1>
          <Link className="btn" href="/projects/new">
            Create a new Project
          </Link>
        </div>

        {/* Tabs */}
        <div
          className="mb-4 flex gap-2"
          role="tablist"
          aria-label="Projects tabs"
        >
          <button
            role="tab"
            aria-selected={tab === "mine"}
            className={`${tabBtnBase} ${tab === "mine" ? active : inactive}`}
            onClick={() => setTab("mine")}
          >
            My Projects
          </button>
          <button
            role="tab"
            aria-selected={tab === "recommended"}
            className={`${tabBtnBase} ${
              tab === "recommended" ? active : inactive
            }`}
            onClick={() => setTab("recommended")}
          >
            My Recommendations
          </button>
        </div>

        {/* Filters */}
        <div className="card mb-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <div>
            <label className="text-xs text-zinc-500">Name</label>
            <input
              className="input"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Search name..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Type</label>
            <input
              className="input"
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              placeholder="Kitchen, Bathroom..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Location</label>
            <input
              className="input"
              value={fLocation}
              onChange={(e) => setFLocation(e.target.value)}
              placeholder="Postcode, city..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Property</label>
            <input
              className="input"
              value={fProperty}
              onChange={(e) => setFProperty(e.target.value)}
              placeholder="Semi-Detached, Flat..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Status</label>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="card">
            <div className="overflow-x-auto">
              <table className="table min-w-full">
                <thead>
                  <tr>
                    <th
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("name")}
                    >
                      Name <span className="text-xs">{sortIcon("name")}</span>
                    </th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Property</th>
                    <th>Beds</th>
                    <th
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("createdAt")}
                    >
                      Created{" "}
                      <span className="text-xs">{sortIcon("createdAt")}</span>
                    </th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link className="link" href={`/projects/${p.id}`}>
                          {p.name}
                        </Link>
                      </td>
                      <td>{p.type}</td>
                      <td>{p.location}</td>
                      <td className="capitalize">{p.propertyType}</td>
                      <td>{p.bedrooms}</td>
                      <td>{new Date(p.createdAt).toLocaleString()}</td>
                      <td>
                        <StatusBadge value={p.status || "pending"} size="sm" />
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-sm text-zinc-400">
                        No projects.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <button
                className="btn disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <div className="text-sm">
                Page {page} / {totalPages} &nbsp; • &nbsp; Total: {data.total}
              </div>
              <button
                className="btn disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
