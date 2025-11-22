// web/pages/admin/tradesmen-leaderboard.tsx
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import Link from "next/link";

/* ========= Types ========= */
type Item = {
  userId: string;
  company: string;
  status: "draft" | "active" | "inactive" | string;
  openFlags: number;
  urls: string[];

  score: number;
  companyNumber: string | null;
  chStatus: string | null;
  webVerified: boolean;
  website: string | null;
  trades: string;
  areas: string;
  photos: number;
  discountMin: number;
  discountMax: number;
  warrantyMonths: number;
  docs: number;

  likes: number;
  wins: number;
  createdAt: string;
  updatedAt: string;

  plan?: "free" | "gold" | "platinum" | string | null;
  purchasedPlan?: "free" | "gold" | "platinum" | string | null;
  purchased_plan?: "free" | "gold" | "platinum" | string | null;

  // New data from API:
  oneOffUnlocks?: number | string | null; // approved count
  oneOffUnlocksPending?: number | string | null; // pending count
  pendingUnlockProjectIds?: number[] | null; // exact pending IDs (optional)
};

type Resp = { items: Item[]; total: number; offset: number; limit: number };

type SortKey =
  | "company"
  | "score"
  | "chStatus"
  | "webVerified"
  | "trades"
  | "areas"
  | "status"
  | "plan"
  | "openFlags"
  | "urls"
  | "signals"
  | "unlocks"
  | "createdAt"
  | "updatedAt";

type SortDir = "asc" | "desc";

export default function AdminTradesmenLeaderboardPage() {
  const { user } = useAuth();
  const api = useApi();

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);

  // redesigned filters
  const [q, setQ] = useState(""); // searches name OR company number
  const [trade, setTrade] = useState(""); // free text
  const [near, setNear] = useState(""); // outward/sector/city

  const [webVerifiedOnly, setWebVerifiedOnly] = useState(false);
  const [chVerifiedOnly, setChVerifiedOnly] = useState(false);
  const [hasPhotos, setHasPhotos] = useState(false);
  const [hasDocs, setHasDocs] = useState(false);
  const [hasDiscount, setHasDiscount] = useState(false);
  const [hasWebsites, setHasWebsites] = useState(false);

  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mutatingUid, setMutatingUid] = useState<string | null>(null);
  const [menuUid, setMenuUid] = useState<string | null>(null);

  // NEW: local confirm dialog state for “Cancel now”
  const [confirmCancelUid, setConfirmCancelUid] = useState<string | null>(null);

  // sorting (default: score desc)
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // one shared ref for click-out detection
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuUid) return;
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) setMenuUid(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuUid(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuUid]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (trade.trim()) p.set("trade", trade.trim());
    if (near.trim()) p.set("near", near.trim());
    if (webVerifiedOnly) p.set("webVerifiedOnly", "1");
    if (chVerifiedOnly) p.set("chVerifiedOnly", "1");
    if (hasPhotos) p.set("hasPhotos", "1");
    if (hasDocs) p.set("hasDocs", "1");
    if (hasDiscount) p.set("hasDiscount", "1");
    if (hasWebsites) p.set("hasWebsites", "1");
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    return p.toString();
  }, [
    q,
    trade,
    near,
    webVerifiedOnly,
    chVerifiedOnly,
    hasPhotos,
    hasDocs,
    hasDiscount,
    hasWebsites,
    limit,
    offset,
  ]);

  async function load() {
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
    } catch (e: any) {
      const status = e?.response?.status ?? e?.status;
      if (status === 403) setForbidden(true);
      else setErr(e?.response?.data?.error || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, queryString]);

  const resetAndSearch = () => {
    setOffset(0);
    load();
  };

  /* ========= Admin actions ========= */
  async function setStatus(
    uid: string,
    status: "draft" | "active" | "inactive"
  ) {
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/status`, { status });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Failed");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  async function approvePending(uid: string) {
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/subscription/approve`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Failed to approve");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  async function rejectPending(uid: string) {
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/subscription/reject`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Failed to reject");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  // ----- Admin cancel subscription (new) -----
  async function adminCancel(uid: string, immediate = false) {
    setMutatingUid(uid);
    const url = `/api/admin/tradesmen/${uid}/subscription/cancel`;
    const body = immediate ? { immediate: true } : {};
    console.log("[admin UI] cancel click", { uid, immediate, url, body });

    try {
      const { data } = await api.post(url, body);
      console.log("[admin UI] cancel response", { uid, immediate, data });
      await load();
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        (immediate
          ? "Failed to cancel now"
          : "Failed to schedule cancellation");
      console.log("[admin UI] cancel error", {
        uid,
        immediate,
        error: msg,
        raw: e,
      });
      setErr(msg);
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }
  // ----- one-off unlocks: no popups, auto if exactly one; otherwise brief banner
  function getPendingIds(it: Item): number[] {
    const arr = Array.isArray(it.pendingUnlockProjectIds)
      ? it.pendingUnlockProjectIds
      : [];
    return arr.filter((n) => Number.isFinite(n));
  }

  async function approveUnlock(uid: string) {
    const row = items.find((i) => i.userId === uid);
    if (!row) return;
    const ids = getPendingIds(row);
    if (ids.length === 0) {
      setErr("No pending unlocks for this tradesman.");
      return;
    }
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/unlocks/approve`, {});
      await load();
    } catch (e: any) {
      const pj = e?.response?.data?.projectIds;
      if (Array.isArray(pj) && pj.length > 1) {
        setErr(
          `Multiple pending unlocks: ${pj.join(
            ", "
          )}. Please approve a specific project from its page.`
        );
      } else {
        setErr(
          e?.response?.data?.error || e?.message || "Failed to approve unlock"
        );
      }
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  async function rejectUnlock(uid: string) {
    const row = items.find((i) => i.userId === uid);
    if (!row) return;
    const ids = getPendingIds(row);
    if (ids.length === 0) {
      setErr("No pending unlocks for this tradesman.");
      return;
    }
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/unlocks/reject`, {});
      await load();
    } catch (e: any) {
      const pj = e?.response?.data?.projectIds;
      if (Array.isArray(pj) && pj.length > 1) {
        setErr(
          `Multiple pending unlocks: ${pj.join(
            ", "
          )}. Please reject a specific project from its page.`
        );
      } else {
        setErr(
          e?.response?.data?.error || e?.message || "Failed to reject unlock"
        );
      }
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  // flag (unchanged)
  async function flag(uid: string) {
    const reason = window.prompt("Reason for flag?"); // unchanged per your note
    if (!reason) return;
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/flag`, {
        reason,
        severity: "warn",
      });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || "Failed");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  /* ========= Render helpers ========= */
  const StatusChip = ({ value }: { value: Item["status"] }) => {
    const cls =
      value === "active"
        ? "bg-green-50 text-green-700 ring-green-200"
        : value === "inactive"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-50 text-slate-700 ring-slate-200";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${cls}`}
      >
        {value}
      </span>
    );
  };

  const Chip = ({
    text,
    tone = "default",
  }: {
    text: string;
    tone?: "default" | "ok" | "none";
  }) => {
    const cls =
      tone === "ok"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : tone === "none"
        ? "bg-slate-50 text-slate-500 ring-slate-200"
        : "bg-sky-50 text-sky-700 ring-sky-200";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${cls}`}
      >
        {text}
      </span>
    );
  };

  const FlagChip = ({ n }: { n: number }) => (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 " +
        (n > 0
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-slate-50 text-slate-600 ring-slate-200")
      }
      title={n > 0 ? `${n} open flag${n === 1 ? "" : "s"}` : "No open flags"}
    >
      {n}
    </span>
  );

  const getPendingPlan = (it: Item) => {
    const current = (it.plan ?? null) as string | null;
    const raw = (it.purchasedPlan ?? it.purchased_plan ?? null) as
      | string
      | null;
    if (!raw) return null;
    return raw === current ? null : raw;
  };

  const planLabel = (p?: Item["plan"]) => (p ? String(p) : "free");

  // ------ Sorting helpers ------
  const asNumberOrNull = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const getSortVal = (it: Item, key: SortKey): string | number => {
    switch (key) {
      case "company":
        return (it.company || "").toLowerCase();
      case "score":
        return asNumberOrNull(it.score) ?? -Infinity;
      case "chStatus":
        return (it.chStatus || "").toLowerCase();
      case "webVerified":
        return it.webVerified ? 1 : 0;
      case "trades":
        return (it.trades || "").toLowerCase();
      case "areas":
        return (it.areas || "").toLowerCase();
      case "status":
        return (it.status || "").toLowerCase();
      case "plan":
        return (planLabel(it.plan) || "").toLowerCase();
      case "openFlags":
        return asNumberOrNull(it.openFlags) ?? -Infinity;
      case "urls":
        return it.urls?.length || 0;
      case "signals": {
        const score = asNumberOrNull(it.score) ?? -Infinity;
        return (
          score * 1e9 +
          (it.photos || 0) * 1e6 +
          (it.docs || 0) * 1e3 +
          (it.likes || 0) * 10 +
          (it.wins || 0)
        );
      }
      case "unlocks": {
        const a = it.oneOffUnlocks;
        const p = it.oneOffUnlocksPending;
        const appr =
          typeof a === "number"
            ? a
            : typeof a === "string" && a.trim()
            ? Number(a)
            : 0;
        const pend =
          typeof p === "number"
            ? p
            : typeof p === "string" && p.trim()
            ? Number(p)
            : 0;
        return appr * 1e6 + pend; // approved first, then pending
      }
      case "createdAt":
        return new Date(it.createdAt || 0).getTime() || 0;
      case "updatedAt":
        return new Date(it.updatedAt || 0).getTime() || 0;
      default:
        return 0;
    }
  };

  const sortedItems = useMemo(() => {
    const copy = items.slice();
    copy.sort((a, b) => {
      const va = getSortVal(a, sortKey);
      const vb = getSortVal(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      const cmp = sa.localeCompare(sb);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  /* ========= Render ========= */
  return (
    <>
      <Head>
        <title>Admin · Tradesmen Leaderboard</title>
      </Head>

      <AuthedOnly>
        <div
          className="mx-auto px-4 py-6 max-w-[1700px]"
          data-testid="admin-tradesmen-leaderboard-page"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">
              Tradesmen Leaderboard (Admin)
            </h1>
          </div>

          {forbidden && (
            <div className="mt-8 rounded-xl border border-red-300 bg-red-50 p-6">
              <h2 className="text-lg font-semibold mb-2">Access restricted</h2>
              <p className="text-sm">Admin role is required.</p>
            </div>
          )}

          {!forbidden && (
            <>
              {/* Inline error banner (for multi-pending unlocks, etc.) */}
              {err && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {err}
                </div>
              )}

              {/* Filters */}
              <div
                className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4"
                data-testid="filters"
              >
                {/* ... unchanged filters ... */}
                <label className="md:col-span-2 text-sm text-slate-700">
                  <span className="block mb-1">
                    Search (name or company number)
                  </span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="e.g. Elegant or 12758227"
                    className="border rounded-lg px-3 py-2 w-full"
                    data-testid="filter-q"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="block mb-1">Trade</span>
                  <input
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder="e.g. plumber"
                    className="border rounded-lg px-3 py-2 w-full"
                    data-testid="filter-trade"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="block mb-1">Near</span>
                  <input
                    value={near}
                    onChange={(e) => setNear(e.target.value)}
                    placeholder="e.g. E4 or W1A"
                    className="border rounded-lg px-3 py-2 w-full"
                    data-testid="filter-near"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    onClick={resetAndSearch}
                    className="rounded-lg px-3 py-2 border bg-black text-white"
                    disabled={loading}
                    data-testid="btn-search"
                  >
                    {loading ? "Loading..." : "Search"}
                  </button>
                  <button
                    onClick={() => {
                      setQ("");
                      setTrade("");
                      setNear("");
                      setWebVerifiedOnly(false);
                      setChVerifiedOnly(false);
                      setHasPhotos(false);
                      setHasDocs(false);
                      setHasDiscount(false);
                      setHasWebsites(false);
                      setOffset(0);
                    }}
                    className="rounded-lg px-3 py-2 border"
                    data-testid="btn-clear"
                  >
                    Clear
                  </button>
                </div>
                <div
                  className="md:col-span-6 flex flex-wrap gap-4 mt-1"
                  data-testid="filter-toggles"
                >
                  {/* ... toggles unchanged ... */}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={webVerifiedOnly}
                      onChange={(e) => setWebVerifiedOnly(e.target.checked)}
                      data-testid="toggle-web-verified"
                    />
                    <span>Web verified only</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chVerifiedOnly}
                      onChange={(e) => setChVerifiedOnly(e.target.checked)}
                      data-testid="toggle-ch-verified"
                    />
                    <span>CH verified only</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasPhotos}
                      onChange={(e) => setHasPhotos(e.target.checked)}
                      data-testid="toggle-has-photos"
                    />
                    <span>Has ≥3 photos</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasDocs}
                      onChange={(e) => setHasDocs(e.target.checked)}
                      data-testid="toggle-has-docs"
                    />
                    <span>Has ≥2 docs</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasDiscount}
                      onChange={(e) => setHasDiscount(e.target.checked)}
                      data-testid="toggle-has-discount"
                    />
                    <span>Offers discount</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasWebsites}
                      onChange={(e) => setHasWebsites(e.target.checked)}
                      data-testid="toggle-has-websites"
                    />
                    <span>Has websites</span>
                  </label>
                </div>
              </div>

              {/* Table */}
              <div
                className="overflow-x-visible border rounded-xl pr-4"
                data-testid="table"
              >
                <table className="w-full table-fixed text-sm">
                  {/* colgroup + thead unchanged */}
                  <colgroup>
                    <col className="w-[12%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[8%]" />
                    <col className="w-[9%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[5%]" />
                    <col className="w-[8%]" />
                    <col className="w-[8%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left">
                        <SortHeader
                          label="Company"
                          k="company"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="VMB Score"
                          k="score"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="CH"
                          k="chStatus"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Web"
                          k="webVerified"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Trades"
                          k="trades"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Areas"
                          k="areas"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Status"
                          k="status"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Plan"
                          k="plan"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Flags"
                          k="openFlags"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="URLs"
                          k="urls"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Signals"
                          k="signals"
                          title="Sort by composite signals"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Unlocks"
                          k="unlocks"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Joined"
                          k="createdAt"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left">
                        <SortHeader
                          label="Updated"
                          k="updatedAt"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left px-2 py-2">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sortedItems.length === 0 && !loading && (
                      <tr>
                        <td
                          colSpan={15}
                          className="px-2 py-6 text-center text-gray-500"
                        >
                          No results.
                        </td>
                      </tr>
                    )}

                    {sortedItems.map((it) => {
                      const isRowBusy = mutatingUid === it.userId;
                      const urlsToShow = it.urls.slice(0, 2);
                      const extra = it.urls.length - urlsToShow.length;
                      const isOpen = menuUid === it.userId;

                      const pendingPlan = getPendingPlan(it);
                      const hasPending = !!pendingPlan;
                      const canApproveReject = hasPending && !isRowBusy;

                      // unlocks display (approved + pending)
                      const a = it.oneOffUnlocks;
                      const p = it.oneOffUnlocksPending;
                      const approved =
                        typeof a === "number"
                          ? a
                          : typeof a === "string" && a.trim() !== ""
                          ? Number(a)
                          : 0;
                      const pending =
                        typeof p === "number"
                          ? p
                          : typeof p === "string" && p.trim() !== ""
                          ? Number(p)
                          : 0;
                      const unlocksDisplay =
                        pending > 0
                          ? `${approved} (${pending} pending)`
                          : String(approved);

                      // NEW: gate unlock actions when there are no pending unlocks
                      const canApproveRejectUnlock = pending > 0 && !isRowBusy;

                      const chChip =
                        (it.chStatus || "").toLowerCase() === "verified" ? (
                          <Chip text="verified" tone="ok" />
                        ) : (
                          <Chip text="None" tone="none" />
                        );

                      const webChip = it.webVerified ? (
                        <Chip text="verified" tone="ok" />
                      ) : (
                        <Chip text="None" tone="none" />
                      );

                      // signal helpers
                      const warrantyText =
                        it.warrantyMonths > 0
                          ? `${it.warrantyMonths} months`
                          : "None";
                      const hasDiscountAny =
                        it.discountMin > 0 || it.discountMax > 0;
                      const discountText = hasDiscountAny
                        ? it.discountMin === it.discountMax
                          ? `${it.discountMax}%`
                          : `${it.discountMin}–${it.discountMax}%`
                        : "None";

                      // NEW: canCancel based on plan !== 'free'
                      const effectivePlan = planLabel(it.plan);
                      const canCancel = effectivePlan !== "free" && !isRowBusy;

                      return (
                        <tr
                          key={it.userId}
                          className="border-t align-top"
                          data-testid={`row-${it.userId}`}
                        >
                          <td className="px-2 py-2">
                            <div className="font-medium break-words whitespace-normal">
                              {it.company}
                            </div>
                            <div className="text-xs text-gray-500 break-words whitespace-normal">
                              {it.companyNumber || "—"}
                            </div>
                            {hasPending && (
                              <div className="mt-1 text-xs text-sky-700">
                                Pending plan: <b>{pendingPlan}</b>
                              </div>
                            )}
                          </td>

                          <td className="px-2 py-2 font-semibold">
                            {it.score.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-xs">{chChip}</td>
                          <td className="px-2 py-2 text-xs">{webChip}</td>
                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            {it.trades || "—"}
                          </td>
                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            {it.areas || "—"}
                          </td>

                          <td className="px-2 py-2">
                            <StatusChip value={it.status} />
                          </td>
                          <td className="px-2 py-2 text-xs">{effectivePlan}</td>
                          <td className="px-2 py-2">
                            <FlagChip n={it.openFlags} />
                          </td>

                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            {urlsToShow.length === 0 ? (
                              "—"
                            ) : (
                              <div className="flex flex-col gap-1">
                                {urlsToShow.map((u, i) => (
                                  <a
                                    key={i}
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="link break-words"
                                  >
                                    {u.replace(/^https?:\/\//, "")}
                                  </a>
                                ))}
                                {extra > 0 && (
                                  <span className="text-gray-500">
                                    +{extra} more
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            <div>Photos: {it.photos}</div>
                            <div>Docs: {it.docs}</div>
                            <div>Warranty: {warrantyText}</div>
                            <div>Discount: {discountText}</div>
                            <div>Likes: {it.likes}</div>
                            <div>Wins: {it.wins}</div>
                          </td>

                          <td className="px-2 py-2 text-xs">
                            {unlocksDisplay}
                          </td>

                          <td className="px-2 py-2 text-xs">
                            {it.createdAt
                              ? new Date(it.createdAt).toLocaleDateString(
                                  "en-GB"
                                )
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {new Date(it.updatedAt).toLocaleDateString("en-GB")}
                          </td>

                          <td className="px-2 py-2">
                            <div
                              className="relative inline-block"
                              ref={isOpen ? menuRef : null}
                            >
                              <button
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={isOpen}
                                className={`inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ${
                                  isRowBusy
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }`}
                                onClick={() =>
                                  setMenuUid((v) =>
                                    v === it.userId ? null : it.userId
                                  )
                                }
                                disabled={isRowBusy}
                                data-testid={`row-actions-${it.userId}`}
                              >
                                Actions
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" />
                                </svg>
                              </button>

                              {isOpen && (
                                <div
                                  role="menu"
                                  className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-lg border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
                                >
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-green-50 disabled:opacity-50"
                                    onClick={() => approvePending(it.userId)}
                                    disabled={!canApproveReject}
                                    title={
                                      canApproveReject
                                        ? `Approve ${pendingPlan} plan`
                                        : "No pending plan to approve"
                                    }
                                  >
                                    Approve pending plan
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 disabled:opacity-50"
                                    onClick={() => rejectPending(it.userId)}
                                    disabled={!canApproveReject}
                                    title={
                                      canApproveReject
                                        ? `Reject ${pendingPlan} plan`
                                        : "No pending plan to reject"
                                    }
                                  >
                                    Reject pending plan
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  {/* One-off unlock approval/rejection (no popups) */}
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50 disabled:opacity-50"
                                    onClick={() => approveUnlock(it.userId)}
                                    disabled={!canApproveRejectUnlock}
                                    title={
                                      canApproveRejectUnlock
                                        ? "Approve a one-off project unlock"
                                        : "No pending unlocks to approve"
                                    }
                                  >
                                    Approve one-off unlock
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 disabled:opacity-50"
                                    onClick={() => rejectUnlock(it.userId)}
                                    disabled={!canApproveRejectUnlock}
                                    title={
                                      canApproveRejectUnlock
                                        ? "Reject a one-off project unlock"
                                        : "No pending unlocks to reject"
                                    }
                                  >
                                    Reject one-off unlock
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  {/* NEW: Admin cancel actions */}
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-rose-50 disabled:opacity-50"
                                    onClick={() =>
                                      adminCancel(it.userId, false)
                                    }
                                    disabled={!canCancel}
                                    title={
                                      canCancel
                                        ? "Cancel at period end"
                                        : "No active subscription to cancel"
                                    }
                                    data-testid={`cancel-subscription-${it.userId}`}
                                  >
                                    Cancel subscription (period end)
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-rose-50 disabled:opacity-50"
                                    onClick={() => {
                                      console.log(
                                        "[admin UI] open confirm cancel-now",
                                        { uid: it.userId }
                                      );
                                      setMenuUid(null);
                                      setConfirmCancelUid(it.userId);
                                    }}
                                    disabled={!canCancel}
                                    title={
                                      canCancel
                                        ? "Cancel immediately"
                                        : "No active subscription to cancel"
                                    }
                                    data-testid={`cancel-subscription-now-${it.userId}`}
                                  >
                                    Cancel subscription now
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                    onClick={() => flag(it.userId)}
                                    disabled={isRowBusy}
                                  >
                                    Flag tradesman
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                                    onClick={() =>
                                      setStatus(it.userId, "active")
                                    }
                                    disabled={
                                      isRowBusy || it.status === "active"
                                    }
                                  >
                                    Make active
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                                    onClick={() =>
                                      setStatus(it.userId, "inactive")
                                    }
                                    disabled={
                                      isRowBusy || it.status === "inactive"
                                    }
                                  >
                                    Make inactive
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                                    onClick={() =>
                                      setStatus(it.userId, "draft")
                                    }
                                    disabled={
                                      isRowBusy || it.status === "draft"
                                    }
                                  >
                                    Set to draft
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  Showing <b>{sortedItems.length}</b> of <b>{total}</b>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 border rounded disabled:opacity-50"
                    disabled={!canPrev || loading}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    data-testid="btn-prev"
                  >
                    Prev
                  </button>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setOffset(0);
                    }}
                    className="border rounded px-2 py-1"
                    data-testid="select-page-size"
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}/page
                      </option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-2 border rounded disabled:opacity-50"
                    disabled={!canNext || loading}
                    onClick={() => setOffset(offset + limit)}
                    data-testid="btn-next"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </AuthedOnly>

      {/* ===== Inline Confirm Dialog (no browser confirm) ===== */}
      {confirmCancelUid && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-[420px] rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold mb-2">
              Confirm cancellation
            </h3>
            <p className="text-sm text-slate-700 mb-4">
              This downgrades user to the Free plan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 border rounded"
                onClick={() => setConfirmCancelUid(null)}
                disabled={mutatingUid === confirmCancelUid}
              >
                Keep plan
              </button>
              <button
                className="px-3 py-2 rounded bg-rose-600 text-white disabled:opacity-50"
                onClick={() => {
                  const uid = confirmCancelUid;
                  setConfirmCancelUid(null);
                  if (uid) adminCancel(uid, true);
                }}
                disabled={mutatingUid === confirmCancelUid}
              >
                Cancel now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ===== SortHeader (uses parent state) ===== */
function SortHeader({
  label,
  k,
  title,
  className = "",
  sortKey,
  setSortKey,
  sortDir,
  setSortDir,
}: {
  label: string;
  k: SortKey;
  title?: string;
  className?: string;
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
}) {
  const active = sortKey === k;
  const dir = active ? sortDir : undefined;
  const defaultDir: SortDir =
    k === "score" ||
    k === "unlocks" ||
    k === "openFlags" ||
    k === "updatedAt" ||
    k === "createdAt"
      ? "desc"
      : "asc";
  return (
    <button
      type="button"
      title={title || `Sort by ${label}`}
      className={`flex items-center gap-1 px-2 py-2 hover:bg-gray-100 rounded ${className}`}
      onClick={() => {
        if (active) setSortDir(dir === "asc" ? "desc" : "asc");
        else {
          setSortKey(k);
          setSortDir(defaultDir);
        }
      }}
      data-testid={`th-sort-${k}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      <span className="text-xs opacity-70">
        {active ? (dir === "asc" ? "▲" : "▼") : "↕︎"}
      </span>
    </button>
  );
}
