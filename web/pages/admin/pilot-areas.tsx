// web/pages/admin/pilot-areas.tsx
//
// Admin console for the pilot launch areas. Lists every borough in the
// static catalog with a toggle for whether jobs from that borough are
// accepted by /api/projects.
//
// PATCH is fired immediately on toggle; the in-process server cache
// invalidates so the next /api/pilot/areas fetch reflects the change.

import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";

type Borough = {
  name: string;
  enabled: boolean;
};

export default function AdminPilotAreas() {
  return (
    <AuthedOnly>
      <PilotAreasInner />
    </AuthedOnly>
  );
}

function PilotAreasInner() {
  const api = useApi();
  const [boroughs, setBoroughs] = useState<Borough[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchBoroughs = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await api.get("/api/admin/pilot-areas");
      setBoroughs(data?.boroughs || []);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to load pilot areas");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchBoroughs();
  }, [fetchBoroughs]);

  async function toggle(name: string, nextEnabled: boolean) {
    if (savingName) return;
    setSavingName(name);
    setErr(null);
    // Optimistic update so the toggle responds immediately.
    setBoroughs((prev) =>
      prev.map((b) => (b.name === name ? { ...b, enabled: nextEnabled } : b)),
    );
    try {
      await api.patch(`/api/admin/pilot-areas/${encodeURIComponent(name)}`, {
        enabled: nextEnabled,
      });
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to save");
      // Roll back on failure.
      setBoroughs((prev) =>
        prev.map((b) =>
          b.name === name ? { ...b, enabled: !nextEnabled } : b,
        ),
      );
    } finally {
      setSavingName(null);
    }
  }

  const enabledCount = boroughs.filter((b) => b.enabled).length;

  return (
    <>
      <Head>
        <title>Pilot launch areas - VetMyBuilder admin</title>
      </Head>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Pilot launch areas</h1>
          <p className="mt-2 text-sm text-slate-400">
            Toggle which London boroughs accept new job postings. Toggling a
            borough off blocks new submissions from any postcode in that
            borough; existing projects are unaffected.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {enabledCount} of {boroughs.length} boroughs enabled
          </p>
        </div>

        {err && (
          <p
            className="mb-4 rounded-lg border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200"
            role="alert"
            data-testid="pilot-areas-error"
          >
            {err}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : (
          <ul
            className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40"
            data-testid="pilot-areas-list"
          >
            {boroughs.map((b) => (
              <li
                key={b.name}
                className="flex items-center justify-between px-4 py-3"
                data-testid={`pilot-area-row-${b.name}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {b.name}
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <span className="text-xs text-slate-400 select-none">
                    {b.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={b.enabled}
                    aria-label={`Toggle ${b.name}`}
                    checked={b.enabled}
                    disabled={savingName === b.name}
                    onChange={(e) => toggle(b.name, e.target.checked)}
                    className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-700 transition-colors checked:bg-emerald-500 disabled:opacity-50"
                    data-testid={`pilot-area-toggle-${b.name}`}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
