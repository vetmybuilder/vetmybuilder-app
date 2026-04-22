import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type PricingItem = {
  id: number;
  subtype: string;
  subtype_normalised: string;
  location: string;
  min_pence: number;
  max_pence: number;
  source: "ai" | "manual" | "stub";
  reviewed: number;
  created_at: string;
  updated_at: string;
};

function formatPounds(pence: number) {
  const pounds = pence / 100;
  return pounds >= 1000 ? `£${pounds.toLocaleString("en-GB")}` : `£${pounds}`;
}

export default function AdminPricing() {
  return (
    <AuthedOnly>
      <PricingInner />
    </AuthedOnly>
  );
}

function PricingInner() {
  const api = useApi();
  const [items, setItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMin, setEditMin] = useState("");
  const [editMax, setEditMax] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPricing = useCallback(async () => {
    try {
      const { data } = await api.get("/api/admin/pricing");
      setItems(data?.items || []);
    } catch {}
    setLoading(false);
  }, [api]);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);

  function startEdit(item: PricingItem) {
    setEditingId(item.id);
    setEditMin(String(item.min_pence / 100));
    setEditMax(String(item.max_pence / 100));
  }

  async function saveEdit(id: number) {
    const minPence = Math.round(Number(editMin) * 100);
    const maxPence = Math.round(Number(editMax) * 100);
    if (!Number.isFinite(minPence) || !Number.isFinite(maxPence) || minPence < 0 || maxPence <= minPence) {
      alert("Invalid price range");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/admin/pricing/${id}`, { minPence, maxPence });
      setEditingId(null);
      await fetchPricing();
    } catch {
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const locations = [...new Set(items.map((i) => i.location).filter(Boolean))].sort();
  const filtered = locationFilter
    ? items.filter((i) => i.location === locationFilter)
    : items;
  const reviewed = filtered.filter((i) => i.reviewed).length;
  const aiCount = filtered.filter((i) => i.source === "ai").length;
  const manualCount = filtered.filter((i) => i.source === "manual").length;

  return (
    <>
      <Head>
        <title>Pricing - Admin - VetMyBuilder</title>
      </Head>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-black text-zinc-900">Pricing Lookup</h1>
          <AdminRefreshButton onRefresh={fetchPricing} />
        </div>

        {locations.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-semibold text-zinc-600">Filter by area:</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All areas ({items.length})</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc} ({items.filter((i) => i.location === loc).length})</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{filtered.length}</div>
            <div className="text-xs text-zinc-500 mt-1">Subtypes</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{aiCount}</div>
            <div className="text-xs text-zinc-500 mt-1">AI generated</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{manualCount}</div>
            <div className="text-xs text-zinc-500 mt-1">Manually set</div>
          </div>
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 text-center">
            <div className="text-3xl font-black text-emerald-600">{reviewed}</div>
            <div className="text-xs text-zinc-500 mt-1">Reviewed</div>
          </div>
        </div>

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-zinc-500 text-sm">No pricing data yet. Create some projects to populate the lookup table.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left px-4 py-3 font-semibold text-zinc-600">Job Subtype</th>
                  <th className="text-left px-4 py-3 font-semibold text-zinc-600">Area</th>
                  <th className="text-right px-4 py-3 font-semibold text-zinc-600">Min</th>
                  <th className="text-right px-4 py-3 font-semibold text-zinc-600">Max</th>
                  <th className="text-center px-4 py-3 font-semibold text-zinc-600">Source</th>
                  <th className="text-center px-4 py-3 font-semibold text-zinc-600">Reviewed</th>
                  <th className="text-right px-4 py-3 font-semibold text-zinc-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                    <td className="px-4 py-3 font-medium text-zinc-900">{item.subtype}</td>
                    <td className="px-4 py-3 text-zinc-600 text-xs">{item.location || "All"}</td>
                    {editingId === item.id ? (
                      <>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={editMin}
                            onChange={(e) => setEditMin(e.target.value)}
                            className="w-24 text-right rounded border border-zinc-300 px-2 py-1 text-sm"
                            placeholder="Min £"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={editMax}
                            onChange={(e) => setEditMax(e.target.value)}
                            className="w-24 text-right rounded border border-zinc-300 px-2 py-1 text-sm"
                            placeholder="Max £"
                          />
                        </td>
                        <td />
                        <td />
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => saveEdit(item.id)}
                            disabled={saving}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 mr-2"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-zinc-400 hover:text-zinc-600"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-right text-zinc-700">{formatPounds(item.min_pence)}</td>
                        <td className="px-4 py-3 text-right text-zinc-700">{formatPounds(item.max_pence)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.source === "manual"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : item.source === "ai"
                              ? "bg-violet-50 text-violet-700 border border-violet-200"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                          }`}>
                            {item.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.reviewed ? (
                            <span className="text-emerald-600">&#10003;</span>
                          ) : (
                            <span className="text-zinc-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => startEdit(item)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700"
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
