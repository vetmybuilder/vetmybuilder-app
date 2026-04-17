import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";

type Report = {
  id: number;
  reporter_uid: string;
  reporter_email: string | null;
  reporter_name: string | null;
  target_type: string;
  target_id: string;
  category: string;
  detail: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  abuse: "Abuse",
  spam: "Spam",
  fake_review: "Fake review",
  inappropriate_image: "Inappropriate image",
  other: "Other",
};

const STATUS_COLOURS: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  reviewed: "bg-emerald-100 text-emerald-800",
  dismissed: "bg-zinc-100 text-zinc-600",
};

export default function AdminReportsPage() {
  const api = useApi();
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [resolving, setResolving] = useState<number | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/reports", { params: { status: statusFilter, limit: 50 } });
      setReports(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      if (err?.response?.status === 403) setForbidden(true);
    }
    setLoading(false);
  }, [api, statusFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function resolve(id: number, action: "reviewed" | "dismissed") {
    setResolving(id);
    try {
      await api.patch(`/api/admin/reports/${id}/resolve`, { action });
      await fetchReports();
    } catch {}
    setResolving(null);
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

  return (
    <AuthedOnly>
      <Head>
        <title>Reports - Admin - VetMyBuilder</title>
      </Head>
      <div className="min-h-screen bg-slate-900 text-white px-4 pt-20 pb-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold mb-6">Reports</h1>

          <div className="flex gap-2 mb-6">
            {["open", "reviewed", "dismissed", "all"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  statusFilter === s
                    ? "bg-white text-slate-900"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-sm text-slate-500 self-center">{total} total</span>
          </div>

          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : reports.length === 0 ? (
            <p className="text-slate-500">No reports.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOURS[r.status] || "bg-zinc-100 text-zinc-600"}`}>
                          {r.status}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {CATEGORY_LABELS[r.category] || r.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          {r.target_type} #{r.target_id}
                        </span>
                      </div>
                      {r.detail && (
                        <p className="mt-2 text-sm text-slate-300">{r.detail}</p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        Reported by {r.reporter_name || r.reporter_email || r.reporter_uid}
                        {" - "}
                        {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {r.status === "open" && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => resolve(r.id, "reviewed")}
                          disabled={resolving === r.id}
                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          Reviewed
                        </button>
                        <button
                          onClick={() => resolve(r.id, "dismissed")}
                          disabled={resolving === r.id}
                          className="rounded-full bg-slate-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-500 disabled:opacity-50 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
