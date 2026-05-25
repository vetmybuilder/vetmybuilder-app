// web/pages/admin/grant-leads.tsx
//
// Admin inbox for submissions from /free-wall-insulation. Mirrors
// the structure of /admin/trades-pipeline but for inbound demand-side
// leads instead of outbound supply-side discovery.
//
// Left column: filter pills + searchable list.
// Right column: detail panel for the selected lead - answers, contact,
// status buttons, free-text notes, event timeline.

import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type Lead = {
  id: number;
  reference_code: string;
  created_at: string;
  property_type: string;
  tenure: string;
  heating_fuel: string;
  epc_rating: string;
  benefits: string[] | string;
  postcode: string;
  name: string;
  email: string;
  phone: string;
  qualified: "full" | "partial" | "none";
  assigned_tradesperson_uid: string | null;
  status: string;
  source: string | null;
  last_status_at: string | null;
  notes?: string | null;
};

type LeadEvent = {
  id: number;
  event_type: string;
  prev_status: string | null;
  new_status: string | null;
  detail: string | null;
  actor_uid: string | null;
  created_at: string;
};

const STATUS_OPTIONS: { v: string; l: string; tone: string }[] = [
  { v: "new", l: "New", tone: "bg-sky-100 text-sky-800" },
  { v: "emailed", l: "Emailed", tone: "bg-indigo-100 text-indigo-800" },
  { v: "contacted", l: "Contacted", tone: "bg-violet-100 text-violet-800" },
  { v: "surveyed", l: "Surveyed", tone: "bg-amber-100 text-amber-800" },
  { v: "quoted", l: "Quoted", tone: "bg-orange-100 text-orange-800" },
  { v: "won", l: "Won", tone: "bg-emerald-100 text-emerald-800" },
  { v: "lost", l: "Lost", tone: "bg-rose-100 text-rose-800" },
  { v: "dead", l: "Dead", tone: "bg-zinc-200 text-zinc-700" },
];

function statusToneOf(status: string) {
  return STATUS_OPTIONS.find((s) => s.v === status)?.tone ||
    "bg-zinc-100 text-zinc-700";
}

function parseBenefits(b: Lead["benefits"]): string[] {
  if (Array.isArray(b)) return b;
  try {
    const parsed = JSON.parse(b);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AdminGrantLeads() {
  return (
    <AuthedOnly>
      <Head>
        <title>Grant leads - VetMyBuilder admin</title>
      </Head>
      <GrantLeadsInner />
    </AuthedOnly>
  );
}

function GrantLeadsInner() {
  const api = useApi();
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [qualifiedFilter, setQualifiedFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    lead: Lead;
    events: LeadEvent[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (qualifiedFilter !== "all") params.set("qualified", qualifiedFilter);
      if (q.trim()) params.set("q", q.trim());
      params.set("limit", "200");
      const { data } = await api.get(`/api/admin/grant-leads?${params}`);
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setStatusCounts(data.statusCounts || {});
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "fetch failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, qualifiedFilter, q]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const fetchDetail = useCallback(
    async (id: number) => {
      setSelectedId(id);
      setDetail(null);
      try {
        const { data } = await api.get(`/api/admin/grant-leads/${id}`);
        setDetail({ lead: data.lead, events: data.events });
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message || "load failed";
        setError(msg);
      }
    },
    [api],
  );

  const updateStatus = useCallback(
    async (id: number, status: string) => {
      try {
        await api.patch(`/api/admin/grant-leads/${id}`, { status });
        await Promise.all([fetchList(), fetchDetail(id)]);
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message || "update failed";
        setError(msg);
      }
    },
    [api, fetchList, fetchDetail],
  );

  const saveNotes = useCallback(
    async (id: number, notes: string) => {
      try {
        await api.patch(`/api/admin/grant-leads/${id}`, { notes });
        await fetchDetail(id);
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message || "update failed";
        setError(msg);
      }
    },
    [api, fetchDetail],
  );

  const totalAll = useMemo(
    () => Object.values(statusCounts).reduce((a, b) => a + b, 0),
    [statusCounts],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Grant leads</h1>
          <p className="text-sm text-slate-400 mt-1">
            Inbound submissions from{" "}
            <a
              href="/free-wall-insulation"
              className="underline hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              /free-wall-insulation
            </a>
            . Currently routing to Elegant Building by default.
          </p>
        </div>
        <AdminRefreshButton onRefresh={fetchList} />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterPill
          active={statusFilter === "all"}
          count={totalAll}
          label="All"
          onClick={() => setStatusFilter("all")}
        />
        {STATUS_OPTIONS.map((s) => (
          <FilterPill
            key={s.v}
            active={statusFilter === s.v}
            count={statusCounts[s.v] || 0}
            label={s.l}
            onClick={() => setStatusFilter(s.v)}
            tone={s.tone}
          />
        ))}
        <span className="mx-2 h-5 w-px bg-slate-700" />
        {(["all", "full", "partial", "none"] as const).map((q2) => (
          <FilterPill
            key={q2}
            active={qualifiedFilter === q2}
            label={q2 === "all" ? "All verdicts" : q2}
            onClick={() => setQualifiedFilter(q2)}
            tone={
              q2 === "full"
                ? "bg-emerald-100 text-emerald-800"
                : q2 === "partial"
                  ? "bg-amber-100 text-amber-800"
                  : q2 === "none"
                    ? "bg-zinc-200 text-zinc-700"
                    : undefined
            }
          />
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name / email / postcode / reference..."
        className="w-full mb-4 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
      />

      {error && (
        <div className="rounded-xl bg-rose-900/40 border border-rose-700 text-rose-200 px-3 py-2 text-sm mb-4">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
        {/* List */}
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700 overflow-hidden">
          <div className="px-4 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-700">
            {total} lead{total === 1 ? "" : "s"}
          </div>
          {rows.length === 0 && !loading && (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              No leads match the current filters.
            </div>
          )}
          <ul className="divide-y divide-slate-800">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => fetchDetail(r.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-800/80 transition-colors ${
                    selectedId === r.id ? "bg-slate-800" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-extrabold text-white truncate">
                          {r.name}
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {r.reference_code}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-slate-400 mt-0.5 truncate">
                        {r.postcode} · {r.property_type} · {r.heating_fuel} ·
                        EPC {r.epc_rating}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex text-[10.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusToneOf(
                          r.status,
                        )}`}
                      >
                        {r.status}
                      </span>
                      <span
                        className={`inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          r.qualified === "full"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.qualified === "partial"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {r.qualified}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Detail */}
        <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-5 min-h-[300px]">
          {!detail && (
            <div className="text-center text-sm text-slate-400 py-12">
              Select a lead to see the full submission and update status.
            </div>
          )}
          {detail && (
            <LeadDetail
              lead={detail.lead}
              events={detail.events}
              onStatus={(s) => updateStatus(detail.lead.id, s)}
              onSaveNotes={(n) => saveNotes(detail.lead.id, n)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wider transition-all ${
        active
          ? "bg-emerald-500 text-white shadow-sm"
          : tone
            ? tone + " opacity-70 hover:opacity-100"
            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={`ml-1.5 ${
            active ? "text-emerald-100" : "opacity-70"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function LeadDetail({
  lead,
  events,
  onStatus,
  onSaveNotes,
}: {
  lead: Lead;
  events: LeadEvent[];
  onStatus: (s: string) => void;
  onSaveNotes: (n: string) => void;
}) {
  const benefits = parseBenefits(lead.benefits);
  const [notesDraft, setNotesDraft] = useState(lead.notes || "");
  useEffect(() => setNotesDraft(lead.notes || ""), [lead.id, lead.notes]);
  const dirty = notesDraft !== (lead.notes || "");

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
            {lead.reference_code}
          </div>
          <h2 className="text-[20px] font-black text-white leading-tight">
            {lead.name}
          </h2>
          <div className="text-[12px] text-slate-400 mt-0.5">
            Submitted {new Date(lead.created_at).toLocaleString()}
          </div>
        </div>
        <span
          className={`shrink-0 text-[10.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusToneOf(
            lead.status,
          )}`}
        >
          {lead.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Cell label="Email" value={lead.email} mono />
        <Cell label="Phone" value={lead.phone} mono />
        <Cell label="Postcode" value={lead.postcode} mono />
        <Cell label="Source" value={lead.source || "direct"} />
        <Cell label="Property" value={lead.property_type} />
        <Cell label="Tenure" value={lead.tenure} />
        <Cell label="Heating" value={lead.heating_fuel} />
        <Cell label="EPC" value={lead.epc_rating} />
        <Cell label="Verdict" value={lead.qualified} />
        <Cell
          label="Assigned"
          value={
            lead.assigned_tradesperson_uid
              ? lead.assigned_tradesperson_uid
              : "unassigned"
          }
        />
      </div>

      <div className="mb-4">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
          Qualifying benefits
        </div>
        <div className="flex flex-wrap gap-1.5">
          {benefits.length === 0 ? (
            <span className="text-[12px] text-slate-500">(none)</span>
          ) : (
            benefits.map((b) => (
              <span
                key={b}
                className="text-[11px] font-bold bg-slate-700 text-slate-200 rounded-full px-2 py-0.5"
              >
                {b}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
          Update status
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.v}
              onClick={() => onStatus(s.v)}
              disabled={lead.status === s.v}
              className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${s.tone} ${
                lead.status === s.v
                  ? "ring-2 ring-emerald-400 opacity-100"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
          Notes
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Internal notes - what was said on the call, why we lost it, etc."
          className="w-full rounded-xl bg-slate-900/60 border border-slate-700 px-3 py-2 text-[12.5px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          rows={3}
        />
        <button
          onClick={() => onSaveNotes(notesDraft)}
          disabled={!dirty}
          className={`mt-2 rounded-lg px-3 py-1.5 text-[11.5px] font-extrabold ${
            dirty
              ? "bg-emerald-500 text-white"
              : "bg-slate-700 text-slate-500 cursor-not-allowed"
          }`}
        >
          Save notes
        </button>
      </div>

      <div>
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
          Timeline
        </div>
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="text-[11.5px] text-slate-300 border-l-2 border-slate-700 pl-3 py-0.5"
            >
              <span className="font-bold text-slate-200">
                {e.event_type === "status_change"
                  ? `${e.prev_status} → ${e.new_status}`
                  : e.event_type}
              </span>
              <span className="ml-2 text-slate-500">
                {new Date(e.created_at).toLocaleString()}
              </span>
              {e.detail && (
                <div className="text-slate-400 mt-0.5 text-[11px]">
                  {(() => {
                    try {
                      const obj = JSON.parse(e.detail);
                      return Object.entries(obj)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ");
                    } catch {
                      return e.detail;
                    }
                  })()}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-900/40 px-3 py-2">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div
        className={`text-[12.5px] text-white mt-0.5 truncate ${
          mono ? "font-mono" : "font-bold"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
