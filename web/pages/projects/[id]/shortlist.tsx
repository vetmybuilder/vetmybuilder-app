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

/* ===== Companies House verification ===== */
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

/* ---------- Shortlist-style recommender wording ---------- */
function shortlistRecommenderText(r: Recommendation) {
  if (r.fromFriend === 1) return "Recommended via your friend.";
  if (r.fromCommunity === 1)
    return `Community recommendation made on ${new Date(
      r.createdAt
    ).toLocaleDateString()}`;
  return `Community recommendation made on ${new Date(
    r.createdAt
  ).toLocaleDateString()}`;
}

/* ---------------- UI bits ---------------- */
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

function Badge({
  children,
  className = "",
  title,
  "aria-label": ariaLabel,
  testId,
}: any) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      title={title}
      aria-label={ariaLabel || title}
      data-testid={testId}
    >
      {children}
    </span>
  );
}

function ScoreChip({ value }: { value?: number }) {
  if (value == null || Number.isNaN(Number(value))) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600">
        VMB —
      </span>
    );
  }
  const n = Number(value);
  const label = n.toFixed(1).replace(/\.0$/, "");
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
      title={`VMB score: ${label}`}
      data-testid="rec-vmb-score"
    >
      VMB {label}
    </span>
  );
}

/* ---------------- Type guards ---------------- */
type VmbListOk = { items: Recommendation[]; total?: number };
type VmbSingleOk = { item?: Recommendation | null };

function hasItems(res: unknown): res is VmbListOk {
  return !!res && typeof res === "object" && "items" in (res as any);
}

function hasItem(res: unknown): res is VmbSingleOk {
  return !!res && typeof res === "object" && "item" in (res as any);
}

/* --------- grouping (same as your current logic) --------- */
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
      bucket = {
        key,
        company: candidateName,
        companyNumber: chNumber,
        items: [],
      };
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
      b.items.length >= 2
        ? computeAggregateScore(scores, b.items.length)
        : top.score;
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

  // Strip "Job post" suffix if present
  if (base.toLowerCase().endsWith(" job post")) {
    base = base.slice(0, -" job post".length).trim();
  }

  // Strip postcode / property bit after " in ..."
  const lower = base.toLowerCase();
  const inIdx = lower.indexOf(" in ");
  if (inIdx > 0) {
    base = base.slice(0, inIdx).trim();
  }

  return base;
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

  const [status, setStatus] = useState<"checking" | "ok" | "redirect">(
    "checking"
  );

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
        const isT =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
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

    return () => {
      alive = false;
    };
  }, [api, router, authLoading]);

  if (status === "redirect")
    return <div className="py-10 text-sm">Redirecting…</div>;
  if (status !== "ok") return <div className="py-10 text-sm">Loading…</div>;

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
  const [recVerification, setRecVerification] = useState<
    Record<number, Verification>
  >({});

  const [phoneVisible, setPhoneVisible] = useState<Record<number, boolean>>({});

  const isOwner = !!(user && project && project.ownerUserId === user.uid);
  const canVote = !!user && !!project && !isOwner;

  /* Load project */
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        setProject({
          id: data.project.id,
          name: data.project.name,
          ownerUserId: data.project.ownerUserId,
        });
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  /* Load shortlist */
  async function loadPage(p: number) {
    const pid = Number(Array.isArray(id) ? id[0] : id);
    if (!Number.isFinite(pid)) return;
    const offset = Math.max(0, (p - 1) * pageSize);

    const res = await fetchVmbRatings(api, {
      projectId: pid,
      offset,
      limit: pageSize,
    });

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

  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;

    setLoading(true);
    (async () => {
      try {
        await loadPage(page);
      } catch {
        setErr("Failed to load shortlist");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, page, pageSize, router.isReady, authLoading, user]);

  /* Fetch CH verification + photos */
  useEffect(() => {
    if (items.length === 0) {
      setHasPhotos({});
      setRecVerification({});
      return;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        items.map(async (r) => {
          try {
            const verRes = await api.get(
              `/api/recommendations/${r.id}/verification`
            );
            const ver: Verification | null = verRes?.data?.verification ?? null;

            let has = false;
            try {
              const { data } = await api.get(`/api/recommendations/${r.id}`);
              has =
                Array.isArray(data?.recommendation?.photos) &&
                data.recommendation.photos.length > 0;
            } catch {}

            return [r.id, has, ver] as const;
          } catch {
            return [r.id, false, null] as const;
          }
        })
      );

      if (!cancelled) {
        const photosMap: Record<number, boolean> = {};
        const verMap: Record<number, Verification> = {};

        for (const [rid, has, ver] of entries) {
          photosMap[rid] = has;
          if (ver)
            verMap[rid] = {
              ...ver,
              recommendationId: ver.recommendationId ?? rid,
            };
        }

        setHasPhotos(photosMap);
        setRecVerification(verMap);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, items]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const voteUpOnce = async (rec: Recommendation) => {
    if (!canVote || votingId || rec.myLike === 1) return;

    setVotingId(rec.id);
    setItems((prev) =>
      prev.map((r) =>
        r.id === rec.id ? { ...r, myLike: 1, likes: (r.likes ?? 0) + 1 } : r
      )
    );

    try {
      await voteUpRecommendation(api, rec.id);
      await loadPage(page);
    } catch {
      await loadPage(page);
      alert("Unable to vote right now");
    } finally {
      setVotingId(null);
    }
  };

  const groups = useMemo(
    () => groupByCompany(items, recVerification),
    [items, recVerification]
  );

  return (
    <div
      className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
      data-testid="recommendations-page"
    >
      {/* ===== Header ===== */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <a
            href={`/projects/${id}`}
            className="text-sm text-slate-600 hover:text-slate-800"
          >
            ← Back
          </a>
        </div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="recommendations-title"
        >
          All recommendations for your Job post
          {project ? ` · ${getShortProjectTitle(project.name)}` : ""}
        </h1>

        {/* <p className="mt-1 text-sm text-slate-500">
          Grouped by company and ranked by the VMB score.
        </p> */}
      </div>

      {/* ===== List ===== */}
      {loading ? (
        <p>Loading…</p>
      ) : err ? (
        <p className="text-red-600">{err}</p>
      ) : groups.length === 0 ? (
        <div className="card">No builders have yet been recommended.</div>
      ) : (
        <div className="space-y-3" data-testid="recommendations-list">
          {groups.map((g) => {
            const r = g.top;
            const votes = g.aggLikes;
            const hasVoted = r.myLike === 1;

            const isFriend = r.fromFriend === 1;
            const isCommunity = r.fromCommunity === 1;

            const showPhotos = !!hasPhotos[r.id];

            const ver = recVerification[r.id];
            const vStatus = ver?.status;
            const displayCompanyName = resolveCompanyName(r, recVerification);

            const scoreToShow =
              g.aggScore ?? (typeof r.score === "number" ? r.score : undefined);

            const googleRating =
              typeof ver?.googleRating === "number"
                ? ver.googleRating
                : undefined;
            const googleReviewsCount =
              typeof ver?.googleReviewsCount === "number"
                ? ver.googleReviewsCount
                : undefined;

            const recommender = shortlistRecommenderText(r);

            return (
              <div
                key={g.key}
                className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm hover:shadow-md transition p-5 relative"
              >
                {/* stack count */}
                {g.extraCount > 0 && (
                  <span className="absolute -top-2 -right-2 z-20 rounded-full bg-indigo-600 text-white text-[11px] px-2 py-1 shadow-md">
                    +{g.extraCount} more
                  </span>
                )}

                <div className="flex items-start gap-4">
                  {/* Voting (hidden for owner) */}
                  {!isOwner && (
                    <div className="w-12 flex-none flex flex-col items-center">
                      <button
                        onClick={() => voteUpOnce(r)}
                        disabled={!canVote || hasVoted || votingId === r.id}
                        className={`h-9 w-9 rounded-full grid place-items-center border transition ${
                          hasVoted
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700 cursor-default"
                            : "border-slate-200 hover:bg-slate-50"
                        } ${!canVote ? "opacity-60" : ""}`}
                      >
                        <ThumbsUpIcon className="h-4 w-4" />
                      </button>
                      <div className="mt-1 text-xs tabular-nums text-slate-600">
                        {votes}
                      </div>
                    </div>
                  )}

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <Link
                            href={`/builders/${r.id}`}
                            className="hover:underline"
                          >
                            {displayCompanyName}
                          </Link>
                        </div>

                        {/* badges row — matching ShortlistSection */}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {/* VERIFIED badge */}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chBadgeClass(
                              vStatus as any
                            )}`}
                          >
                            {chIcon(vStatus as any)}
                            {chLabel(vStatus as any)}
                          </span>

                          {isFriend && (
                            <Badge className="border border-blue-200 bg-blue-50 text-blue-700">
                              Friend
                            </Badge>
                          )}

                          {showPhotos && (
                            <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-700">
                              <CameraIcon className="h-3.5 w-3.5" />
                              Photos
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-1 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {googleRating !== undefined && (
                            <GoogleRatingChip
                              rating={googleRating}
                              count={googleReviewsCount}
                              placeId={ver?.googlePlaceId ?? undefined}
                            />
                          )}
                          {false && <ScoreChip value={scoreToShow} />}
                        </div>
                      </div>
                    </div>

                    {/* comment */}
                    {r.comment && (
                      <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                        {r.comment}
                      </p>
                    )}

                    {/* META — matching shortlist logic */}
                    <div className="text-xs text-slate-500 mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{recommender}</span>
                      </div>

                      {/* ❌ Removed the created date from bottom-right */}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pager */}
          <div className="flex items-center justify-between pt-2">
            <button
              className="btn disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>

            <div className="text-sm text-slate-600">
              Page {page} / {totalPages} • Total: {total}
            </div>

            <button
              className="btn disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
