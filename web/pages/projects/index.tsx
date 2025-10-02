import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
      setOrder(col === "createdAt" ? "desc" : "asc"); // sensible defaults
    }
  };
  const sortIcon = (col: "name" | "createdAt") => {
    if (sort !== col) return "↕︎";
    return order === "asc" ? "▲" : "▼";
  };

  return (
    <Layout>
      <AuthedOnly>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Projects</h1>
          <Link className="btn" href="/projects/new">
            Create
          </Link>
        </div>

        {/* Tabs */}
        <div className="mb-3 flex gap-2">
          <button
            className={`btn ${tab === "mine" ? "" : "opacity-60"}`}
            onClick={() => setTab("mine")}
          >
            My Projects
          </button>
          <button
            className={`btn ${tab === "recommended" ? "" : "opacity-60"}`}
            onClick={() => setTab("recommended")}
          >
            Recommended
          </button>
        </div>

        {/* Filters */}
        <div className="card mb-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <div>
            <label className="text-xs text-zinc-400">Name</label>
            <input
              className="input"
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Search name..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Type</label>
            <input
              className="input"
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              placeholder="Kitchen, Bathroom..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Location</label>
            <input
              className="input"
              value={fLocation}
              onChange={(e) => setFLocation(e.target.value)}
              placeholder="Postcode, city..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Property</label>
            <input
              className="input"
              value={fProperty}
              onChange={(e) => setFProperty(e.target.value)}
              placeholder="Semi-Detached, Flat..."
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Status</label>
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
            <table className="table">
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
                      <StatusBadge value={p.status || "pending"} />
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
      </AuthedOnly>
    </Layout>
  );
}
