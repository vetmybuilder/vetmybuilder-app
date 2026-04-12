import Head from "next/head";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useMemo, useState } from "react";
import {
  fetchVmbRatings,
  computeAggregateScore,
  normalizedCompanyKey,
  voteUpRecommendation,
} from "@/utils/vmb";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";
import { chBadgeClass, chIcon, chLabel } from "@/components/ui/vmb";

/* ===== Types ===== */
type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  phone?: string | null;
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

const CameraIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M9 3a1 1 0 0 0-.9.56L7.38 5H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2.38l-.72-1.44A1 1 0 0 0 14 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
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

function pickAvatarColor(name: string): string {
  const palettes = ["bg-red-500","bg-emerald-500","bg-amber-500","bg-sky-500","bg-violet-500","bg-pink-500","bg-teal-500"];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
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
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="relative min-h-screen overflow-x-hidden bg-stone-50 -mt-14" data-testid="recommendations-page">
        {/* Background bands */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-24 pb-16">

          {/* Header */}
          <div className="mb-8">
            <Link
              href={`/projects/${id}`}
              className="text-sm font-medium text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              ← Back
            </Link>
            <div className="mt-3 pb-4 border-b-2 border-zinc-900">
              <h1
                className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900"
                data-testid="recommendations-title"
              >
                All recommendations
                {projectTitle ? <span className="text-zinc-400 font-bold"> · {projectTitle}</span> : ""}
              </h1>
              {total > 0 && (
                <p className="mt-1 text-sm text-zinc-500">{total} recommendation{total !== 1 ? "s" : ""} from neighbours and the community</p>
              )}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <p className="text-sm text-zinc-500 px-1">Loading…</p>
          ) : err ? (
            <p className="text-sm text-red-500 px-1">{err}</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-zinc-400 py-8">
              No builders have yet been recommended.
            </p>
          ) : (
            <div className="divide-y divide-zinc-200" data-testid="recommendations-list">
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
                    className="relative py-6 animate-slide-in-left"
                    style={{ animationDelay: `${idx * 0.08}s` }}
                    data-testid="shortlist-group"
                  >
                    {/* Stack count badge */}
                    {g.extraCount > 0 && (
                      <span className="absolute -top-2 right-0 z-20 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-2 py-1 shadow-sm">
                        +{g.extraCount} more
                      </span>
                    )}

                    <div className="flex gap-3.5">
                      {/* Avatar */}
                      <div
                        className={`flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center text-sm font-black text-white select-none ${pickAvatarColor(displayCompanyName)}`}
                        aria-hidden="true"
                      >
                        {(displayCompanyName?.[0] ?? "T").toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Name + Google row */}
                        <div className="flex items-center gap-3 flex-wrap">
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

                          {googleRating !== undefined && (
                            <GoogleRatingChip
                              rating={googleRating}
                              count={googleReviewsCount}
                              placeId={ver?.googlePlaceId ?? undefined}
                              className="text-xs"
                            />
                          )}
                        </div>

                        {/* Comment */}
                        {r.comment && (
                          <p className="text-sm text-zinc-600 mt-1.5 leading-relaxed">
                            &ldquo;{r.comment}&rdquo;
                          </p>
                        )}

                        {/* Badges */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${chBadgeClass(vStatus as any)}`}
                          >
                            {chIcon(vStatus as any)}
                            {chLabel(vStatus as any)}
                          </span>
                          {r.fromFriend === 1 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-2 py-0.5 text-xs font-semibold">
                              Friend
                            </span>
                          )}
                          {showPhotos && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 text-xs font-semibold">
                              <CameraIcon className="h-3 w-3" />
                              Photos
                            </span>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-zinc-500">{recommender}</span>

                          {!isOwner && (
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
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <button
                    className="inline-flex items-center justify-center rounded-full border-2 border-zinc-200 bg-white px-5 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-zinc-500">
                    Page {page} / {totalPages}
                  </span>
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white shadow-sm shadow-red-500/25 hover:bg-red-600 transition-colors disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
