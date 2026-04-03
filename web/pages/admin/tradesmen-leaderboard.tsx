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
  purchasedPlan?: string | null; // deprecated but harmless
  pendingPlan?: "free" | "gold" | "platinum" | "spotlight" | string | null; // ⭐ REQUIRED
  spotlightActive?: boolean | null;
  spotlightExpiresAt?: string | null;

  oneOffUnlocks?: number | null;
  oneOffUnlocksPending?: number | null;
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

  // filters
  const [q, setQ] = useState("");
  const [trade, setTrade] = useState("");
  const [near, setNear] = useState("");

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

  const [confirmCancelUid, setConfirmCancelUid] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
      alert(e?.response?.data?.error || "Failed to approve");
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
      alert(e?.response?.data?.error || "Failed to reject");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  async function adminCancel(uid: string, immediate = false) {
    setMutatingUid(uid);
    try {
      const body = immediate ? { immediate: true } : {};
      await api.post(`/api/admin/tradesmen/${uid}/subscription/cancel`, body);
      await load();
    } catch (e: any) {
      setErr(
        e?.response?.data?.error ||
          (immediate
            ? "Failed to cancel now"
            : "Failed to schedule cancellation")
      );
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  /* ========= One-off unlocks (cleaned) ========= */
  async function approveUnlock(uid: string) {
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/unlocks/approve`, {});
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to approve unlock");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  async function rejectUnlock(uid: string) {
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/unlocks/reject`, {});
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to reject unlock");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  async function flag(uid: string) {
    const reason = window.prompt("Reason for flag?");
    if (!reason) return;
    setMutatingUid(uid);
    try {
      await api.post(`/api/admin/tradesmen/${uid}/flag`, {
        reason,
        severity: "warn",
      });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  /* ========= Render helpers ========= */

  const StatusChip = ({
    value,
    userId,
  }: {
    value: Item["status"];
    userId: string;
  }) => {
    const cls =
      value === "active"
        ? "bg-green-50 text-green-700 ring-green-200"
        : value === "inactive"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-50 text-slate-700 ring-slate-200";
    return (
      <span
        data-testid={`tradesman-status-${userId}`}
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

  const planLabel = (p?: Item["plan"]) => (p ? String(p) : "free");

  /* ========= Sorting ========= */
  const getSortVal = (it: Item, key: SortKey): string | number => {
    switch (key) {
      case "company":
        return (it.company || "").toLowerCase();
      case "score":
        return it.score ?? 0;
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
        return it.openFlags ?? 0;
      case "urls":
        return it.urls?.length || 0;
      case "signals":
        return (
          (it.score ?? 0) * 1e9 +
          (it.photos ?? 0) * 1e6 +
          (it.docs ?? 0) * 1e3 +
          (it.likes ?? 0) * 10 +
          (it.wins ?? 0)
        );
      case "unlocks":
        return (it.oneOffUnlocks || 0) * 1e6 + (it.oneOffUnlocksPending || 0);
      case "createdAt":
        return new Date(it.createdAt || 0).getTime();
      case "updatedAt":
        return new Date(it.updatedAt || 0).getTime();
      default:
        return 0;
    }
  };

  const sortedItems = useMemo(() => {
    const arr: Item[] = [...items];
    arr.sort((a, b) => {
      const va = getSortVal(a, sortKey);
      const vb = getSortVal(b, sortKey);

      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }

      const sa = String(va);
      const sb = String(vb);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return arr;
  }, [items, sortKey, sortDir, getSortVal]);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  /* ========= Render ========= */
  return (
    <>
      <Head>
        <title>Admin · Tradesmen Leaderboard</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <AuthedOnly>
        <div data-testid="admin-leaderboard-page" className="relative min-h-screen overflow-x-hidden bg-stone-50 -mt-14">
          {/* Background bands */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

          <div className="relative z-10 mx-auto px-4 pt-8 pb-10 w-full max-w-none">
        <div className="mx-auto px-0 py-0 w-full max-w-none">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">
              Tradesmen Leaderboard (Admin)
            </h1>
          </div>

          {forbidden && (
            <div className="mt-8 rounded-xl border border-red-300 bg-red-50 p-6">
              <h2 className="text-lg font-semibold mb-2">Access restricted</h2>
            </div>
          )}

          {!forbidden && (
            <>
              {err && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {err}
                </div>
              )}

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
                <label className="md:col-span-2 text-sm text-slate-700">
                  <span className="block mb-1">
                    Search (name or company number)
                  </span>
                  <input
                    data-testid="admin-search-input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="e.g. Elegant or 12758227"
                    className="border rounded-lg px-3 py-2 w-full"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="block mb-1">Trade</span>
                  <input
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder="e.g. plumber"
                    className="border rounded-lg px-3 py-2 w-full"
                  />
                </label>
                <label className="text-sm text-slate-700">
                  <span className="block mb-1">Near</span>
                  <input
                    value={near}
                    onChange={(e) => setNear(e.target.value)}
                    placeholder="e.g. E4 or W1A"
                    className="border rounded-lg px-3 py-2 w-full"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    onClick={resetAndSearch}
                    className="rounded-lg px-3 py-2 border bg-black text-white"
                    disabled={loading}
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
                  >
                    Clear
                  </button>
                </div>
                <div className="md:col-span-6 flex flex-wrap gap-4 mt-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={webVerifiedOnly}
                      onChange={(e) => setWebVerifiedOnly(e.target.checked)}
                    />
                    <span>Web verified only</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chVerifiedOnly}
                      onChange={(e) => setChVerifiedOnly(e.target.checked)}
                    />
                    <span>CH verified only</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasPhotos}
                      onChange={(e) => setHasPhotos(e.target.checked)}
                    />
                    <span>Has ≥3 photos</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasDocs}
                      onChange={(e) => setHasDocs(e.target.checked)}
                    />
                    <span>Has ≥2 docs</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasDiscount}
                      onChange={(e) => setHasDiscount(e.target.checked)}
                    />
                    <span>Offers discount</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasWebsites}
                      onChange={(e) => setHasWebsites(e.target.checked)}
                    />
                    <span>Has websites</span>
                  </label>
                </div>
              </div>

              {/* Table */}
              <div className="border rounded-xl">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[13%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[7%]" />
                    <col className="w-[10%]" />
                    <col className="w-[9%]" />
                    <col className="w-[6%]" />
                    <col className="w-[6%]" />
                    <col className="w-[5%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[7%]" />
                    <col className="w-[9%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Company"
                          k="company"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="VMB Score"
                          k="score"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="CH"
                          k="chStatus"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Web"
                          k="webVerified"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Trades"
                          k="trades"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Areas"
                          k="areas"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Status"
                          k="status"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Plan"
                          k="plan"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Flags"
                          k="openFlags"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="URLs"
                          k="urls"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
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
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Unlocks"
                          k="unlocks"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Joined"
                          k="createdAt"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left sticky top-0 bg-gray-50 z-10">
                        <SortHeader
                          label="Updated"
                          k="updatedAt"
                          sortKey={sortKey}
                          setSortKey={setSortKey}
                          sortDir={sortDir}
                          setSortDir={setSortDir}
                        />
                      </th>
                      <th className="text-left px-3 py-2 sticky top-0 bg-gray-50 z-10">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.length === 0 && !loading && (
                      <tr>
                        <td
                          colSpan={15}
                          className="px-3 py-6 text-center text-gray-500"
                        >
                          No results.
                        </td>
                      </tr>
                    )}

                    {sortedItems.map((it) => {
                      const isRowBusy = mutatingUid === it.userId;
                      const urlsToShow = it.urls || [];
                      const isOpen = menuUid === it.userId;

                      const pendingPlan = it.pendingPlan || null;

                      const approved = it.oneOffUnlocks || 0;
                      const pending = it.oneOffUnlocksPending || 0;

                      const unlocksDisplay =
                        pending > 0
                          ? `${approved} (${pending} pending)`
                          : String(approved);

                      const hasPendingUnlock = pending > 0;
                      const canApproveRejectUnlock =
                        hasPendingUnlock && !isRowBusy;

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

                      const effectivePlan = planLabel(it.plan);
                      const canCancel = effectivePlan !== "free" && !isRowBusy;

                      return (
                        <tr
                          key={it.userId}
                          className="border-t align-top"
                          data-testid={`row-${it.userId}`}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium break-words whitespace-normal">
                              {it.company}
                            </div>
                            <div className="text-xs text-gray-500 break-words whitespace-normal">
                              {it.companyNumber || "—"}
                            </div>

                            {pendingPlan && (
                              <div className="mt-1 text-xs text-sky-700">
                                Pending plan: <b>{pendingPlan}</b>
                              </div>
                            )}

                            {hasPendingUnlock && (
                              <div className="mt-1 text-xs text-amber-700">
                                Pending one-off unlock
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2 font-semibold">
                            {it.score.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-xs">{chChip}</td>
                          <td className="px-3 py-2 text-xs">{webChip}</td>
                          <td className="px-3 py-2 text-xs break-words whitespace-normal">
                            {it.trades || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs break-words whitespace-normal">
                            {it.areas || "—"}
                          </td>

                          <td className="px-3 py-2">
                            <StatusChip value={it.status} userId={it.userId} />
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <div className="capitalize">{effectivePlan}</div>

                            {/* Spotlight BADGE */}
                            {it.spotlightActive && (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 ring-1 ring-purple-200">
                                ⭐ Spotlight Active
                                {it.spotlightExpiresAt && (
                                  <span className="opacity-80">
                                    (until{" "}
                                    {new Date(
                                      it.spotlightExpiresAt
                                    ).toLocaleDateString("en-GB")}
                                    )
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Spotlight pending admin */}
                            {!it.spotlightActive &&
                              pendingPlan === "spotlight" && (
                                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                  ⏳ Spotlight Pending
                                </div>
                              )}
                          </td>

                          <td className="px-3 py-2">
                            <FlagChip n={it.openFlags} />
                          </td>

                          <td className="px-3 py-2 text-xs break-words whitespace-normal">
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
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2 text-xs break-words whitespace-normal">
                            <div>Photos: {it.photos}</div>
                            <div>Docs: {it.docs}</div>
                            <div>Warranty: {warrantyText}</div>
                            <div>Discount: {discountText}</div>
                            <div>Likes: {it.likes}</div>
                            <div>Wins: {it.wins}</div>
                          </td>

                          <td className="px-3 py-2 text-xs">
                            {unlocksDisplay}
                          </td>

                          <td className="px-3 py-2 text-xs">
                            {it.createdAt
                              ? new Date(it.createdAt).toLocaleDateString(
                                  "en-GB"
                                )
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {new Date(it.updatedAt).toLocaleDateString("en-GB")}
                          </td>

                          <td className="px-3 py-2">
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
                              >
                                Actions
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" />
                                </svg>
                              </button>

                              {isOpen && (
                                <div
                                  role="menu"
                                  className="absolute right-0 z-20 mt-2 w-56 origin-top-right rounded-lg border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
                                >
                                  {/* Pending plan */}
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-green-50 disabled:opacity-50"
                                    onClick={() => approvePending(it.userId)}
                                    disabled={!pendingPlan || isRowBusy}
                                  >
                                    Approve pending plan
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 disabled:opacity-50"
                                    onClick={() => rejectPending(it.userId)}
                                    disabled={!pendingPlan || isRowBusy}
                                  >
                                    Reject pending plan
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  {/* One-off unlocks */}
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-sky-50 disabled:opacity-50"
                                    onClick={() => approveUnlock(it.userId)}
                                    disabled={!canApproveRejectUnlock}
                                  >
                                    Approve one-off unlock
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 disabled:opacity-50"
                                    onClick={() => rejectUnlock(it.userId)}
                                    disabled={!canApproveRejectUnlock}
                                  >
                                    Reject one-off unlock
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  {/* Cancel subscription */}
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-rose-50 disabled:opacity-50"
                                    onClick={() =>
                                      adminCancel(it.userId, false)
                                    }
                                    disabled={!canCancel}
                                  >
                                    Cancel subscription (period end)
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-rose-50 disabled:opacity-50"
                                    onClick={() => {
                                      setMenuUid(null);
                                      setConfirmCancelUid(it.userId);
                                    }}
                                    disabled={!canCancel}
                                  >
                                    Cancel subscription now
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  {/* Flag */}
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                    onClick={() => flag(it.userId)}
                                    disabled={isRowBusy}
                                  >
                                    Flag tradesman
                                  </button>

                                  <div className="my-1 border-t border-gray-100" />

                                  {/* Status changes */}
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
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
          </div>
        </div>
      </AuthedOnly>

      {/* Confirm Cancel Dialog */}
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

/* ===== SortHeader Component ===== */
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
      className={`flex items-center gap-1 px-3 py-2 hover:bg-gray-100 rounded ${className}`}
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
