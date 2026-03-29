// web/pages/admin/tradesmen.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

type Row = {
  user_id: string;
  company_name: string;
  user_email?: string;
  company_email?: string;
  status: "draft" | "active" | "inactive";
  subscription_status: string;
  service_areas?: string;
  trade_types?: string;
  openFlags: number;
  created_at: string;
};

export default function AdminTradesmen() {
  const api = useApi();
  const { user, loading } = useAuth();

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "active" | "inactive">(
    "all"
  );

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // small mutation lock so row buttons can disable while a call runs
  const [mutatingUid, setMutatingUid] = useState<string | null>(null);

  const canQuery = useMemo(() => !!user && !loading, [user, loading]);

  async function load() {
    if (!canQuery) return;
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "50",
        status,
      });
      if (q.trim()) params.set("q", q.trim());

      // NOTE: using /api/* so useApi attaches the bearer token automatically
      const { data } = await api.get(
        `/api/admin/tradesmen?${params.toString()}`
      );
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 401) setErr("You must sign in.");
      else if (code === 403) setErr("Admins only.");
      else setErr(e?.response?.data?.error || e?.message || "Failed to load");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canQuery]);

  async function setStatusFor(uid: string, next: Row["status"]) {
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/status`, { status: next });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Failed");
    } finally {
      setMutatingUid(null);
    }
  }

  async function flag(uid: string) {
    const reason = window.prompt("Reason for flag?");
    if (!reason) return;
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/flag`, {
        reason,
        severity: "warn",
      });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Failed");
    } finally {
      setMutatingUid(null);
    }
  }

  return (
    <>
      <Head>
        <title>Admin • Tradesmen</title>
      </Head>

      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6"
        data-testid="admin-tradesmen-page"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Admin — Tradesmen</h1>
        </div>

        {/* Filters */}
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_12rem_auto]">
          <input
            className="input"
            placeholder="Search company/email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            data-testid="filter-q"
          />
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            data-testid="filter-status"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            className="btn"
            onClick={load}
            disabled={busy || !canQuery}
            data-testid="btn-apply"
          >
            {busy ? "Loading…" : "Apply"}
          </button>
        </div>

        {!user && !loading && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            You must{" "}
            <a className="link" href="/login">
              sign in
            </a>{" "}
            as an admin.
          </div>
        )}

        {user && !loading && (
          <div data-testid="admin-tradesmen-table" className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Flags</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {err && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-red-600">
                      {err}
                    </td>
                  </tr>
                )}

                {!err && rows.length === 0 && !busy && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-slate-500">
                      No tradesmen.
                    </td>
                  </tr>
                )}

                {!err &&
                  rows.map((r) => {
                    const isRowBusy = mutatingUid === r.user_id;
                    return (
                      <tr key={r.user_id} className="border-t border-gray-100">
                        <td className="px-4 py-2">{r.company_name}</td>
                        <td className="px-4 py-2">
                          {r.company_email || r.user_email || "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            data-testid={`tradesman-status-${r.user_id}`}
                            className={
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 " +
                              (r.status === "active"
                                ? "bg-green-50 text-green-700 ring-green-200"
                                : r.status === "inactive"
                                ? "bg-amber-50 text-amber-700 ring-amber-200"
                                : "bg-slate-50 text-slate-700 ring-slate-200")
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">{r.openFlags || 0}</td>
                        <td className="px-4 py-2">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="btn btn-secondary"
                              onClick={() => flag(r.user_id)}
                              disabled={isRowBusy}
                              data-testid={`flag-${r.user_id}`}
                            >
                              Flag
                            </button>
                            <button
                              className="btn"
                              disabled={r.status === "active" || isRowBusy}
                              onClick={() => setStatusFor(r.user_id, "active")}
                              data-testid={`make-active-${r.user_id}`}
                            >
                              Make active
                            </button>
                            <button
                              className="btn btn-secondary"
                              disabled={r.status === "inactive" || isRowBusy}
                              onClick={() =>
                                setStatusFor(r.user_id, "inactive")
                              }
                              data-testid={`make-inactive-${r.user_id}`}
                            >
                              Make inactive
                            </button>
                            <button
                              className="btn btn-secondary"
                              disabled={r.status === "draft" || isRowBusy}
                              onClick={() => setStatusFor(r.user_id, "draft")}
                              data-testid={`make-draft-${r.user_id}`}
                            >
                              Set draft
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
