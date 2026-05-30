// web/pages/admin/acquisition.tsx
//
// Per-channel funnel for trade acquisition: ref code -> scans -> signups
// -> conversion %. One row per distinct `ref`, sorted by scans desc.
//
// A ref code is whatever string we put into the QR / link / post — e.g.
// `flyer-e4-2026-05`, `nextdoor-e4`, `tiktok-bio`. Codes that we never
// printed but had scans (someone fuzzed the URL) still show up here, so
// outliers are visible rather than hidden.

import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type Row = {
  ref: string;
  scans: number;
  signups: number;
  conversion: number | null;
  firstScan: string | null;
  lastScan: string | null;
};

function fmtPct(v: number | null) {
  if (v == null) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(v: string | null) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(v);
  }
}

export default function AdminAcquisitionPage() {
  const api = useApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get("/api/admin/acquisition/summary");
      setRows(data?.items || []);
      setForbidden(false);
    } catch (e: any) {
      if (e?.response?.status === 403) setForbidden(true);
      else setErr("Could not load acquisition summary.");
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const totalScans = rows.reduce((a, r) => a + (r.scans || 0), 0);
  const totalSignups = rows.reduce((a, r) => a + (r.signups || 0), 0);
  const overall = totalScans > 0 ? totalSignups / totalScans : null;

  return (
    <AuthedOnly>
      <Head>
        <title>Acquisition - Admin - VetMyBuilder</title>
      </Head>
      <div className="min-h-screen bg-slate-900 text-white px-4 pt-20 pb-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">Acquisition</h1>
            <AdminRefreshButton onRefresh={fetchRows} />
          </div>
          <p className="text-sm text-slate-400 mb-6">
            Per-channel funnel for trade signups. Codes come from the{" "}
            <code className="text-slate-300">?ref=</code> query param captured
            on the signup landing page (or via the{" "}
            <code className="text-slate-300">/go/&lt;code&gt;</code> short link).
          </p>

          {forbidden && (
            <div className="rounded-xl bg-rose-950/60 border border-rose-800 p-4 text-rose-200 text-sm">
              You don&apos;t have admin access.
            </div>
          )}

          {err && (
            <div className="rounded-xl bg-rose-950/60 border border-rose-800 p-4 text-rose-200 text-sm mb-4">
              {err}
            </div>
          )}

          {!forbidden && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <Card label="Total scans" value={String(totalScans)} />
                <Card label="Total signups" value={String(totalSignups)} />
                <Card label="Overall conversion" value={fmtPct(overall)} />
              </div>

              <div className="rounded-2xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm" data-testid="acquisition-table">
                  <thead className="bg-slate-800/60 text-slate-300">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Ref</th>
                      <th className="text-right px-4 py-3 font-semibold">Scans</th>
                      <th className="text-right px-4 py-3 font-semibold">Signups</th>
                      <th className="text-right px-4 py-3 font-semibold">Conversion</th>
                      <th className="text-right px-4 py-3 font-semibold">First scan</th>
                      <th className="text-right px-4 py-3 font-semibold">Last scan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {loading && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          Loading...
                        </td>
                      </tr>
                    )}
                    {!loading && rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No scans or attributed signups yet.
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.ref} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-slate-200">{r.ref}</td>
                        <td className="px-4 py-3 text-right">{r.scans}</td>
                        <td className="px-4 py-3 text-right">{r.signups}</td>
                        <td className="px-4 py-3 text-right">{fmtPct(r.conversion)}</td>
                        <td className="px-4 py-3 text-right text-slate-400">
                          {fmtDate(r.firstScan)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">
                          {fmtDate(r.lastScan)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
