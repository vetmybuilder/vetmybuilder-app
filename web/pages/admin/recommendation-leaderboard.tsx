import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/* ========= Types ========= */
type Row = {
  id: number;
  projectId: number | null;
  company: string;
  name: string | null;
  createdAt: string;
  fromFriend: 0 | 1;
  fromCommunity: 0 | 1;
  likes: number;
  recPhotos: number;
  completionWins: number;
  completionPhotos: number;
  legacyWins: number;
  wouldAgain: number;
  chStatus: string | null;
  chScore: number | null;
  score: number; // debug score – now treated as fallback only
};

type SortKey =
  | "company"
  | "score"
  | "likes"
  | "recPhotos"
  | "completionWins"
  | "chScore"
  | "createdAt";

type SortDir = "asc" | "desc";

export default function AdminRecommendationLeaderboardPage() {
  return (
    <AuthedOnly>
      <AdminGate />
    </AuthedOnly>
  );
}

/** Gate: verify admin by probing an existing admin-only route */
function AdminGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "forbidden">(
    "checking"
  );

  useEffect(() => {
    let alive = true;
    if (!router.isReady || authLoading) return;

    try {
      if (sessionStorage.getItem("vmb:isAdmin") === "1") {
        setStatus("ok");
        return;
      }
    } catch {}

    (async () => {
      try {
        await api.get("/api/admin/tradesmen", {
          params: { page: 1, pageSize: 1, status: "all" },
        });
        if (!alive) return;
        try {
          sessionStorage.setItem("vmb:isAdmin", "1");
        } catch {}
        setStatus("ok");
      } catch {
        if (!alive) return;
        setStatus("forbidden");
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading]);

  if (status === "checking") {
    return (
      <div className="px-4 py-10 text-sm text-slate-300">
        Loading…
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
        <div
          className="rounded-2xl border border-amber-500/40 bg-amber-900/30 p-6"
          data-testid="forbidden-message"
        >
          <h2 className="text-lg font-semibold text-amber-200">Access restricted</h2>
          <p className="mt-1 text-sm text-amber-200/80">
            Your account didn&apos;t pass the admin check (
            <code>/api/admin/tradesmen</code>). Ensure your{" "}
            <code>user_roles.role</code> is <code>&quot;admin&quot;</code> or your email
            is in <code>ADMIN_EMAILS</code>.
          </p>
          <div className="mt-4">
            <Link
              href="/projects"
              className="inline-flex items-center rounded-lg border border-slate-400/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500/50 transition-colors"
            >
              Back to Projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminLeaderboardInner />;
}

/** Recommendation leaderboard (debug aggregate, but canonical VMB scoring per rec ID) */
function AdminLeaderboardInner() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // local filters (client-side)
  const [q, setQ] = useState(""); // search company/name
  const [friendOnly, setFriendOnly] = useState(false);
  const [communityOnly, setCommunityOnly] = useState(false);
  const [hasPhotos, setHasPhotos] = useState(false); // recPhotos or completionPhotos
  const [hasWins, setHasWins] = useState(false); // completionWins or legacyWins
  const [hasCH, setHasCH] = useState(false); // chScore != null

  // sorting (default: score desc)
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 🔹 Canonical VMB scores per recommendation ID (from /api/recommendations/ratings)
  // key: recommendationId, value: canonical VMB (same as project cards)
  const [ratingByRecId, setRatingByRecId] = useState<Record<number, number>>(
    {}
  );

  useEffect(() => {
    let alive = true;
    if (authLoading || !user) return;

    setLoading(true);
    setErr(null);

    api
      .get("/api/admin/recommendation-leaderboard")
      .then(({ data }) => {
        if (!alive) return;
        const items: Row[] = Array.isArray(data?.items) ? data.items : [];
        setRows(items);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.response?.data?.error || e?.message || "Failed");
        setRows([]);
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [api, authLoading, user]);

  // 🔹 Fetch canonical scores from /api/recommendations/ratings per project
  useEffect(() => {
    if (!rows.length) {
      setRatingByRecId({});
      return;
    }

    let cancelled = false;

    (async () => {
      const scores: Record<number, number> = {};

      // unique projectIds from debug rows
      const projectIds = Array.from(
        new Set(
          rows
            .map((r) => r.projectId)
            .filter((p): p is number => typeof p === "number" && p > 0)
        )
      );

      for (const projectId of projectIds) {
        try {
          const { data } = await api.get(
            `/api/recommendations/ratings?projectId=${projectId}&offset=0&limit=250`
          );

          const items = Array.isArray(data?.items) ? data.items : [];
          for (const it of items) {
            const idNum = Number(it.id);
            const val = Number(it.score);
            if (!Number.isFinite(idNum) || !Number.isFinite(val)) continue;
            scores[idNum] = val;
          }
        } catch (e) {
          // If a project is not accessible (e.g. not live / not owner), just skip it.
          // eslint-disable-next-line no-console
          console.warn("[admin rec leaderboard] ratings fetch failed", {
            projectId,
            error: e,
          });
          continue;
        }
      }

      if (!cancelled) {
        setRatingByRecId(scores);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, api]);

  const asNumberOrNull = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // canonical score: ratings score if we have it, else fall back to debug score
  const getCanonicalScore = (r: Row): number | null => {
    const override = ratingByRecId[r.id];
    if (Number.isFinite(override)) return override;
    const fallback = asNumberOrNull(r.score);
    return fallback;
  };

  // 🔹 Filtered rows (client-side)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const haystack = `${r.company || ""} ${r.name || ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (friendOnly && r.fromFriend !== 1) return false;
      if (communityOnly && r.fromCommunity !== 1) return false;
      if (hasPhotos && r.recPhotos + r.completionPhotos <= 0) return false;
      if (hasWins && r.completionWins + r.legacyWins <= 0) return false;
      if (hasCH && r.chScore == null) return false;
      return true;
    });
  }, [rows, q, friendOnly, communityOnly, hasPhotos, hasWins, hasCH]);

  const getSortVal = (r: Row, key: SortKey): string | number => {
    switch (key) {
      case "company":
        return (r.company || "").toLowerCase();
      case "score": {
        const s = getCanonicalScore(r);
        return s != null ? s : -Infinity;
      }
      case "likes":
        return asNumberOrNull(r.likes) ?? -Infinity;
      case "recPhotos":
        return asNumberOrNull(r.recPhotos) ?? -Infinity;
      case "completionWins":
        return asNumberOrNull(r.completionWins) ?? -Infinity;
      case "chScore":
        return asNumberOrNull(r.chScore) ?? -Infinity;
      case "createdAt":
        return new Date(r.createdAt || 0).getTime() || 0;
      default:
        return 0;
    }
  };

  const sortedRows = useMemo(() => {
    const copy = filtered.slice();
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
  }, [filtered, sortKey, sortDir]);

  // 🔹 Top row = highest canonical score in the sorted list
  const topId = useMemo(() => {
    if (!sortedRows.length) return null;
    return sortedRows[0].id;
  }, [sortedRows]);

  const resetFilters = () => {
    setQ("");
    setFriendOnly(false);
    setCommunityOnly(false);
    setHasPhotos(false);
    setHasWins(false);
    setHasCH(false);
  };

  const Tick = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z" />
    </svg>
  );

  return (
    <>
      <Head>
        <title>Admin · Recommendation Leaderboard</title>
        <style>{`body { background: #475569 !important; }`}</style>
      </Head>

      <div className="px-4 pt-6 pb-10 w-full max-w-none">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-white">
            Recommendation Leaderboard
          </h1>
          <p className="text-sm text-slate-300">
            Global · Canonical VMB score from recommendations, wins and photos
          </p>
        </div>

        {/* Filters */}
        <div
          className="rounded-xl border border-slate-400/30 bg-slate-600/40 p-4 mb-4"
          data-testid="rec-filters"
        >
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-slate-300 mb-1">
                Search (company or contact)
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. Elegant, Connect2Find"
                className="w-full rounded-lg border border-slate-400/40 bg-slate-500/50 px-3 py-2 text-sm text-white placeholder:text-slate-300 focus:border-slate-300 focus:outline-none"
                data-testid="rec-filter-q"
              />
            </div>
            <button
              onClick={resetFilters}
              className="rounded-lg px-4 py-2 border border-slate-400/40 text-slate-200 text-sm hover:bg-slate-500/50 transition-colors"
              data-testid="rec-btn-clear"
            >
              Clear
            </button>
          </div>

          <div
            className="flex flex-wrap gap-4"
            data-testid="rec-filter-toggles"
          >
            {[
              { label: "From friends only", checked: friendOnly, set: setFriendOnly },
              { label: "From community only", checked: communityOnly, set: setCommunityOnly },
              { label: "Has photos", checked: hasPhotos, set: setHasPhotos },
              { label: "Has wins", checked: hasWins, set: setHasWins },
              { label: "Has CH score", checked: hasCH, set: setHasCH },
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

        {loading && <p className="text-slate-300 text-sm py-4">Loading…</p>}

        {err && !loading && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
            {err}
          </div>
        )}

        {!loading && !err && sortedRows.length === 0 && (
          <div className="mt-4 rounded-xl border border-slate-500/50 bg-slate-700/40 px-4 py-6 text-center text-sm text-slate-400">
            No results.
          </div>
        )}

        {!loading && !err && sortedRows.length > 0 && (
          <div className="rounded-xl border border-slate-500/50 overflow-x-auto shadow-sm">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[30%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-slate-600/80">
                <tr>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    #
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    <SortHeader
                      label="Company"
                      k="company"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    <SortHeader
                      label="VMB Score"
                      k="score"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    <SortHeader
                      label="Likes"
                      k="likes"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    <SortHeader
                      label="Rec photos"
                      k="recPhotos"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    <SortHeader
                      label="Wins"
                      k="completionWins"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60 border-r border-r-slate-500/30">
                    <SortHeader
                      label="CH score"
                      k="chScore"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-200 uppercase tracking-wide border-b border-slate-500/60">
                    <SortHeader
                      label="First seen"
                      k="createdAt"
                      sortKey={sortKey}
                      setSortKey={setSortKey}
                      sortDir={sortDir}
                      setSortDir={setSortDir}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-500/30">
                {sortedRows.map((r, i) => {
                  const canonicalScore = getCanonicalScore(r);
                  const scoreText =
                    canonicalScore != null ? canonicalScore.toFixed(1) : "—";
                  const isTop = r.id === topId;

                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        isTop
                          ? "bg-emerald-900/30 hover:bg-emerald-800/30"
                          : "bg-slate-700/40 hover:bg-slate-600/40"
                      }`}
                    >
                      <td className="px-3 py-2 text-center align-middle border-r border-slate-500/20">
                        {isTop ? (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"
                            title="Highest VMB score"
                            aria-label="Highest VMB score"
                          >
                            <Tick className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="text-slate-400 tabular-nums">
                            {i + 1}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 align-middle border-r border-slate-500/20">
                        <div className="font-medium text-white break-words whitespace-normal">
                          {r.company}
                        </div>
                        {r.name && (
                          <div className="text-xs text-slate-400 break-words whitespace-normal">
                            Contact: {r.name}
                          </div>
                        )}
                        {r.projectId && (
                          <div className="mt-1 text-[11px] text-slate-500">
                            Project #{r.projectId}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right align-middle tabular-nums font-semibold text-white border-r border-slate-500/20">
                        {scoreText}
                      </td>

                      <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-200 border-r border-slate-500/20">
                        {r.likes}
                      </td>

                      <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-200 border-r border-slate-500/20">
                        {r.recPhotos}
                      </td>

                      <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-200 border-r border-slate-500/20">
                        {r.completionWins}
                      </td>

                      <td className="px-3 py-2 text-right align-middle tabular-nums text-slate-200 border-r border-slate-500/20">
                        {r.chScore ?? "—"}
                      </td>

                      <td className="px-3 py-2 text-left align-middle text-xs text-slate-400">
                        {new Date(r.createdAt).toLocaleString("en-GB")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !err && (
          <div className="mt-3 text-xs text-slate-400">
            Showing <span className="font-semibold text-slate-200">{sortedRows.length}</span> of{" "}
            <span className="font-semibold text-slate-200">{rows.length}</span> records.
          </div>
        )}
      </div>
    </>
  );
}

/* ===== SortHeader (same pattern as tradesmen page, adapted) ===== */
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
    k === "likes" ||
    k === "recPhotos" ||
    k === "completionWins" ||
    k === "chScore" ||
    k === "createdAt"
      ? "desc"
      : "asc";

  return (
    <button
      type="button"
      title={title || `Sort by ${label}`}
      className={`flex items-center gap-1 text-xs font-semibold text-slate-200 uppercase tracking-wide hover:bg-slate-500/50 px-1 py-0.5 rounded transition-colors ${className}`}
      onClick={() => {
        if (active) setSortDir(dir === "asc" ? "desc" : "asc");
        else {
          setSortKey(k);
          setSortDir(defaultDir);
        }
      }}
      data-testid={`rec-th-sort-${k}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">
        {active ? (dir === "asc" ? "▲" : "▼") : "↕︎"}
      </span>
    </button>
  );
}
