import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchVmbRatings,
  computeAggregateScore,
  normalizedCompanyKey,
  voteUpRecommendation,
} from "@/utils/vmb";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";
import { chLabel } from "@/components/ui/vmb";
import HireConfirmModal from "@/components/project/HireConfirmModal";
import ReportModal from "@/components/ReportModal";

/* ===== Types ===== */
type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  phone?: string | null;
  companyEmail?: string | null;
  company: string;
  comment: string | null;
  isAnonymous: 0 | 1;
  createdAt: string;
  likes?: number;
  myLike?: 0 | 1;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  rating?: number | null;
  score?: number;
  source?: string | null;
  linked_tradesman_uid?: string | null;
  companyVerification?: Verification | null;
};

type ProjectLite = { id: number; name: string; ownerUserId: string };

type VerificationStatus =
  | "queued"
  | "running"
  | "verified"
  | "ambiguous"
  | "no_match"
  | "error";

type Verification = {
  recommendationId: number;
  status: VerificationStatus;
  companyNumber?: string | null;
  companyName?: string | null;
  score?: number | null;
  sicCodes?: string[];
  checkedAt?: string;
  errorMessage?: string | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
  googlePlaceId?: string | null;
};

function shouldUseChName(status?: VerificationStatus) {
  return status === "verified" || status === "ambiguous";
}

function resolveCompanyName(
  r: Recommendation & { companyVerification?: Verification | null },
  verMap: Record<number, Verification>
) {
  const v = r.companyVerification || verMap[r.id];
  if (v && v.companyName && shouldUseChName(v.status)) {
    return v.companyName.trim().toUpperCase();
  }
  return r.company;
}

function shortlistRecommenderText(r: Recommendation) {
  if (r.fromFriend === 1) return "Recommended via your friend.";
  return `Community recommendation made on ${new Date(r.createdAt).toLocaleDateString()}`;
}

/* ---------------- Icons ---------------- */
const ThumbsUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M2 10h4v12H2V10zm7.5 12h6.27c1.02 0 1.94-.64 2.29-1.6l2.41-6.52a2 2 0 0 0-1.24-2.55c-.2-.07-.42-.11-.64-.11h-4.6l.62-3.02.02-.23a2 2 0 0 0-.59-1.42L13.2 4 8.9 8.29A3 3 0 0 0 8 10.4V20a2 2 0 0 0 1.5 2z" />
  </svg>
);

/* ---------------- Type guards ---------------- */
type VmbListOk = { items: Recommendation[]; total?: number };
type VmbSingleOk = { item?: Recommendation | null };

function hasItems(res: unknown): res is VmbListOk {
  return !!res && typeof res === "object" && "items" in (res as any);
}
function hasItem(res: unknown): res is VmbSingleOk {
  return !!res && typeof res === "object" && "item" in (res as any);
}

/* --------- grouping --------- */
function pickTop(items: Recommendation[]) {
  return [...items].sort((a, b) => {
    const sa = typeof a.score === "number" ? a.score : -1;
    const sb = typeof b.score === "number" ? b.score : -1;
    if (sb !== sa) return sb - sa;
    const la = a.likes ?? 0;
    const lb = b.likes ?? 0;
    if (lb !== la) return lb - la;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  })[0];
}

type Grouped = {
  key: string;
  company: string;
  companyNumber?: string | null;
  top: Recommendation;
  items: Recommendation[];
  extraCount: number;
  aggLikes: number;
  aggScore?: number;
};

function groupByCompany(items: Recommendation[], verMap: any): Grouped[] {
  const map = new Map();
  for (const it of items) {
    const v = verMap[it.id];
    const chNumber = (v?.companyNumber || "").trim() || null;
    const candidateName = (v?.companyName || it.company || "").trim();
    const nameKey = normalizedCompanyKey(candidateName);
    const key = chNumber ? `#${chNumber}` : `n:${nameKey}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, company: candidateName, companyNumber: chNumber, items: [] };
      map.set(key, bucket);
    }
    bucket.items.push(it);
  }

  const groups: Grouped[] = [];
  for (const b of map.values()) {
    const top = pickTop(b.items);
    const scores = b.items.map((i: Recommendation) =>
      typeof i.score === "number" ? i.score : null
    );
    const aggScore =
      b.items.length >= 2 ? computeAggregateScore(scores, b.items.length) : top.score;
    const aggLikes = b.items.reduce(
      (s: number, it: Recommendation) => s + (it.likes ?? 0),
      0
    );
    groups.push({
      key: b.key,
      company: b.company,
      companyNumber: b.companyNumber,
      top,
      items: b.items,
      extraCount: Math.max(0, b.items.length - 1),
      aggLikes,
      aggScore,
    });
  }
  return groups;
}

function getShortProjectTitle(name?: string | null): string {
  if (!name) return "";
  let base = name.trim();
  if (base.toLowerCase().endsWith(" job post")) base = base.slice(0, -" job post".length).trim();
  const inIdx = base.toLowerCase().indexOf(" in ");
  if (inIdx > 0) base = base.slice(0, inIdx).trim();
  return base;
}

function scoreColor(score: number | undefined): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "bg-slate-400";
  if (score >= 55) return "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25";
  if (score >= 30) return "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/25";
  return "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25";
}

/* ===== Outer page with GATE ===== */
export default function ShortlistPage() {
  return (
    <AuthedOnly>
      <ShortlistGate />
    </AuthedOnly>
  );
}

function ShortlistGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "redirect">("checking");

  useEffect(() => {
    if (!router.isReady || authLoading) return;
    let alive = true;
    try {
      if (sessionStorage.getItem("vmb:isTradesman") === "1") {
        setStatus("redirect");
        router.replace("/tradesman/projects");
        return;
      }
    } catch {}
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isT = String(data?.role || "").toLowerCase() === "tradesman" || !!data?.profile;
        if (!alive) return;
        if (isT) {
          sessionStorage.setItem("vmb:isTradesman", "1");
          setStatus("redirect");
          router.replace("/tradesman/projects");
          return;
        }
      } catch {}
      if (alive) setStatus("ok");
    })();
    return () => { alive = false; };
  }, [api, router, authLoading]);

  if (status === "redirect") return <div className="py-10 text-sm text-zinc-500">Redirecting…</div>;
  if (status !== "ok") return <div className="py-10 text-sm text-zinc-500">Loading…</div>;
  return <ShortlistInner />;
}

/* ===== MAIN SHORTLIST PAGE ===== */
function ShortlistInner() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<ProjectLite | null>(null);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<number | null>(null);

  const [hasPhotos, setHasPhotos] = useState<Record<number, boolean>>({});
  const [recVerification, setRecVerification] = useState<Record<number, Verification>>({});

  const [hireTarget, setHireTarget] = useState<{ recommendationId: number; displayName: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<number | null>(null);
  const [hiredRecommendationIds, setHiredRecommendationIds] = useState<Set<number>>(new Set());
  const [hiresRefreshKey, setHiresRefreshKey] = useState(0);

  const isOwner = !!(user && project && project.ownerUserId === user.uid);
  const canVote = !!user && !!project && !isOwner;

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        setProject({ id: data.project.id, name: data.project.name, ownerUserId: data.project.ownerUserId });
      } catch {}
    })();
    return () => { alive = false; };
  }, [api, id, router.isReady, authLoading, user]);

  // Fetch existing hires so Hire button renders as "Hired" when applicable
  useEffect(() => {
    if (!project?.id || !isOwner) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${project.id}/hires`);
        if (cancelled) return;
        const ACTIVE = new Set(["pending", "pending_invite", "accepted"]);
        const ids = new Set<number>(
          (Array.isArray(data?.items) ? data.items : [])
            .filter((h: any) => ACTIVE.has(h?.status))
            .map((h: any) => h?.recommendationId)
            .filter((rid: any): rid is number => typeof rid === "number")
        );
        setHiredRecommendationIds(ids);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [api, project?.id, isOwner, hiresRefreshKey]);

  const submitHire = useCallback(async (message: string) => {
    if (!project?.id || !hireTarget) return;
    await api.post(`/api/projects/${project.id}/hires`, {
      recommendationId: hireTarget.recommendationId,
      homeownerMessage: message || undefined,
    });
    setHireTarget(null);
    setHiresRefreshKey((k) => k + 1);
  }, [api, project?.id, hireTarget]);

  async function loadPage(p: number) {
    const pid = Number(Array.isArray(id) ? id[0] : id);
    if (!Number.isFinite(pid)) return;
    const offset = Math.max(0, (p - 1) * pageSize);
    const res = await fetchVmbRatings(api, { projectId: pid, offset, limit: pageSize });
    if (hasItems(res)) {
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
      setErr(null);
    } else if (hasItem(res)) {
      const item = res.item ?? null;
      setItems(item ? [item] : []);
      setTotal(item ? 1 : 0);
      setErr(null);
    } else {
      setItems([]);
      setTotal(0);
      setErr(null);
    }
  }

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try { await loadPage(page); }
      catch { setErr("Failed to load shortlist"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [api, id, page, pageSize, router.isReady, authLoading, user, refreshKey]);

  // Real-time: refetch when a new recommendation arrives for this project
  useEffect(() => {
    const pid = Number(Array.isArray(id) ? id[0] : id);
    if (!pid) return;
    const onNotif = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.projectId === pid && (data?.type === "recommendation_new" || data?.type === "tradesman_shared_profile")) {
        setRefreshKey((k) => k + 1);
      }
    };
    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
  }, [id]);

  useEffect(() => {
    if (items.length === 0) { setHasPhotos({}); setRecVerification({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        items.map(async (r) => {
          try {
            const verRes = await api.get(`/api/recommendations/${r.id}/verification`);
            const ver: Verification | null = verRes?.data?.verification ?? null;
            let has = false;
            try {
              const { data } = await api.get(`/api/recommendations/${r.id}`);
              has = Array.isArray(data?.recommendation?.photos) && data.recommendation.photos.length > 0;
            } catch {}
            return [r.id, has, ver] as const;
          } catch { return [r.id, false, null] as const; }
        })
      );
      if (!cancelled) {
        const photosMap: Record<number, boolean> = {};
        const verMap: Record<number, Verification> = {};
        for (const [rid, has, ver] of entries) {
          photosMap[rid] = has;
          if (ver) verMap[rid] = { ...ver, recommendationId: ver.recommendationId ?? rid };
        }
        setHasPhotos(photosMap);
        setRecVerification(verMap);
      }
    })();
    return () => { cancelled = true; };
  }, [api, items]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const voteUpOnce = async (rec: Recommendation) => {
    if (!canVote || votingId || rec.myLike === 1) return;
    setVotingId(rec.id);
    setItems((prev) => prev.map((r) => r.id === rec.id ? { ...r, myLike: 1, likes: (r.likes ?? 0) + 1 } : r));
    try {
      await voteUpRecommendation(api, rec.id);
      await loadPage(page);
    } catch {
      await loadPage(page);
      alert("Unable to vote right now");
    } finally { setVotingId(null); }
  };

  const groups = useMemo(() => groupByCompany(items, recVerification), [items, recVerification]);
  const projectTitle = getShortProjectTitle(project?.name);

  return (
    <>
      <Head>
        <title>{projectTitle ? `Recommendations · ${projectTitle}` : "Recommendations"} — VetMyBuilder</title>
      </Head>

      <div className="relative min-h-screen overflow-x-hidden -mt-14" data-testid="recommendations-page">

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-16">

          {/* Back link — on the photo, white with shadow */}
          <Link
            href={`/projects/${id}`}
            className="hidden sm:inline-flex items-center gap-2 mb-4 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            ← Back
          </Link>

          {/* White card wrapping the full content */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-5 sm:px-8 sm:py-6 border-b border-zinc-100">
              <h1
                className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900"
                data-testid="recommendations-title"
              >
                All recommendations
                {projectTitle ? <span className="text-zinc-400 font-semibold text-lg"> · {projectTitle}</span> : ""}
              </h1>
              {total > 0 && (
                <p className="mt-1 text-sm text-zinc-500">{total} recommendation{total !== 1 ? "s" : ""} from neighbours and the community</p>
              )}
            </div>

          {/* List */}
          {loading ? (
            <p className="text-sm text-zinc-500 p-6">Loading…</p>
          ) : err ? (
            <p className="text-sm text-red-500 p-6">{err}</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-zinc-400 p-6">
              No builders have yet been recommended.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100" data-testid="recommendations-list">
              {groups.map((g, idx) => {
                const r = g.top;
                const votes = g.aggLikes;
                const hasVoted = r.myLike === 1;
                const showPhotos = !!hasPhotos[r.id];
                const ver = recVerification[r.id];
                const vStatus = ver?.status;
                const displayCompanyName = resolveCompanyName(r, recVerification);
                const googleRating = typeof ver?.googleRating === "number" ? ver.googleRating : undefined;
                const googleReviewsCount = typeof ver?.googleReviewsCount === "number" ? ver.googleReviewsCount : undefined;
                const recommender = shortlistRecommenderText(r);

                return (
                  <div
                    key={g.key}
                    className="relative px-5 py-5 sm:px-8 sm:py-6"
                    data-testid="shortlist-group"
                  >
                    {/* Stack count badge */}
                    {g.extraCount > 0 && (
                      <span className="absolute -top-2 right-2 z-20 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold leading-none px-2 py-1">
                        +{g.extraCount} more
                      </span>
                    )}

                    <div className="flex gap-3.5">
                      {/* VMB Score circle */}
                      <div
                        className={`flex-shrink-0 h-12 w-12 rounded-full flex flex-col items-center justify-center text-white select-none shadow-md ${scoreColor(g.aggScore)}`}
                        aria-label={`Score: ${typeof g.aggScore === "number" ? g.aggScore : "—"}`}
                        data-testid="shortlist-score-circle"
                      >
                        <span className="text-base font-extrabold leading-none">
                          {typeof g.aggScore === "number" ? g.aggScore : "—"}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Name + Google row */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {r.source === "pipeline" && r.linked_tradesman_uid ? (
                            <Link
                              href={`/tradesman/${r.linked_tradesman_uid}`}
                              className="font-extrabold text-base text-zinc-900 hover:underline decoration-zinc-300"
                            >
                              {displayCompanyName}
                            </Link>
                          ) : (
                            <Link
                              href={
                                id
                                  ? `/builders/${r.id}?projectId=${id}`
                                  : `/builders/${r.id}`
                              }
                              className="font-extrabold text-base text-zinc-900 hover:underline decoration-zinc-300"
                            >
                              {displayCompanyName}
                            </Link>
                          )}

                          {googleRating !== undefined && (
                            <GoogleRatingChip
                              rating={googleRating}
                              count={googleReviewsCount}
                              placeId={ver?.googlePlaceId ?? undefined}
                              className="text-xs"
                            />
                          )}
                        </div>

                        {/* Pipeline: contact details */}
                        {r.source === "pipeline" && (r.phone || r.companyEmail) && (
                          <div className="mt-2 flex items-center gap-3 text-sm">
                            {r.phone && (
                              <a href={`tel:${r.phone}`} className="text-red-500 font-semibold hover:underline">
                                {r.phone}
                              </a>
                            )}
                            {r.companyEmail && (
                              <a href={`mailto:${r.companyEmail}`} className="text-red-500 font-semibold hover:underline">
                                {r.companyEmail}
                              </a>
                            )}
                          </div>
                        )}

                        {/* Comment */}
                        {r.comment && (
                          <p className="text-sm text-zinc-600 mt-1.5 leading-relaxed">
                            &ldquo;{r.comment}&rdquo;
                          </p>
                        )}

                        {/* Badges */}
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {(vStatus === "verified" || vStatus === "ambiguous") ? (
                            <span className="text-xs font-semibold text-white bg-emerald-500 px-1.5 py-0.5 rounded">
                              Verified
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {chLabel(vStatus as any)}
                            </span>
                          )}
                          {showPhotos && (
                            <>
                              <span className="text-slate-300 text-xs">&middot;</span>
                              <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                Photos
                              </span>
                            </>
                          )}
                          {r.fromFriend === 1 && (
                            <>
                              <span className="text-slate-300 text-xs">&middot;</span>
                              <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
                                Friend
                              </span>
                            </>
                          )}
                        </div>

                        {/* Footer */}
                        {r.source === "pipeline" ? (
                          <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold mt-2" data-testid="shortlist-recommender">
                            <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              Vetted local business
                            </span>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-zinc-500" data-testid="shortlist-recommender">{recommender}</p>
                        )}

                        <div className="mt-2 flex items-center justify-between">
                          {r.source === "pipeline" ? null : isOwner ? (() => {
                            const alreadyHired = hiredRecommendationIds.has(r.id);
                            return (
                              <button
                                type="button"
                                onClick={() => setHireTarget({ recommendationId: r.id, displayName: displayCompanyName })}
                                disabled={alreadyHired}
                                data-testid={`shortlist-hire-${r.id}`}
                                className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-bold transition-colors ${
                                  alreadyHired
                                    ? "bg-emerald-100 text-emerald-700 cursor-default"
                                    : "bg-slate-900 text-white hover:bg-slate-800"
                                }`}
                              >
                                {alreadyHired ? "Hired" : "Hire"}
                              </button>
                            );
                          })() : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => voteUpOnce(r)}
                                disabled={!canVote || hasVoted || votingId === r.id}
                                data-testid="rec-vote-button"
                                className={`h-7 w-7 rounded-full grid place-items-center border transition ${
                                  hasVoted
                                    ? "bg-red-50 border-red-200 text-red-500 cursor-default"
                                    : "border-zinc-200 hover:bg-zinc-100"
                                } ${!canVote ? "opacity-60" : ""}`}
                              >
                                <ThumbsUpIcon className="h-3 w-3" />
                              </button>
                              <span data-testid="rec-vote-count" className="text-xs tabular-nums text-zinc-500 w-4 text-center">
                                {votes}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end mt-1">
                          <button
                            onClick={() => setReportTarget(r.id)}
                            className="flex items-center gap-1 text-[10px] text-zinc-300 hover:text-red-500 transition-colors"
                            data-testid="btn-report-recommendation"
                          >
                            <svg className="h-3 w-3 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                            </svg>
                            Report
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8 border-t border-zinc-100">
                  <button
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-30"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-zinc-400 tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-30"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
          </div>{/* end white card */}
        </div>
      </div>

      <HireConfirmModal
        open={hireTarget !== null}
        targetName={hireTarget?.displayName || ""}
        onConfirm={submitHire}
        onClose={() => setHireTarget(null)}
      />

      {reportTarget !== null && (
        <ReportModal
          targetType="recommendation"
          targetId={reportTarget}
          onClose={() => setReportTarget(null)}
        />
      )}
    </>
  );
}
