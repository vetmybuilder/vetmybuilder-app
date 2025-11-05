// web/pages/admin/tradesmen-leaderboard.tsx
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";

type Item = {
  userId: string;
  company: string;
  status: "draft" | "active" | "inactive" | string;
  openFlags: number;
  urls: string[];

  score: number; // 0.0 – 10.0
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

  // NEW
  likes: number;
  wins: number;
  createdAt: string;

  updatedAt: string;
};

type Resp = { items: Item[]; total: number; offset: number; limit: number };

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
  const [minScore, setMinScore] = useState<number>(0);
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

  // one shared ref used to detect click-outs when any menu is open
  const menuRef = useRef<HTMLDivElement | null>(null);

  // close on click outside / ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuUid) return;
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) {
        setMenuUid(null);
      }
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
    if (minScore > 0) p.set("minScore", String(minScore));
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
    minScore,
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
      const response = await api.get<Resp>("/api/tradesmen/leaderboard", {
        params,
      });
      const data = response.data;
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      const status = e?.response?.status ?? e?.status;
      if (status === 403) {
        setForbidden(true);
      } else {
        setErr(e?.response?.data?.error || e?.message || "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, queryString]);

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const resetAndSearch = () => {
    setOffset(0);
    load();
  };

  // ----- Actions -----
  async function setStatus(uid: string, status: "draft" | "active" | "inactive") {
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
      alert(e?.response?.data?.error || e?.message || "Failed");
    } finally {
      setMutatingUid(null);
      setMenuUid(null);
    }
  }

  const StatusChip = ({ value }: { value: Item["status"] }) => {
    const cls =
      value === "active"
        ? "bg-green-50 text-green-700 ring-green-200"
        : value === "inactive"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-slate-50 text-slate-700 ring-slate-200";
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ${cls}`}>
        {value}
      </span>
    );
  };

  const FlagChip = ({ n }: { n: number }) => (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 " +
        (n > 0 ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-600 ring-slate-200")
      }
      title={n > 0 ? `${n} open flag${n === 1 ? "" : "s"}` : "No open flags"}
    >
      {n}
    </span>
  );

  // Small chevron icon
  const Chevron = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 011.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" />
    </svg>
  );

  return (
    <>
      <Head>
        <title>Admin · Tradesmen Leaderboard</title>
      </Head>

      <AuthedOnly>
        {/* Wider page container so the table has more room */}
        <div className="mx-auto px-4 py-6 max-w-[1600px]">
          <h1 className="text-2xl font-semibold mb-4">Tradesmen Leaderboard (Admin)</h1>

          {forbidden && (
            <div className="mt-8 rounded-xl border border-red-300 bg-red-50 p-6">
              <h2 className="text-lg font-semibold mb-2">Access restricted</h2>
              <p className="text-sm">Admin role is required.</p>
            </div>
          )}

          {!forbidden && (
            <>
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search company..."
                  className="border rounded-lg px-3 py-2 md:col-span-2"
                />
                <input
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  placeholder="Trade (e.g., plumber)"
                  className="border rounded-lg px-3 py-2"
                />
                <input
                  value={near}
                  onChange={(e) => setNear(e.target.value)}
                  placeholder="Near (e.g., E4)"
                  className="border rounded-lg px-3 py-2"
                />
                <input
                  type="number"
                  min={0}
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value || 0))}
                  placeholder="Min score"
                  className="border rounded-lg px-3 py-2"
                />
                <button
                  onClick={resetAndSearch}
                  className="rounded-lg px-3 py-2 border bg-black text-white"
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Search"}
                </button>
              </div>

              <div className="flex flex-wrap gap-4 mb-4">
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

              {/* Error */}
              {err && <div className="mb-4 text-sm text-red-600">Request failed: {err}</div>}

              {/* Table */}
              <div className="overflow-x-visible border rounded-xl pr-4">
                <table className="w-full table-fixed text-sm">
                  {/* Rebalanced widths (sum to 100%, more space for Actions) */}
                  <colgroup>
                    <col className="w-[13%]" /> {/* Company */}
                    <col className="w-[6%]" />  {/* Score */}
                    <col className="w-[5%]" />  {/* CH */}
                    <col className="w-[5%]" />  {/* Web */}
                    <col className="w-[8%]" />  {/* Trades */}
                    <col className="w-[10%]" /> {/* Areas */}
                    <col className="w-[6%]" />  {/* Status */}
                    <col className="w-[5%]" />  {/* Flags */}
                    <col className="w-[8%]" />  {/* URLs */}
                    <col className="w-[8%]" />  {/* Signals */}
                    <col className="w-[6%]" />  {/* Member Since */}
                    <col className="w-[13%]" /> {/* Updated */}
                    <col className="w-[7%]" />  {/* Actions */}
                  </colgroup>

                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-2 py-2">Company</th>
                      <th className="text-left px-2 py-2">VMB Score</th>
                      <th className="text-left px-2 py-2">CH</th>
                      <th className="text-left px-2 py-2">Web</th>
                      <th className="text-left px-2 py-2">Trades</th>
                      <th className="text-left px-2 py-2">Areas</th>
                      <th className="text-left px-2 py-2">Status</th>
                      <th className="text-left px-2 py-2">Flags</th>
                      <th className="text-left px-2 py-2">URLs</th>
                      <th className="text-left px-2 py-2">Signals</th>
                      <th className="text-left px-2 py-2">Member Since</th>
                      <th className="text-left px-2 py-2">Updated</th>
                      <th className="text-left px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && !loading && (
                      <tr>
                        <td colSpan={13} className="px-2 py-6 text-center text-gray-500">
                          No results.
                        </td>
                      </tr>
                    )}
                    {items.map((it) => {
                      const isRowBusy = mutatingUid === it.userId;
                      const urlsToShow = it.urls.slice(0, 2);
                      const extra = it.urls.length - urlsToShow.length;
                      const isOpen = menuUid === it.userId;

                      return (
                        <tr key={it.userId} className="border-t align-top">
                          <td className="px-2 py-2">
                            <div className="font-medium break-words whitespace-normal">{it.company}</div>
                            <div className="text-xs text-gray-500 break-words whitespace-normal">
                              {it.companyNumber || "—"}
                            </div>
                          </td>
                          <td className="px-2 py-2 font-semibold">{it.score.toFixed(1)}</td>
                          <td className="px-2 py-2 text-xs">{it.chStatus || "—"}</td>
                          <td className="px-2 py-2 text-xs">
                            {it.webVerified ? "Verified" : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            {it.trades || "—"}
                          </td>
                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            {it.areas || "—"}
                          </td>
                          <td className="px-2 py-2"><StatusChip value={it.status} /></td>
                          <td className="px-2 py-2"><FlagChip n={it.openFlags} /></td>
                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            {urlsToShow.length === 0 ? (
                              "—"
                            ) : (
                              <div className="flex flex-col gap-1">
                                {urlsToShow.map((u, i) => (
                                  <a key={i} href={u} target="_blank" rel="noreferrer" className="link break-words">
                                    {u.replace(/^https?:\/\//, "")}
                                  </a>
                                ))}
                                {extra > 0 && (
                                  <span className="text-gray-500">+{extra} more</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs break-words whitespace-normal">
                            <div>Photos: {it.photos}</div>
                            <div>Docs: {it.docs}</div>
                            <div>Warranty: {it.warrantyMonths} mo</div>
                            <div>
                              Discount:{" "}
                              {it.discountMin > 0 || it.discountMax > 0
                                ? it.discountMin === it.discountMax
                                  ? `${it.discountMax}%`
                                  : `${it.discountMin}–${it.discountMax}%`
                                : "—"}
                            </div>
                            <div>Likes: {it.likes}</div>
                            <div>Wins: {it.wins}</div>
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {it.createdAt
                              ? new Date(it.createdAt).toLocaleDateString("en-GB")
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {new Date(it.updatedAt).toLocaleString()}
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
                                  isRowBusy ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                onClick={() =>
                                  setMenuUid((v) => (v === it.userId ? null : it.userId))
                                }
                                disabled={isRowBusy}
                              >
                                Actions <Chevron />
                              </button>

                              {isOpen && (
                                <div
                                  role="menu"
                                  className="absolute right-0 z-20 mt-2 w-48 origin-top-right rounded-lg border border-gray-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
                                >
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
                                    onClick={() => setStatus(it.userId, "active")}
                                    disabled={isRowBusy || it.status === "active"}
                                  >
                                    Make active
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                                    onClick={() => setStatus(it.userId, "inactive")}
                                    disabled={isRowBusy || it.status === "inactive"}
                                  >
                                    Make inactive
                                  </button>
                                  <button
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                                    onClick={() => setStatus(it.userId, "draft")}
                                    disabled={isRowBusy || it.status === "draft"}
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
                  Showing <b>{items.length}</b> of <b>{total}</b>
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
      </AuthedOnly>
    </>
  );
}
