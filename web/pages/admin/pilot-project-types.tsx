// web/pages/admin/pilot-project-types.tsx
//
// Admin console for the pilot launch project-type catalog. Mirrors
// /admin/pilot-areas but for project categories/leaves instead of
// boroughs. Two granularities:
//
//   - Per-category bulk toggle: flips every leaf inside that category.
//   - Per-leaf toggle: flips a single project type.
//
// PATCH fires immediately on toggle and invalidates the server cache, so
// the next /api/pilot/project-types fetch reflects the change.

import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";

type ProjectType = {
  typeName: string;
  category: string;
  enabled: boolean;
};

type DemandRow = {
  category: string;
  totalTaps: number;
  optedInCount: number;
  lastTapAt: string | null;
};

export default function AdminPilotProjectTypes() {
  return (
    <AuthedOnly>
      <PilotProjectTypesInner />
    </AuthedOnly>
  );
}

function PilotProjectTypesInner() {
  const api = useApi();
  const [types, setTypes] = useState<ProjectType[]>([]);
  const [demand, setDemand] = useState<Map<string, DemandRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchTypes = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await api.get("/api/admin/pilot-project-types");
      setTypes(data?.types || []);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to load project types");
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchDemand = useCallback(async () => {
    try {
      const { data } = await api.get("/api/admin/demand-signals");
      const map = new Map<string, DemandRow>();
      for (const r of data?.byCategory || []) {
        map.set(r.category, r);
      }
      setDemand(map);
    } catch {
      // Demand counts are advisory - if the endpoint fails (e.g. table
      // not yet created on a fresh install) we render zero counts rather
      // than blocking the admin page.
    }
  }, [api]);

  useEffect(() => {
    fetchTypes();
    fetchDemand();
  }, [fetchTypes, fetchDemand]);

  // Group leaves by category, preserving server-side ordering (alpha).
  const grouped = useMemo(() => {
    const byCategory = new Map<string, ProjectType[]>();
    for (const t of types) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category)!.push(t);
    }
    return Array.from(byCategory.entries()).map(([category, leaves]) => ({
      category,
      leaves,
      enabledCount: leaves.filter((l) => l.enabled).length,
      totalCount: leaves.length,
    }));
  }, [types]);

  const enabledCategoryCount = grouped.filter((g) => g.enabledCount > 0).length;
  const enabledLeafCount = types.filter((t) => t.enabled).length;

  async function toggleLeaf(typeName: string, nextEnabled: boolean) {
    if (savingKey) return;
    setSavingKey(`leaf:${typeName}`);
    setErr(null);
    setTypes((prev) =>
      prev.map((t) =>
        t.typeName === typeName ? { ...t, enabled: nextEnabled } : t,
      ),
    );
    try {
      await api.patch(
        `/api/admin/pilot-project-types/${encodeURIComponent(typeName)}`,
        { enabled: nextEnabled },
      );
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to save");
      setTypes((prev) =>
        prev.map((t) =>
          t.typeName === typeName ? { ...t, enabled: !nextEnabled } : t,
        ),
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleCategory(category: string, nextEnabled: boolean) {
    if (savingKey) return;
    setSavingKey(`cat:${category}`);
    setErr(null);
    setTypes((prev) =>
      prev.map((t) =>
        t.category === category ? { ...t, enabled: nextEnabled } : t,
      ),
    );
    try {
      await api.patch(
        `/api/admin/pilot-project-types/category/${encodeURIComponent(category)}`,
        { enabled: nextEnabled },
      );
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to save");
      // Roll back the whole category on failure - cheap because we have
      // the pre-toggle snapshot in scope via the closure.
      setTypes((prev) =>
        prev.map((t) =>
          t.category === category ? { ...t, enabled: !nextEnabled } : t,
        ),
      );
    } finally {
      setSavingKey(null);
    }
  }

  function toggleExpanded(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <>
      <Head>
        <title>Pilot project types - VetMyBuilder admin</title>
      </Head>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            Pilot project types
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Toggle which project categories (and individual work types) accept
            new job postings. Toggling a category off blocks every leaf inside
            it; toggling on enables every leaf. Use the chevron to fine-tune
            individual leaves.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {enabledCategoryCount} of {grouped.length} categories live -{" "}
            {enabledLeafCount} of {types.length} individual work types enabled
          </p>
        </div>

        {err && (
          <p
            className="mb-4 rounded-lg border border-red-700 bg-red-950/50 px-3 py-2 text-sm text-red-200"
            role="alert"
            data-testid="pilot-project-types-error"
          >
            {err}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : (
          <ul
            className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40"
            data-testid="pilot-project-types-list"
          >
            {grouped.map((g) => {
              const allOn = g.enabledCount === g.totalCount;
              const allOff = g.enabledCount === 0;
              const isExpanded = expanded.has(g.category);
              const catSaving = savingKey === `cat:${g.category}`;
              return (
                <li
                  key={g.category}
                  className="px-4 py-3"
                  data-testid={`pilot-category-row-${g.category}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(g.category)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isExpanded}
                      aria-controls={`leaves-${g.category}`}
                    >
                      <span className="text-slate-400 text-sm">
                        {isExpanded ? "v" : ">"}
                      </span>
                      <span className="text-sm font-semibold text-white truncate">
                        {g.category}
                      </span>
                      <span className="text-xs text-slate-500 flex-shrink-0">
                        {g.enabledCount}/{g.totalCount}
                      </span>
                      {(() => {
                        const d = demand.get(g.category);
                        if (!d || d.totalTaps === 0) return null;
                        return (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide flex-shrink-0 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300"
                            title={`${d.totalTaps} taps on "Coming soon", ${d.optedInCount} left contact info`}
                            data-testid={`demand-badge-${g.category}`}
                          >
                            Demand: {d.totalTaps}
                            {d.optedInCount > 0 ? ` (${d.optedInCount} opted in)` : ""}
                          </span>
                        );
                      })()}
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <span className="text-xs text-slate-400 select-none">
                        {allOn
                          ? "All on"
                          : allOff
                            ? "All off"
                            : "Mixed"}
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={allOn}
                        aria-label={`Toggle all ${g.category} project types`}
                        checked={allOn}
                        disabled={catSaving}
                        onChange={(e) =>
                          toggleCategory(g.category, e.target.checked)
                        }
                        className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-700 transition-colors checked:bg-emerald-500 disabled:opacity-50"
                        data-testid={`pilot-category-toggle-${g.category}`}
                      />
                    </label>
                  </div>
                  {isExpanded && (
                    <ul
                      id={`leaves-${g.category}`}
                      className="mt-3 ml-6 divide-y divide-slate-800/70 rounded-lg border border-slate-800/70 bg-slate-950/40"
                    >
                      {g.leaves.map((leaf) => {
                        const leafSaving = savingKey === `leaf:${leaf.typeName}`;
                        return (
                          <li
                            key={leaf.typeName}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                            data-testid={`pilot-leaf-row-${leaf.typeName}`}
                          >
                            <span className="min-w-0 text-xs text-slate-300 truncate">
                              {leaf.typeName}
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-checked={leaf.enabled}
                              aria-label={`Toggle ${leaf.typeName}`}
                              checked={leaf.enabled}
                              disabled={leafSaving}
                              onChange={(e) =>
                                toggleLeaf(leaf.typeName, e.target.checked)
                              }
                              className="h-4 w-8 flex-shrink-0 cursor-pointer appearance-none rounded-full bg-slate-700 transition-colors checked:bg-emerald-500 disabled:opacity-50"
                              data-testid={`pilot-leaf-toggle-${leaf.typeName}`}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
