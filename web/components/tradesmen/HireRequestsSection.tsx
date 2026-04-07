// web/components/tradesmen/HireRequestsSection.tsx
//
// "Hire requests" section on the tradesman dashboard. Fetches the calling
// tradesman's incoming hire requests via /api/tradesmen/me/hires and renders
// them as cards, split into Active vs Past tabs.
//
// Active = pending + accepted (the ones the tradesman cares about right now)
// Past   = declined + cancelled + expired (history)

import * as React from "react";
import { useApi } from "@/utils/api";
import HireRequestCard, { type HireRequest } from "./HireRequestCard";
import { Briefcase } from "lucide-react";

type Tab = "active" | "past";

const ACTIVE_STATUSES: HireRequest["status"][] = ["pending", "accepted"];
const PAST_STATUSES: HireRequest["status"][] = [
  "declined",
  "cancelled",
  "expired",
];

export default function HireRequestsSection() {
  const api = useApi();

  const [hires, setHires] = React.useState<HireRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("active");

  const fetchHires = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/api/tradesmen/me/hires");
      setHires(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to load hire requests",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    fetchHires();
  }, [fetchHires]);

  const activeHires = hires.filter((h) => ACTIVE_STATUSES.includes(h.status));
  const pastHires = hires.filter((h) => PAST_STATUSES.includes(h.status));
  const visibleHires = tab === "active" ? activeHires : pastHires;

  return (
    <section
      data-testid="hire-requests-section"
      className="mb-8"
      aria-label="Hire requests"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-red-500" />
          <h2 className="text-xl font-bold text-zinc-900">Hire requests</h2>
          {activeHires.length > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white"
              data-testid="hire-requests-active-count"
            >
              {activeHires.length}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-xl bg-stone-100 p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          data-testid="hire-requests-tab-active"
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            tab === "active"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Active{activeHires.length > 0 && ` (${activeHires.length})`}
        </button>
        <button
          type="button"
          onClick={() => setTab("past")}
          data-testid="hire-requests-tab-past"
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            tab === "past"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Past{pastHires.length > 0 && ` (${pastHires.length})`}
        </button>
      </div>

      {loading && (
        <div
          className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500"
          data-testid="hire-requests-loading"
        >
          Loading hire requests…
        </div>
      )}

      {error && !loading && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          data-testid="hire-requests-error"
        >
          {error}
        </div>
      )}

      {!loading && !error && visibleHires.length === 0 && (
        <div
          className="rounded-xl border border-zinc-200 bg-white p-6 text-center"
          data-testid="hire-requests-empty"
        >
          <p className="text-sm text-zinc-500">
            {tab === "active"
              ? "No hire requests yet. When a homeowner hires you, you'll see it here."
              : "No past hire requests."}
          </p>
        </div>
      )}

      {!loading && !error && visibleHires.length > 0 && (
        <div className="space-y-3" data-testid="hire-requests-list">
          {visibleHires.map((h) => (
            <HireRequestCard
              key={h.id}
              hire={h}
              onResponded={fetchHires}
            />
          ))}
        </div>
      )}
    </section>
  );
}
