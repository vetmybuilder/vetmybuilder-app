import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuUid(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
        <style>{`body { background: #475569 !important; }`}</style>
      </Head>

      <AuthedOnly>
        <div data-testid="admin-leaderboard-page" className="min-h-screen">
          <div className="px-4 pt-6 pb-10 w-full max-w-none">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white">
              Tradesmen Leaderboard
            </h1>
          </div>

          {forbidden && (
            <div className="mt-8 rounded-xl border border-red-800 bg-red-950/60 p-6">
              <h2 className="text-lg font-semibold text-red-300 mb-2">Access restricted</h2>
            </div>
          )}

          {!forbidden && (
            <>
              {err && (
                <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/60 px-4 py-3 text-sm text-amber-300">
                  {err}
                </div>
              )}

              {/* Filters */}
              <div className="rounded-xl border border-slate-400/30 bg-slate-600/40 p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
                  <label className="md:col-span-2 text-xs font-medium text-slate-400">
                    <span className="block mb-1">Search (name or company number)</span>
                    <input
                      data-testid="admin-search-input"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="e.g. Elegant or 12758227"
                      className="w-full rounded-lg border border-slate-400/40 bg-slate-500/50 px-3 py-2 text-sm text-white placeholder:text-slate-300 focus:border-slate-300 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-400">
                    <span className="block mb-1">Trade</span>
                    <input
                      value={trade}
                      onChange={(e) => setTrade(e.target.value)}
                      placeholder="e.g. plumber"
                      className="w-full rounded-lg border border-slate-400/40 bg-slate-500/50 px-3 py-2 text-sm text-white placeholder:text-slate-300 focus:border-slate-300 focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-400">
                    <span className="block mb-1">Near</span>
                    <input
                      value={near}
                      onChange={(e) => setNear(e.target.value)}
                      placeholder="e.g. E4 or W1A"
                      className="w-full rounded-lg border border-slate-400/40 bg-slate-500/50 px-3 py-2 text-sm text-white placeholder:text-slate-300 focus:border-slate-300 focus:outline-none"
                    />
                  </label>
                  <div className="flex items-end gap-2">
                    <button
                      onClick={resetAndSearch}
                      className="rounded-lg px-4 py-2 bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
                      disabled={loading}
                    >
                      {loading ? "Loading…" : "Search"}
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
                      className="rounded-lg px-4 py-2 border border-slate-400/40 text-slate-200 text-sm hover:bg-slate-500/50 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: "Web verified only", checked: webVerifiedOnly, set: setWebVerifiedOnly },
                    { label: "CH verified only", checked: chVerifiedOnly, set: setChVerifiedOnly },
                    { label: "Has ≥3 photos", checked: hasPhotos, set: setHasPhotos },
                    { label: "Has ≥2 docs", checked: hasDocs, set: setHasDocs },
                    { label: "Offers discount", checked: hasDiscount, set: setHasDiscount },
                    { label: "Has websites", checked: hasWebsites, set: setHasWebsites },
                  ].map(({ label, checked, set }) => (
                    <label key={label} className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => set(e.target.checked)}
                        className="accent-slate-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-slate-500/50 overflow-x-auto shadow-sm">
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
                  <thead className="bg-slate-600/80">
                    <tr>
                      {[
                        { label: "Company", k: "company" },
                        { label: "VMB Score", k: "score" },
                        { label: "CH", k: "chStatus" },
                        { label: "Web", k: "webVerified" },
                        { label: "Trades", k: "trades" },
                        { label: "Areas", k: "areas" },
                        { label: "Status", k: "status" },
                        { label: "Plan", k: "plan" },
                        { label: "Flags", k: "openFlags" },
                        { label: "URLs", k: "urls" },
                        { label: "Signals", k: "signals", title: "Sort by composite signals" },
                        { label: "Unlocks", k: "unlocks" },
                        { label: "Joined", k: "createdAt" },
                        { label: "Updated", k: "updatedAt" },
                      ].map(({ label, k, title }) => (
                        <th key={k} className="text-left sticky top-0 bg-slate-600/80 z-10 border-b border-slate-500/60">
                          <SortHeader
                            label={label}
                            k={k as any}
                            title={title}
                            sortKey={sortKey}
                            setSortKey={setSortKey}
                            sortDir={sortDir}
                            setSortDir={setSortDir}
                          />
                        </th>
                      ))}
                      <th className="text-left px-3 py-2 sticky top-0 bg-slate-600/80 z-10 border-b border-slate-500/60 text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-500/30">
                    {sortedItems.length === 0 && !loading && (
                      <tr>
                        <td
                          colSpan={15}
                          className="px-3 py-8 text-center text-slate-500"
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
                          className="align-top bg-slate-700/40 hover:bg-slate-600/40 transition-colors"
                          data-testid={`row-${it.userId}`}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-100 break-words whitespace-normal">
                              {it.company}
                            </div>
                            <div className="text-xs text-slate-500 break-words whitespace-normal">
                              {it.companyNumber || "—"}
                            </div>

                            {pendingPlan && (
                              <div className="mt-1 text-xs text-sky-400">
                                Pending plan: <b>{pendingPlan}</b>
                              </div>
                            )}

                            {hasPendingUnlock && (
                              <div className="mt-1 text-xs text-amber-400">
                                Pending one-off unlock
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2 font-semibold text-slate-200">
                            {it.score.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-xs">{chChip}</td>
                          <td className="px-3 py-2 text-xs">{webChip}</td>
                          <td className="px-3 py-2 text-xs text-slate-300 break-words whitespace-normal">
                            {it.trades || "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-300 break-words whitespace-normal">
                            {it.areas || "—"}
                          </td>

                          <td className="px-3 py-2">
                            <StatusChip value={it.status} userId={it.userId} />
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-300">
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
                              <span className="text-slate-500">—</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {urlsToShow.map((u, i) => (
                                  <a
                                    key={i}
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sky-400 hover:underline break-words"
                                  >
                                    {u.replace(/^https?:\/\//, "")}
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-2 text-xs text-slate-400 break-words whitespace-normal">
                            <div>Photos: {it.photos}</div>
                            <div>Docs: {it.docs}</div>
                            <div>Warranty: {warrantyText}</div>
                            <div>Discount: {discountText}</div>
                            <div>Likes: {it.likes}</div>
                            <div>Wins: {it.wins}</div>
                          </td>

                          <td className="px-3 py-2 text-xs text-slate-300">
                            {unlocksDisplay}
                          </td>

                          <td className="px-3 py-2 text-xs text-slate-400">
                            {it.createdAt
                              ? new Date(it.createdAt).toLocaleDateString("en-GB")
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400">
                            {new Date(it.updatedAt).toLocaleDateString("en-GB")}
                          </td>

                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className={`rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors focus:outline-none ${isRowBusy ? "opacity-50 cursor-not-allowed" : ""}`}
                              onClick={() => setMenuUid(isOpen ? null : it.userId)}
                              disabled={isRowBusy}
                              data-testid={`btn-actions-${it.userId}`}
                            >
                              Actions
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-slate-400">
                  Showing <span className="font-semibold text-slate-200">{sortedItems.length}</span> of <span className="font-semibold text-slate-200">{total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 rounded-lg border border-slate-400/40 text-sm text-slate-200 hover:bg-slate-500/50 disabled:opacity-40 transition-colors"
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
                    className="rounded-lg border border-slate-400/40 bg-slate-500/50 text-white px-2 py-1.5 text-sm"
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}/page
                      </option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-1.5 rounded-lg border border-slate-400/40 text-sm text-slate-200 hover:bg-slate-500/50 disabled:opacity-40 transition-colors"
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
      </AuthedOnly>

      {/* Actions Modal */}
      {menuUid && (() => {
        const it = sortedItems.find(i => i.userId === menuUid);
        if (!it) return null;
        const isBusy = mutatingUid === it.userId;
        const pendingPlan = it.pendingPlan || null;
        const pending = it.oneOffUnlocksPending || 0;
        const effectivePlan = planLabel(it.plan);
        const canCancel = effectivePlan !== "free" && !isBusy;

        const btn = (label: string, onClick: () => void, tone: "default" | "danger" | "success" | "warn" = "default", disabled = false) => (
          <button
            key={label}
            type="button"
            disabled={disabled || isBusy}
            onClick={() => { onClick(); }}
            className={[
              "w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              tone === "danger" ? "bg-rose-50 text-rose-700 hover:bg-rose-100" :
              tone === "success" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" :
              tone === "warn" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" :
              "bg-slate-100 text-slate-700 hover:bg-slate-200",
            ].join(" ")}
          >
            {label}
          </button>
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setMenuUid(null); }}
          >
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-slate-700 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">Actions</p>
                  <h3 className="text-base font-bold text-white truncate">{it.company}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuUid(null)}
                  className="rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Status */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Status</p>
                  <div className="space-y-1.5">
                    {btn("Make active", () => { setStatus(it.userId, "active"); setMenuUid(null); }, "success", it.status === "active")}
                    {btn("Make inactive", () => { setStatus(it.userId, "inactive"); setMenuUid(null); }, "warn", it.status === "inactive")}
                    {btn("Set to draft", () => { setStatus(it.userId, "draft"); setMenuUid(null); }, "default", it.status === "draft")}
                  </div>
                </div>

                {/* Plans */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Plans {pendingPlan && <span className="ml-1 text-sky-500 normal-case">(pending: {pendingPlan})</span>}
                  </p>
                  <div className="space-y-1.5">
                    {btn("Approve pending plan", () => { approvePending(it.userId); setMenuUid(null); }, "success", !pendingPlan)}
                    {btn("Reject pending plan", () => { rejectPending(it.userId); setMenuUid(null); }, "danger", !pendingPlan)}
                  </div>
                </div>

                {/* Unlocks */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    One-off unlocks {pending > 0 && <span className="ml-1 text-amber-500 normal-case">({pending} pending)</span>}
                  </p>
                  <div className="space-y-1.5">
                    {btn("Approve one-off unlock", () => { approveUnlock(it.userId); setMenuUid(null); }, "success", pending === 0)}
                    {btn("Reject one-off unlock", () => { rejectUnlock(it.userId); setMenuUid(null); }, "danger", pending === 0)}
                  </div>
                </div>

                {/* Danger zone */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Danger zone</p>
                  <div className="space-y-1.5">
                    {btn("Flag tradesman", () => { flag(it.userId); }, "danger")}
                    {btn("Cancel at period end", () => { adminCancel(it.userId, false); setMenuUid(null); }, "danger", !canCancel)}
                    {btn("Cancel subscription now", () => { setMenuUid(null); setConfirmCancelUid(it.userId); }, "danger", !canCancel)}
                  </div>
                </div>
              </div>

              {/* View profile link */}
              <div className="border-t border-slate-100 px-5 py-3">
                <Link
                  href={`/tradesman/${it.userId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-sky-600 hover:underline"
                  onClick={() => setMenuUid(null)}
                >
                  View public profile ↗
                </Link>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm Cancel Dialog */}
      {confirmCancelUid && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-[420px] rounded-xl border border-slate-500/50 bg-slate-600 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-2">
              Confirm cancellation
            </h3>
            <p className="text-sm text-slate-300 mb-5">
              This downgrades the user to the Free plan immediately.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg border border-slate-400/50 text-sm text-slate-200 hover:bg-slate-500/50 transition-colors"
                onClick={() => setConfirmCancelUid(null)}
                disabled={mutatingUid === confirmCancelUid}
              >
                Keep plan
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-rose-600 text-sm text-white font-medium hover:bg-rose-500 disabled:opacity-50 transition-colors"
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
      className={`flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-200 uppercase tracking-wide hover:bg-slate-500/50 rounded transition-colors ${className}`}
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
