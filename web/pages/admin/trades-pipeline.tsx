import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { API_ORIGIN } from "@/utils/api";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { getAuth } from "firebase/auth";
import { TRADE_TYPES, type TradeType } from "@/types/tradeTypes";

type PipelineEntry = {
  id: number;
  company_name: string;
  trade_types: string | null;
  service_areas: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
  ch_status: string | null;
  vetting_score: number | null;
  status: "pending" | "approved" | "rejected";
  discovered_at: string;
  ai_review_summary: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  company_number: string | null;
  ch_name: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
};

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400 text-xs">
      {"★".repeat(full)}
      {half ? "½" : ""}
      {"☆".repeat(empty)}
      <span className="ml-1 text-slate-400">{Number(rating).toFixed(1)}</span>
    </span>
  );
}

type DiscoveryLog = { message: string; level?: string; company?: string; score?: number };
type PreviewData = {
  searches: { query: string; trade: string }[];
  estimatedResults: number;
  estimatedQualifying: number;
  estimatedCost: string;
  filters: { minRating: number; minReviews: number };
};

const toggleItem = (arr: string[], item: string) => {
  const s = new Set(arr);
  s.has(item) ? s.delete(item) : s.add(item);
  return Array.from(s);
};
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

const LONDON_BOROUGHS = [
  "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden",
  "City of London", "Croydon", "Ealing", "Enfield", "Greenwich", "Hackney",
  "Hammersmith and Fulham", "Haringey", "Harrow", "Havering", "Hillingdon",
  "Hounslow", "Islington", "Kensington and Chelsea", "Kingston upon Thames",
  "Lambeth", "Lewisham", "Merton", "Newham", "Redbridge", "Richmond upon Thames",
  "Southwark", "Sutton", "Tower Hamlets", "Waltham Forest", "Wandsworth", "Westminster",
];

function DiscoveryPanel({ api, onComplete }: { api: ReturnType<typeof useApi>; onComplete: () => void }) {
  const [open, setOpen] = useState(false);

  // Areas (multi-select with postcode autocomplete)
  const [areas, setAreas] = useState<string[]>([]);
  const [areaQuery, setAreaQuery] = useState("");
  const [areaSuggestions, setAreaSuggestions] = useState<string[]>([]);
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const areaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaBoxRef = useRef<HTMLDivElement>(null);

  // Trades (reuse TRADE_TYPES with buckets + search)
  const [selectedTrades, setSelectedTrades] = useState<string[]>([]);
  const [tradeQuery, setTradeQuery] = useState("");
  const [bucket, setBucket] = useState("");

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<DiscoveryLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Close area dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (areaBoxRef.current && !areaBoxRef.current.contains(e.target as Node)) {
        setAreaDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch area suggestions (deduplicated by outward code)
  function onAreaQueryChange(val: string) {
    setAreaQuery(val);
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    const q = val.trim();
    if (!q) { setAreaSuggestions([]); setAreaDropdownOpen(false); return; }
    areaDebounceRef.current = setTimeout(async () => {
      try {
        const isPostcode = /^[A-Z]{1,2}\d/i.test(q);
        if (isPostcode) {
          const resp = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(q.toUpperCase())}/autocomplete`);
          if (!resp.ok) return;
          const data = await resp.json();
          const postcodes: string[] = data.result || [];
          // Deduplicate by outward code
          const outwards = new Set<string>();
          for (const pc of postcodes) {
            const m = pc.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/i);
            if (m) outwards.add(m[1].toUpperCase());
          }
          const list = [...outwards].sort();
          setAreaSuggestions(list);
          setAreaDropdownOpen(list.length > 0);
        } else {
          // Place and borough search
          const qLower = q.toLowerCase();

          // Match against static borough list first
          const boroughMatches = LONDON_BOROUGHS.filter((b) => b.toLowerCase().includes(qLower));

          // Then search postcodes.io places API
          const resp = await fetch(`https://api.postcodes.io/places?query=${encodeURIComponent(q)}&limit=20`);
          const apiResults: string[] = [];
          if (resp.ok) {
            const data = await resp.json();
            for (const p of (data.result || [])) {
              const name = p.name_1 || p.name1 || p.name || p.locality || "";
              if (name) apiResults.push(name);
              const borough = p.district_borough || "";
              if (borough) apiResults.push(borough);
            }
          }

          // Combine: boroughs first, then API results
          const combined = [...boroughMatches, ...apiResults];
          const unique = [...new Set(combined)].filter((r) => r.toLowerCase().includes(qLower));

          if (unique.length === 0 && q.length >= 3) {
            unique.push(q);
          }
          setAreaSuggestions(unique.slice(0, 8));
          setAreaDropdownOpen(unique.length > 0);
        }
      } catch { /* ignore */ }
    }, 200);
  }

  // Trade filtering (same logic as Step2Trades)
  const activeTypes = TRADE_TYPES.filter((t) => t.active !== false);
  const buckets = uniq(activeTypes.map((t) => t.buckets || "").filter(Boolean));

  const filteredTrades = activeTypes
    .filter((t: TradeType) => {
      if (bucket && (t.buckets || "") !== bucket) return false;
      const q = tradeQuery.trim().toLowerCase();
      if (!q) return true;
      if (t.label.toLowerCase().includes(q)) return true;
      return (t.synonyms || []).some((s) => s.toLowerCase().includes(q));
    })
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.label.localeCompare(b.label));

  function addArea(token: string) {
    const trimmed = token.trim();
    const isPostcode = /^[A-Z]{1,2}\d/i.test(trimmed);
    const value = isPostcode ? trimmed.toUpperCase() : trimmed;
    if (value && !areas.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setAreas((prev) => [...prev, value]);
    }
  }

  function removeArea(a: string) {
    setAreas((prev) => prev.filter((x) => x !== a));
  }

  async function handlePreview() {
    if (areas.length === 0) return;
    setPreviewing(true);
    setPreview(null);
    setLogs([]);
    try {
      const { data } = await api.post("/api/admin/trades-pipeline/discover/preview", {
        trades: selectedTrades.length > 0 ? selectedTrades : undefined,
        areas,
      });
      setPreview(data);
    } catch { /* ignore */ }
    setPreviewing(false);
  }

  async function handleRun() {
    if (areas.length === 0) return;
    setRunning(true);
    setLogs([]);

    try {
      const { data } = await api.post("/api/admin/trades-pipeline/discover/run", {
        trades: selectedTrades.length > 0 ? selectedTrades : undefined,
        areas,
      });

      const jobId = data.jobId;
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken(false) || "";
      const origin = typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://127.0.0.1:3100"
        : "";
      const url = `${origin}/api/admin/trades-pipeline/discover/stream?jobId=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}`;

      const es = new EventSource(url);

      es.addEventListener("progress", (e) => {
        try { setLogs((prev) => [...prev, JSON.parse(e.data)]); } catch { /* ignore */ }
      });

      es.addEventListener("done", (e) => {
        try {
          const d = JSON.parse(e.data);
          setLogs((prev) => [...prev, { message: d.message, level: "done" }]);
        } catch { /* ignore */ }
        es.close();
        setRunning(false);
        onComplete();
      });

      es.addEventListener("error", (e) => {
        const evt = e as MessageEvent;
        if (evt.data) {
          try { setLogs((prev) => [...prev, { message: JSON.parse(evt.data).message, level: "error" }]); } catch { /* ignore */ }
        }
        es.close();
        setRunning(false);
      });

      es.onerror = () => { es.close(); setRunning(false); };
    } catch {
      setRunning(false);
    }
  }

  const logColor = (level?: string) => {
    if (level === "added") return "text-emerald-400";
    if (level === "skip") return "text-slate-500";
    if (level === "warn" || level === "error") return "text-amber-400";
    if (level === "done") return "text-emerald-300 font-semibold";
    return "text-slate-300";
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-4 py-3 text-sm text-slate-400 hover:border-blue-500 hover:text-blue-400 transition-colors w-full text-left"
      >
        + Run Discovery — find tradespeople via Google Places &amp; Companies House
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-700 bg-slate-800/80 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Run Discovery</h2>
        <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-sm">Close</button>
      </div>

      {/* ── Service areas (multi-select via LocationField) ── */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
          Service areas {areas.length > 0 && `(${areas.length})`}
        </label>
        <div className="max-w-md relative" ref={areaBoxRef}>
          <input
            type="text"
            placeholder="Type a postcode or place... e.g. E4, N17, Chingford"
            value={areaQuery}
            onChange={(e) => onAreaQueryChange(e.target.value)}
            onFocus={() => { if (areaSuggestions.length > 0) setAreaDropdownOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const val = areaQuery.trim().toUpperCase();
                if (val) { addArea(areaQuery.trim()); setAreaQuery(""); setAreaSuggestions([]); setAreaDropdownOpen(false); }
              }
            }}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
          {areaDropdownOpen && areaSuggestions.length > 0 && (
            <ul className="absolute z-40 mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 shadow-lg max-h-48 overflow-y-auto">
              {areaSuggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700 transition-colors"
                    onClick={() => {
                      addArea(s);
                      setAreaQuery("");
                      setAreaSuggestions([]);
                      setAreaDropdownOpen(false);
                    }}
                  >{s}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {areas.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {areas.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-blue-600/20 border border-blue-500/30 px-2.5 py-1 text-xs font-semibold text-blue-300">
                {a}
                <button onClick={() => removeArea(a)} className="hover:text-white ml-0.5">&times;</button>
              </span>
            ))}
            <button onClick={() => setAreas([])} className="text-xs text-slate-500 hover:text-red-400 ml-1">Clear all</button>
          </div>
        )}
      </div>

      {/* ── Trade types (searchable with buckets) ── */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
          Trade types
          {selectedTrades.length > 0 && (
            <button onClick={() => setSelectedTrades([])} className="ml-2 text-xs text-slate-500 hover:text-red-400">Clear all</button>
          )}
        </label>
        {selectedTrades.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedTrades.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-blue-600/20 border border-blue-500/30 px-2.5 py-1 text-xs font-semibold text-blue-300">
                {t}
                <button onClick={() => setSelectedTrades((prev) => prev.filter((x) => x !== t))} className="hover:text-white ml-0.5">&times;</button>
              </span>
            ))}
          </div>
        )}

        <input
          type="search"
          className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none mb-2"
          placeholder="Search trades..."
          value={tradeQuery}
          onChange={(e) => setTradeQuery(e.target.value)}
        />

        {/* Bucket filters */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setBucket("")}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              bucket === "" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
            }`}
          >All</button>
          {buckets.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b === bucket ? "" : b)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                bucket === b ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
              }`}
            >{b}</button>
          ))}
        </div>

        {/* Trade pills */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 max-h-48 overflow-y-auto p-3">
          {filteredTrades.length === 0 ? (
            <p className="text-sm text-slate-500">No matches{tradeQuery ? ` for "${tradeQuery}"` : ""}.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filteredTrades.map((t) => {
                const checked = selectedTrades.includes(t.label);
                return (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => setSelectedTrades(toggleItem(selectedTrades, t.label))}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      checked
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                    }`}
                  >{t.label}</button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePreview}
          disabled={areas.length === 0 || previewing || running}
          className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white"
        >
          {previewing ? "Estimating..." : "Preview Cost"}
        </button>

        {preview && !running && (
          <button
            onClick={handleRun}
            disabled={running}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white"
          >
            Run Discovery
          </button>
        )}
      </div>

      {/* ── Preview results ── */}
      {preview && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm space-y-1">
          <p><span className="text-slate-500">Searches:</span> <span className="text-white">{preview.searches.length}</span></p>
          <p><span className="text-slate-500">Estimated results:</span> <span className="text-white">~{preview.estimatedResults}</span></p>
          <p><span className="text-slate-500">Estimated qualifying:</span> <span className="text-white">~{preview.estimatedQualifying}</span></p>
          <p><span className="text-slate-500">Estimated cost:</span> <span className="text-amber-400 font-semibold">{preview.estimatedCost}</span></p>
          <p className="text-xs text-slate-500 mt-2">Filters: rating &ge; {preview.filters.minRating}, reviews &ge; {preview.filters.minReviews}</p>
        </div>
      )}

      {/* ── Progress log ── */}
      {logs.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
          {logs.map((l, i) => (
            <div key={i} className={logColor(l.level)}>{l.message}</div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {running && (
        <p className="text-sm text-blue-400 animate-pulse">Discovery running...</p>
      )}
    </div>
  );
}

export default function TradesPipelinePage() {
  const api = useApi();
  const [items, setItems] = useState<PipelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [tradeFilter, setTradeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actioning, setActioning] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      if (tradeFilter) params.set("trade", tradeFilter);
      params.set("limit", String(limit));
      params.set("offset", String(offset));

      const { data } = await api.get(`/api/admin/trades-pipeline?${params.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      if (err?.response?.status === 403) setForbidden(true);
    }
    setLoading(false);
  }, [api, q, statusFilter, tradeFilter, offset]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function onSearchChange(val: string) {
    setQ(val);
    setOffset(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchItems(), 300);
  }

  async function updateStatus(id: number, status: "approved" | "rejected") {
    setActioning(id);
    try {
      await api.patch(`/api/admin/trades-pipeline/${id}`, { status });
      await fetchItems();
      setExpandedId(null);
    } catch {}
    setActioning(null);
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

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AuthedOnly>
      <Head>
        <title>Trades Pipeline - Admin - VetMyBuilder</title>
      </Head>
      <div className="min-h-screen bg-slate-900 text-white px-4 pt-20 pb-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold">Trades Pipeline</h1>
            <AdminRefreshButton onRefresh={fetchItems} />
            <button
              type="button"
              onClick={async () => {
                try {
                  const { data } = await api.post("/api/admin/trades-pipeline/reverify");
                  alert(`Re-verified: ${data.updated} of ${data.total} updated`);
                  fetchItems();
                } catch { alert("Re-verify failed"); }
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors"
            >
              Re-verify CH
            </button>
          </div>

          {/* Discovery panel */}
          <DiscoveryPanel api={api} onComplete={fetchItems} />

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              placeholder="Search by company name or trade..."
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              data-testid="pipeline-search"
            />
            <input
              type="text"
              placeholder="Filter by trade..."
              value={tradeFilter}
              onChange={(e) => { setTradeFilter(e.target.value); setOffset(0); }}
              className="w-48 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              data-testid="pipeline-status-filter"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-slate-500">No entries found.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-sm" data-testid="pipeline-table">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold text-slate-400 uppercase">
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Trades</th>
                      <th className="px-4 py-3">Area</th>
                      <th className="px-4 py-3">Rating</th>
                      <th className="px-4 py-3">Reviews</th>
                      <th className="px-4 py-3">CH Status</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Discovered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((entry) => (
                      <>
                        <tr
                          key={entry.id}
                          className="border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          data-testid={`pipeline-row-${entry.id}`}
                        >
                          <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate" title={entry.company_name}>
                            {entry.company_name}
                          </td>
                          <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate" title={entry.trade_types || ""}>
                            {entry.trade_types || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400">{entry.service_areas || "—"}</td>
                          <td className="px-4 py-3">
                            {entry.google_rating != null ? (
                              <StarRating rating={entry.google_rating} />
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400">{entry.google_reviews_count ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{entry.ch_status || "—"}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                            {entry.vetting_score ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${STATUS_BADGE[entry.status] || "bg-zinc-600"}`}>
                              {entry.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {new Date(entry.discovered_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                        </tr>

                        {expandedId === entry.id && (
                          <tr key={`${entry.id}-detail`} className="border-b border-slate-700 bg-slate-800/70">
                            <td colSpan={9} className="px-6 py-5">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {/* Left: AI summary + contact */}
                                <div className="space-y-3">
                                  {entry.ai_review_summary && (
                                    <div>
                                      <p className="text-xs font-semibold text-slate-400 uppercase mb-1">AI Review Summary</p>
                                      <p className="text-sm text-slate-300 leading-relaxed">{entry.ai_review_summary}</p>
                                    </div>
                                  )}
                                  <div className="space-y-1 text-sm">
                                    {entry.phone && (
                                      <p>
                                        <span className="text-slate-500 text-xs">Phone: </span>
                                        <a href={`tel:${entry.phone}`} className="text-blue-400 hover:text-blue-300">{entry.phone}</a>
                                      </p>
                                    )}
                                    {entry.email && (
                                      <p>
                                        <span className="text-slate-500 text-xs">Email: </span>
                                        <a href={`mailto:${entry.email}`} className="text-blue-400 hover:text-blue-300">{entry.email}</a>
                                      </p>
                                    )}
                                    {entry.website && (
                                      <p>
                                        <span className="text-slate-500 text-xs">Website: </span>
                                        <a href={entry.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">{entry.website}</a>
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Right: CH details + actions */}
                                <div className="space-y-3">
                                  <div className="space-y-1 text-sm">
                                    {entry.company_number && (
                                      <p>
                                        <span className="text-slate-500 text-xs">Company No: </span>
                                        <span className="text-slate-300 font-mono">{entry.company_number}</span>
                                      </p>
                                    )}
                                    {entry.ch_name && (
                                      <p>
                                        <span className="text-slate-500 text-xs">CH Name: </span>
                                        <span className="text-slate-300">{entry.ch_name}</span>
                                      </p>
                                    )}
                                  </div>

                                  {/* Quick-check links */}
                                  <div className="pt-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Verify on registers</p>
                                    <div className="flex flex-wrap gap-2">
                                      <a
                                        href={`https://www.gassaferegister.co.uk/find-an-engineer-or-check-the-register/check-a-business/?business_name=${encodeURIComponent(entry.company_name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                      >Gas Safe</a>
                                      <a
                                        href={`https://www.niceic.com/find-a-tradesperson/?keyword=${encodeURIComponent(entry.company_name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                      >NICEIC</a>
                                      <a
                                        href={`https://www.trustmark.org.uk/find-a-tradesperson?keyword=${encodeURIComponent(entry.company_name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                      >TrustMark</a>
                                      <a
                                        href={`https://www.google.com/search?q=${encodeURIComponent(entry.company_name + " site:checkatrade.com")}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                      >Checkatrade</a>
                                      <a
                                        href={`https://www.fmb.org.uk/find-a-builder.html?keywords=${encodeURIComponent(entry.company_name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                      >FMB</a>
                                      <a
                                        href={`https://www.napit.org.uk/consumer/member-search.aspx?keyword=${encodeURIComponent(entry.company_name)}`}
                                        target="_blank" rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                      >NAPIT</a>
                                      {entry.company_name && (
                                        <a
                                          href={`https://www.google.com/search?q=${encodeURIComponent(entry.company_name + " reviews")}`}
                                          target="_blank" rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                                        >Google Reviews</a>
                                      )}
                                    </div>
                                  </div>

                                  {entry.status === "pending" && (
                                    <div className="flex items-center gap-3 pt-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); updateStatus(entry.id, "approved"); }}
                                        disabled={actioning === entry.id}
                                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-1.5 text-sm font-semibold text-white"
                                        data-testid={`btn-approve-${entry.id}`}
                                      >
                                        {actioning === entry.id ? "..." : "Approve"}
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); updateStatus(entry.id, "rejected"); }}
                                        disabled={actioning === entry.id}
                                        className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-1.5 text-sm font-semibold text-white"
                                        data-testid={`btn-reject-${entry.id}`}
                                      >
                                        {actioning === entry.id ? "..." : "Reject"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Showing {items.length} of {total} entries
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-700 disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-700 disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
