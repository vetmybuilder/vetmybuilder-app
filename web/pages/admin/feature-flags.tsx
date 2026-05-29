import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type Flag = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  default: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export default function AdminFeatureFlagsPage() {
  const api = useApi();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/feature-flags");
      setFlags(data.flags || []);
      setForbidden(false);
    } catch (e: any) {
      if (e?.response?.status === 403) setForbidden(true);
      else setErr("Could not load feature flags.");
    }
    setLoading(false);
  }, [api]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  async function toggle(flag: Flag) {
    const next = !flag.enabled;
    setSaving(flag.key);
    setErr(null);
    // Optimistic update
    setFlags((prev) =>
      prev.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f)),
    );
    try {
      await api.post(`/api/admin/feature-flags/${flag.key}`, { enabled: next });
      await fetchFlags();
    } catch (e: any) {
      // Revert on failure
      setFlags((prev) =>
        prev.map((f) => (f.key === flag.key ? { ...f, enabled: flag.enabled } : f)),
      );
      setErr(`Could not update "${flag.label}". Try again.`);
    }
    setSaving(null);
  }

  return (
    <AuthedOnly>
      <Head>
        <title>Feature flags - Admin - VetMyBuilder</title>
      </Head>
      <div className="min-h-screen bg-slate-900 text-white px-4 pt-20 pb-12">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">Feature flags</h1>
            <AdminRefreshButton onRefresh={fetchFlags} />
          </div>
          <p className="text-sm text-slate-400 mb-6">
            Switch features on or off for this environment. Changes take effect
            within about 30 seconds.
          </p>

          {forbidden && (
            <div className="rounded-xl bg-rose-950/60 border border-rose-800 p-4 text-rose-200 text-sm">
              You do not have permission to view this page.
            </div>
          )}

          {err && !forbidden && (
            <div className="rounded-xl bg-amber-950/60 border border-amber-800 p-3 text-amber-200 text-sm mb-4">
              {err}
            </div>
          )}

          {loading && !forbidden && (
            <p className="text-slate-400 text-sm">Loading...</p>
          )}

          {!loading && !forbidden && (
            <div className="grid gap-3">
              {flags.map((flag) => (
                <div
                  key={flag.key}
                  className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[15px] font-extrabold text-white">
                        {flag.label}
                      </p>
                      <code className="text-[11px] text-slate-400 bg-slate-900/70 border border-slate-700 rounded px-1.5 py-0.5">
                        {flag.key}
                      </code>
                      {!flag.enabled && flag.default === false && (
                        <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                          off by default
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-slate-400 leading-snug">
                      {flag.description}
                    </p>
                    {flag.updatedAt && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Last changed {new Date(flag.updatedAt).toLocaleString()}
                        {flag.updatedBy ? ` by ${flag.updatedBy}` : ""}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={flag.enabled}
                    aria-label={`Toggle ${flag.label}`}
                    disabled={saving === flag.key}
                    onClick={() => toggle(flag)}
                    className={`relative shrink-0 inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                      flag.enabled ? "bg-emerald-500" : "bg-slate-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        flag.enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
