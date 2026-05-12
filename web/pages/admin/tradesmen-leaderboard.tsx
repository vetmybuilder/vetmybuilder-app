// web/pages/admin/tradesmen-leaderboard.tsx
//
// Admin "Tradesmen Leaderboard" page. Cards-and-drawer layout that
// replaces the older 14-column table - see /tmp/admin-leaderboard-mock.html
// for the design source. Each row is a scannable summary with a
// signals strip; clicking "View" opens a 640px right-side drawer with
// Overview / Docs / Photos / Trades & areas / Activity tabs.
//
// The deeper admin actions that used to live inline (spotlight modal,
// subscription cancel, one-off unlocks) have been moved out of this
// page intentionally - they were each a ~150-line modal that crowded
// the table. They'll come back via the drawer in a follow-up commit.
// The two most-used actions, status change and edit subscription, are
// retained in the row's action menu.
import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import TradesmanDetailDrawer, {
  type LeaderboardItem,
} from "@/components/admin/TradesmanDetailDrawer";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";

type Resp = {
  items: LeaderboardItem[];
  total: number;
  offset: number;
  limit: number;
};

type FilterKey =
  | "webVerifiedOnly"
  | "chVerifiedOnly"
  | "hasPhotos"
  | "hasDocs"
  | "hasDiscount"
  | "hasWebsites";

const FILTER_LABELS: Record<FilterKey, string> = {
  webVerifiedOnly: "Web verified",
  chVerifiedOnly: "CH verified",
  hasPhotos: "≥3 photos",
  hasDocs: "≥2 docs",
  hasDiscount: "Offers discount",
  hasWebsites: "Has website",
};

// Allowlist mirrored server-side in routes/tradesmen/leaderboard.get.js.
// Keep in sync; a value the server doesn't recognise falls back to "score".
type SortKey = "score" | "recent" | "joined" | "photos" | "docs";
const SORT_LABELS: Record<SortKey, string> = {
  score: "Top score",
  recent: "Recently active",
  joined: "Recently joined",
  photos: "Most photos",
  docs: "Most docs",
};

export default function AdminTradesmenLeaderboardPage() {
  const { user } = useAuth();
  const api = useApi();

  const [items, setItems] = useState<LeaderboardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Filters
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("");
  const [near, setNear] = useState("");
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    webVerifiedOnly: false,
    chVerifiedOnly: false,
    hasPhotos: false,
    hasDocs: false,
    hasDiscount: false,
    hasWebsites: false,
  });
  const [sort, setSort] = useState<SortKey>("score");

  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Drawer state
  const [openItem, setOpenItem] = useState<LeaderboardItem | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (trade.trim()) p.set("trade", trade.trim());
    if (near.trim()) p.set("near", near.trim());
    (Object.keys(filters) as FilterKey[]).forEach((k) => {
      if (filters[k]) p.set(k, "1");
    });
    if (sort !== "score") p.set("sort", sort);
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [q, trade, near, filters, sort, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setForbidden(false);
    try {
      const params = Object.fromEntries(new URLSearchParams(queryString));
      const { data } = await api.get<Resp>("/api/tradesmen/leaderboard", {
        params,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const status = err?.response?.status;
      if (status === 403) setForbidden(true);
      else setErr(err?.response?.data?.error || err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api, queryString]);

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, queryString]);

  function toggleFilter(k: FilterKey) {
    setFilters((s) => ({ ...s, [k]: !s[k] }));
    setOffset(0);
  }

  return (
    <AuthedOnly>
      <Head>
        <title>Admin · Tradesmen Leaderboard - VetMyBuilder</title>
        <style>{`body { background: #fef6e9 !important; }`}</style>
      </Head>

      <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-12 relative overflow-hidden">
        <BrandWatermarkScatter />
        <main
          className="relative z-10 mx-auto max-w-6xl px-6 py-8"
          data-testid="admin-leaderboard-page"
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Tradesmen leaderboard
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {loading
                  ? "Loading…"
                  : `${items.length} of ${total} tradespeople`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin"
                className="text-xs font-bold text-slate-500 hover:text-slate-900"
              >
                ← Admin home
              </Link>
              <AdminRefreshButton onRefresh={load} />
            </div>
          </div>

          {/* Search + filter chips */}
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <FilterInput
                label="Search"
                value={q}
                onChange={setQ}
                placeholder="Name or company number"
                testid="filter-q"
              />
              <FilterInput
                label="Trade"
                value={trade}
                onChange={setTrade}
                placeholder="e.g. plumber"
                testid="filter-trade"
              />
              <FilterInput
                label="Near (postcode)"
                value={near}
                onChange={setNear}
                placeholder="e.g. E4"
                testid="filter-near"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => {
                const on = filters[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleFilter(k)}
                    data-testid={`filter-chip-${k}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border-[1.5px] transition-colors ${
                      on
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-amber-200 bg-white text-slate-700 hover:bg-amber-50"
                    }`}
                  >
                    {FILTER_LABELS[k]}
                  </button>
                );
              })}

              {/* Sort dropdown - sits on the same row as the filter
                  chips for compact triage. Keys are kept in sync with
                  the server allowlist; an unknown value falls back to
                  "score" server-side. */}
              <div className="ml-auto flex items-center gap-2">
                <label
                  htmlFor="leaderboard-sort"
                  className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500"
                >
                  Sort
                </label>
                <select
                  id="leaderboard-sort"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as SortKey);
                    setOffset(0);
                  }}
                  data-testid="leaderboard-sort"
                  className="rounded-full bg-white border-[1.5px] border-amber-200 px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-indigo-300 focus:outline-none cursor-pointer"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Error / forbidden states */}
          {forbidden && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 text-rose-700">
              <p className="font-extrabold">Access restricted</p>
              <p className="text-sm mt-0.5">
                You need admin access to view the leaderboard.
              </p>
            </div>
          )}
          {err && !forbidden && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 text-rose-700 mb-4">
              {err}
            </div>
          )}

          {/* Card list */}
          {!forbidden && (
            <div className="space-y-3" data-testid="tradesman-rows">
              {items.length === 0 && !loading && (
                <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-10 text-center text-sm text-slate-500">
                  No tradespeople match the current filters.
                </div>
              )}
              {items.map((item) => (
                <RowCard
                  key={item.userId}
                  item={item}
                  onOpen={() => setOpenItem(item)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!forbidden && total > limit && (
            <div className="flex items-center justify-between mt-6 text-xs">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <div className="text-slate-500">
                Page {Math.floor(offset / limit) + 1} of{" "}
                {Math.max(1, Math.ceil(total / limit))}
              </div>
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Detail drawer */}
      <TradesmanDetailDrawer
        item={openItem}
        onClose={() => setOpenItem(null)}
        onRefresh={load}
      />
    </AuthedOnly>
  );
}

/* ============= Pieces ============= */

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  testid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testid: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        className="w-full bg-amber-50/40 border border-amber-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white"
      />
    </div>
  );
}

function RowCard({
  item,
  onOpen,
}: {
  item: LeaderboardItem;
  onOpen: () => void;
}) {
  const topTrades = (item.trades || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const tradesCount = (item.trades || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;

  return (
    <article
      className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5 hover:shadow-md transition-shadow"
      data-testid={`tradesman-row-${item.userId}`}
    >
      <div className="flex items-start gap-4">
        {/* Score */}
        <div className="shrink-0 w-20 text-center">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-700 mb-0.5">
            VMB
          </div>
          <div className="text-3xl font-black text-slate-900 leading-none">
            {item.score.toFixed(1)}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 truncate">
                {item.company}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {tradesCount} trades · {item.areas || "no areas"}
                {item.companyNumber ? ` · CH ${item.companyNumber}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge s={item.status} />
              <PlanBadge plan={item.plan} />
            </div>
          </div>

          {/* Signals + top trades */}
          <div className="flex items-center gap-2 flex-wrap">
            <IconPill
              icon="📷"
              count={item.photos}
              on={item.photos >= 3}
              tip={`${item.photos} photos`}
            />
            <IconPill
              icon="📄"
              count={item.docs}
              on={item.docs >= 2}
              tip={`${item.docs} docs`}
            />
            <CheckPill icon="🌐" on={!!item.webVerified} tip="Web verified" />
            <CheckPill
              icon="🏢"
              on={!!item.companyNumber}
              tip="Companies House verified"
            />
            <span className="text-slate-300">·</span>
            {topTrades.map((t) => (
              <span
                key={t}
                className="text-[11px] text-slate-600 font-semibold rounded-full bg-slate-100 px-2 py-0.5"
              >
                {t}
              </span>
            ))}
            {tradesCount > topTrades.length && (
              <span className="text-[11px] text-slate-400">
                +{tradesCount - topTrades.length}
              </span>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-slate-400 mb-2 whitespace-nowrap">
            Updated {fmtDate(item.updatedAt)}
          </p>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-2 shadow-sm"
            data-testid={`tradesman-row-view-${item.userId}`}
          >
            View →
          </button>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { cls: string; dot: string }> = {
    active: {
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-500",
    },
    draft: {
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    },
    inactive: {
      cls: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    },
  };
  const m = map[s] || map.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${m.cls} border-[1.5px] px-2.5 py-0.5 text-[11px] font-extrabold`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {s}
    </span>
  );
}

function PlanBadge({ plan }: { plan?: string | null }) {
  if (!plan) return null;
  const cls =
    plan === "free"
      ? "bg-white text-slate-600 border-slate-200"
      : "bg-indigo-50 text-indigo-700 border-indigo-200";
  return (
    <span
      className={`inline-flex items-center rounded-full ${cls} border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em]`}
    >
      {plan}
    </span>
  );
}

function IconPill({
  icon,
  count,
  on,
  tip,
}: {
  icon: string;
  count: number;
  on: boolean;
  tip: string;
}) {
  const color = on ? "text-indigo-700" : "text-slate-500";
  const bg = on
    ? "bg-indigo-50 border-indigo-200"
    : "bg-amber-50/60 border-amber-100";
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 rounded-full ${bg} border-[1.5px] px-2 py-0.5 text-[11px] font-bold ${color}`}
    >
      <span className="text-[13px] leading-none">{icon}</span>
      {count}
    </span>
  );
}

function CheckPill({
  icon,
  on,
  tip,
}: {
  icon: string;
  on: boolean;
  tip: string;
}) {
  const cls = on
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : "bg-slate-50 border-slate-200 text-slate-400";
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 rounded-full ${cls} border-[1.5px] px-2 py-0.5 text-[11px] font-bold`}
    >
      <span>{icon}</span>
      <span>{on ? "✓" : "·"}</span>
    </span>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}
