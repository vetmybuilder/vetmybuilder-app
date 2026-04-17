import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  status: string;
  propertyType: string | null;
  bedrooms: number | null;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string | null;
  createdAt: string;
};

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-zinc-500",
  live: "bg-emerald-500",
  completed: "bg-blue-500",
  archived: "bg-amber-500",
};

export default function AdminProjectsPage() {
  const api = useApi();
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const { data } = await api.get(`/api/admin/projects?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      if (err?.response?.status === 403) setForbidden(true);
    }
    setLoading(false);
  }, [api, q, statusFilter, offset]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  function onSearchChange(val: string) {
    setQ(val);
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProjects(), 300);
  }

  async function deleteProject(id: number, name: string) {
    if (!confirm(`Delete project "${name}" and all its data? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/api/admin/projects/${id}`);
      await fetchProjects();
    } catch {}
    setDeleting(null);
  }

  if (forbidden) {
    return (
      <AuthedOnly>
        <div className="min-h-screen bg-slate-900 pt-20 text-center text-white">
          <p>Access restricted</p>
        </div>
      </AuthedOnly>
    );
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AuthedOnly>
      <Head>
        <title>Projects - Admin - VetMyBuilder</title>
      </Head>
      <div className="min-h-screen bg-slate-900 text-white px-4 pt-20 pb-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold">Projects</h1>
            <AdminRefreshButton onRefresh={fetchProjects} />
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              placeholder="Search by name, type, or location..."
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              data-testid="projects-search"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              data-testid="projects-status-filter"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-slate-500">No projects found.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-sm" data-testid="projects-table">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold text-slate-400 uppercase">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate" title={p.name}>
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{p.type}</td>
                        <td className="px-4 py-3 text-slate-400">{p.location}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${STATUS_COLOURS[p.status] || "bg-zinc-600"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate" title={p.ownerEmail || p.ownerName}>
                          {p.ownerName}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/projects/${p.id}`}
                            className="text-blue-400 hover:text-blue-300 text-xs font-semibold"
                            target="_blank"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => deleteProject(p.id, p.name)}
                            disabled={deleting === p.id}
                            className="text-red-400 hover:text-red-300 text-xs font-semibold ml-3 disabled:opacity-50"
                          >
                            {deleting === p.id ? "..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {items.length} of {total} projects
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-700 disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-700 disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
