import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";

type Range = "24h" | "7d" | "14d" | "30d";

type Stats = {
  range: string;
  ai: { count: number; costPence: number };
  google: { count: number; costPence: number };
  notifications: { total: number; failed: number };
  sseLive: number;
};

type AiRow = {
  feature: string;
  count: number;
  totalPence: number;
  avgLatencyMs: number;
};

type ActivityRow = {
  id: number;
  event: string;
  level: string;
  actorUid: string | null;
  detail: string | null;
  createdAt: string;
};

const RANGES: Range[] = ["24h", "7d", "14d", "30d"];

const EVENT_COLORS: Record<string, string> = {
  "project.": "bg-blue-100 text-blue-700",
  "ai.": "bg-violet-100 text-violet-700",
  "notify.": "bg-emerald-100 text-emerald-700",
  "hire.": "bg-amber-100 text-amber-700",
  "sse.": "bg-rose-100 text-rose-700",
  "rec.": "bg-teal-100 text-teal-700",
  "tradesman.": "bg-cyan-100 text-cyan-700",
  "auth.": "bg-indigo-100 text-indigo-700",
};

function eventColor(event: string): string {
  for (const [prefix, cls] of Object.entries(EVENT_COLORS)) {
    if (event.startsWith(prefix)) return cls;
  }
  return "bg-slate-100 text-slate-700";
}

function penceToPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

const VALID_RANGES: Range[] = ["24h", "7d", "14d", "30d"];

export default function AdminDashboard() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [aiBreakdown, setAiBreakdown] = useState<AiRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [errors, setErrors] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState<Range | null>(null);

  // Set range once from URL on first router ready
  useEffect(() => {
    if (!router.isReady) return;
    if (range !== null) return; // already initialised
    const q = router.query.range as string | undefined;
    setRange(VALID_RANGES.includes(q as Range) ? (q as Range) : "7d");
  }, [router.isReady, router.query.range, range]);

  function changeRange(r: Range) {
    setRange(r);
    router.replace({ query: { range: r } }, undefined, { shallow: true });
  }

  const fetchAll = useCallback(
    async (r: Range) => {
      setLoading(true);
      try {
        const [statsRes, aiRes, activityRes, errorsRes] = await Promise.all([
          api.get(`/api/admin/dashboard/stats?range=${r}`),
          api.get(`/api/admin/dashboard/ai-breakdown?range=${r}`),
          api.get(`/api/admin/dashboard/activity?range=${r}&limit=200`),
          api.get(`/api/admin/dashboard/activity?range=${r}&level=error&limit=5`),
        ]);
        setStats(statsRes.data);
        setAiBreakdown(aiRes.data.items || []);
        setActivity(activityRes.data.items || []);
        setErrors(errorsRes.data.items || []);
      } catch {
        // silently fail — dashboard is non-critical
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  // Keep a ref so the interval always calls the latest fetchAll/range
  const fetchRef = useRef(fetchAll);
  const rangeRef = useRef(range);
  useEffect(() => { fetchRef.current = fetchAll; }, [fetchAll]);
  useEffect(() => { rangeRef.current = range; }, [range]);

  // Fetch only after range is initialised and user is authed
  useEffect(() => {
    if (range && user && !authLoading) fetchAll(range);
  }, [range, user, authLoading, fetchAll]);

  // Poll every 5s using refs to avoid teardown/recreate
  useEffect(() => {
    if (!range || !user || authLoading) return;
    const id = setInterval(() => {
      if (rangeRef.current) fetchRef.current(rangeRef.current);
    }, 5_000);
    return () => clearInterval(id);
  }, [user, authLoading, range]);

  return (
    <AuthedOnly>
      <Head>
        <title>Dashboard — Admin — VetMyBuilder</title>
      </Head>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Title + range picker */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">Operational overview and cost tracking</p>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => changeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  range === r
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard icon="🤖" label="AI Spend" value={stats ? penceToPounds(stats.ai.costPence) : "—"} sub={stats ? `${stats.ai.count} inferences` : ""} />
          <StatCard icon="📍" label="Google API" value={stats ? penceToPounds(stats.google.costPence) : "—"} sub={stats ? `${stats.google.count} lookups` : ""} />
          <StatCard icon="🔔" label="Notifications" value={stats ? String(stats.notifications.total) : "—"} sub={stats ? `sent / ${stats.notifications.failed} failed` : ""} />
          <StatCard icon="📡" label="SSE Live" value={stats ? String(stats.sseLive) : "—"} sub="active connections" />
        </div>

        {/* Two-column: AI breakdown + errors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">AI Inference by Feature</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 text-slate-500 font-semibold">Feature</th>
                  <th className="text-right py-1.5 text-slate-500 font-semibold">Calls</th>
                  <th className="text-right py-1.5 text-slate-500 font-semibold">Cost</th>
                  <th className="text-right py-1.5 text-slate-500 font-semibold">Avg ms</th>
                </tr>
              </thead>
              <tbody>
                {aiBreakdown.map((row) => (
                  <tr key={row.feature} className="border-b border-slate-50">
                    <td className="py-1.5 text-slate-700">{row.feature}</td>
                    <td className="py-1.5 text-right text-slate-700">{row.count}</td>
                    <td className="py-1.5 text-right text-slate-700">{penceToPounds(row.totalPence)}</td>
                    <td className="py-1.5 text-right text-slate-700">{row.avgLatencyMs}</td>
                  </tr>
                ))}
                {aiBreakdown.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-slate-400">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Recent Errors</h2>
            <div className="flex flex-col gap-2">
              {errors.map((e) => (
                <div key={e.id} className="bg-red-50 rounded-lg px-3 py-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-red-800">{e.event}</span>
                    <span className="text-[10px] text-slate-400">{formatTime(e.createdAt)}</span>
                  </div>
                  {e.detail && <p className="text-[11px] text-slate-500 mt-1">{e.detail}</p>}
                </div>
              ))}
              {errors.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">No errors in this period</p>
              )}
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold text-slate-900">Activity Log</h2>
            <span className="text-[11px] text-slate-400">Latest {activity.length}</span>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 text-slate-500 font-semibold w-20">Time</th>
                  <th className="text-left py-1.5 text-slate-500 font-semibold w-36">Event</th>
                  <th className="text-left py-1.5 text-slate-500 font-semibold w-32">User</th>
                  <th className="text-left py-1.5 text-slate-500 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">{formatTime(row.createdAt)}</td>
                    <td className="py-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${eventColor(row.event)}`}>
                        {row.event}
                      </span>
                    </td>
                    <td className="py-1.5 text-slate-700">{row.actorUid || "—"}</td>
                    <td className="py-1.5 text-slate-500 truncate max-w-xs">{row.detail || "—"}</td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400">{loading ? "Loading..." : "No activity in this period"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AuthedOnly>
  );
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{icon}</span>
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
