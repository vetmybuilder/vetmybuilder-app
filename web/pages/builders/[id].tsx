// web/pages/builders/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState, useMemo } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { getAggregateVmbForCompany, type FetchRecsFn } from "@/utils/vmb";
import BlurUnlock from "@/components/ui/BlurUnlock";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";
import SharedProfilePhotosSection from "@/components/tradesmen/SharedProfilePhotosSection";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";

type Photo = { id: string; url: string; thumb?: string; alt?: string };

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
  googlePlaceId?: string | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
};

type Builder = {
  id: number;
  company: string;
  comment: string | null;
  createdAt: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  isAnonymous: 0 | 1;
  likes?: number;
  myLike?: 0 | 1;
  photos?: any;
  photoUrls?: string[];
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  project?: { id: number; name: string };
  score?: number;
  companyVerification?: Verification | null;
};

type Review = {
  id: number;
  name: string;
  comment: string;
  createdAt?: string | null;
};

function shouldUseChName(status?: VerificationStatus) {
  return status === "verified" || status === "ambiguous";
}

function resolveCompanyNameForBuilder(
  b: Builder | null,
  v: Verification | null | undefined
) {
  const vItem = (b as any)?.companyVerification as
    | Verification
    | null
    | undefined;
  const picked =
    vItem && shouldUseChName(vItem.status) && vItem.companyName
      ? vItem
      : v && shouldUseChName(v.status) && v.companyName
      ? v
      : null;
  if (picked?.companyName) return picked.companyName.trim().toUpperCase();
  return b?.company ?? "";
}

function Badge({
  children,
  color = "indigo",
}: {
  children: React.ReactNode;
  color?: "green" | "red" | "indigo" | "orange";
}) {
  const shades: Record<string, string> = {
    green: "bg-green-500/15 text-green-700 ring-1 ring-green-200",
    red: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-200",
    indigo: "bg-indigo-500/15 text-indigo-700 ring-1 ring-indigo-200",
    orange: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${shades[color]}`}
    >
      {children}
    </span>
  );
}

const ThumbsUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M2 10h4v12H2V10zm7.5 12h6.27c1.02 0 1.94-.64 2.29-1.6l2.41-6.52a2 2 0 0 0-1.24-2.55c-.2-.07-.42-.11-.64-.11h-4.6l.62-3.02.02-.23a2 2 0 0 0-.59-1.42L13.2 4 8.9 8.29A3 3 0 0 0 8 10.4V20a2 2 0 0 0 1.5 2z" />
  </svg>
);

function ScoreChip({ value }: { value?: number }) {
  if (value == null || Number.isNaN(Number(value))) {
    return (
      <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600">
        VMB —
      </span>
    );
  }
  const n = Number(value);
  const label =
    n <= 5 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
      title={`VMB score: ${label}`}
      aria-label={`VMB score ${label}`}
      data-testid="builder-vmb-score"
    >
      VMB {label}
    </span>
  );
}

function normalizePhotos(payload: Builder | null): Photo[] {
  if (!payload) return [];
  const src = payload.photos ?? payload.photoUrls ?? [];
  if (Array.isArray(src) && src.every((s) => typeof s === "string")) {
    return (src as string[]).map((url, i) => ({
      id: String(i + 1),
      url,
      thumb: url,
    }));
  }
  if (Array.isArray(src)) {
    return src
      .map((p: any, i: number) => {
        const url = p?.url || p?.href || p?.src;
        if (!url) return null;
        return {
          id: String(p.id ?? i + 1),
          url,
          thumb: p.thumb || p.thumbnail || url,
          alt: p.alt || "",
        } as Photo;
      })
      .filter(Boolean) as Photo[];
  }
  return [];
}

function companyKey(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function recommenderLabel(r: { name: string | null; isAnonymous: 0 | 1 }) {
  if (r.isAnonymous === 1) return "Anonymous user";
  const n = (r.name || "").trim();
  return n || "Guest";
}

async function fetchProjectRecommendations(
  api: any,
  projectId: number
): Promise<any[]> {
  const tryRoutes = [
    `/api/projects/${projectId}/recommendations`,
    `/api/projects/${projectId}`,
  ];
  for (const path of tryRoutes) {
    try {
      const { data } = await api.get(path);
      if (Array.isArray(data?.recommendations)) return data.recommendations;
      if (Array.isArray(data?.project?.recommendations))
        return data.project.recommendations;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.project?.items)) return data.project.items;
    } catch {
      // ignore and try next
    }
  }
  try {
    const { data } = await api.get(
      `/api/recommendations/ratings?projectId=${projectId}&limit=200&offset=0`
    );
    const ids: number[] = Array.isArray(data?.items)
      ? data.items.map((x: any) => Number(x?.id)).filter(Number.isFinite)
      : [];
    if (!ids.length) return [];
    const hydrate = async (id: number) => {
      try {
        const { data } = await api.get(`/api/recommendations/${id}`);
        return data?.recommendation || null;
      } catch {
        return null;
      }
    };
    const results: any[] = [];
    const concurrency = 6;
    for (let i = 0; i < ids.length; i += concurrency) {
      const chunk = ids.slice(i, i + concurrency);
      const got = await Promise.all(chunk.map(hydrate));
      results.push(...got.filter(Boolean));
    }
    return results;
  } catch {
    return [];
  }
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`}
    />
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeAuthRace(err: any) {
  const status = err?.response?.status ?? err?.status;
  const msg =
    err?.response?.data?.error ?? err?.data?.error ?? err?.message ?? "";
  return status === 401 || /missing bearer token/i.test(String(msg));
}

async function getWithAuthRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 250
): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!looksLikeAuthRace(e) || i === attempts) break;
      await sleep(baseDelayMs * i);
    }
  }
  throw lastErr;
}

export default function BuilderProfile() {
  const router = useRouter();
  const { id } = router.query;
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  // --- Tradesman guard (no flicker, no hook reordering) ---
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!router.isReady || authLoading) return;
    if (!user) {
      setRedirecting(false);
      return;
    }

    let cancelled = false;
    setRedirecting(true);
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const t = data?.tradesman ?? data ?? {};
        const looksLikeProfile =
          !!t?.user_id || !!t?.company_name || !!t?.status;
        if (looksLikeProfile && !cancelled) {
          router.replace("/tradesman/projects");
          return;
        }
      } catch {
        // not a tradesman, proceed
      } finally {
        if (!cancelled) setRedirecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, user, authLoading, router.isReady, router]);

  // --- Normal page state/hooks ---
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [aggPhones, setAggPhones] = useState<string[]>([]);
  const [aggEmails, setAggEmails] = useState<string[]>([]);
  const [aggNames, setAggNames] = useState<string[]>([]);
  const [aggPhotos, setAggPhotos] = useState<Photo[]>([]);
  const [aggUpdatedAt, setAggUpdatedAt] = useState<string | null>(null);
  const [aggReviews, setAggReviews] = useState<Review[]>([]);

  const [verification, setVerification] = useState<Verification | null>(null);
  const [score, setScore] = useState<number | undefined>(undefined);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);
  const [friendCount, setFriendCount] = useState<number>(0);

  const isOwner = useMemo(
    () =>
      !!(user && projectOwnerId && String(user.uid) === String(projectOwnerId)),
    [user, projectOwnerId]
  );
  const canVote = !!user && !isOwner;

  // Fetch builder (skip while redirecting)
  useEffect(() => {
    if (!router.isReady || authLoading || !id || redirecting) return;

    if (!user) {
      setLoading(false);
      setErr(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/${id}`)
        );
        if (!alive) return;
        setBuilder(data.recommendation);
        setScore(
          typeof data?.recommendation?.score === "number"
            ? data.recommendation.score
            : undefined
        );
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(msg))) setErr(null);
        else setErr("Failed to load builder");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user, redirecting]);

  // Owner id
  useEffect(() => {
    const projectId = builder?.project?.id;
    if (!projectId || !user || redirecting) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}`);
        if (!alive) return;
        setProjectOwnerId(data?.project?.ownerUserId ?? null);
      } catch {
        if (!alive) return;
        setProjectOwnerId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, builder?.project?.id, user, redirecting]);

  // CH verification (header badge + Google data)
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id || redirecting) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/${id}/verification`)
        );
        if (!alive) return;
        setVerification(data?.verification || null);
      } catch {
        if (!alive) return;
        setVerification(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user, redirecting]);

  // Single/aggregate VMB score
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id || redirecting) return;
    let alive = true;
    setScoreErr(null);
    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/ratings?recommendationId=${id}`)
        );
        if (!alive) return;
        const v =
          (data && typeof data.item?.score === "number" && data.item.score) ??
          (Array.isArray(data?.items) &&
          typeof data.items[0]?.score === "number"
            ? data.items[0].score
            : undefined);
        if (typeof v === "number") setScore(v);
      } catch {
        if (!alive) return;
        setScoreErr("Could not load score");
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user, redirecting]);

  // Aggregate VMB for company on project
  useEffect(() => {
    const projectId = builder?.project?.id;
    const companyName = builder?.company || "";
    if (!projectId || !companyName || redirecting) return;

    let cancelled = false;
    (async () => {
      try {
        const ratingsFetcher: FetchRecsFn = async ({
          projectId,
          offset = 0,
          limit = 250,
        }) => {
          const { data } = await api.get(
            `/api/recommendations/ratings?projectId=${projectId}&offset=${offset}&limit=${limit}`
          );
          const items =
            (data?.items || []).map((it: any) => ({
              id: it.id,
              company: it.company,
              score: it.score,
            })) ?? [];
          const total = Number.isFinite(data?.total)
            ? data.total
            : items.length;
          return { items, total };
        };
        const singleScore =
          typeof score === "number"
            ? score
            : typeof builder?.score === "number"
            ? builder.score
            : undefined;
        const agg = await getAggregateVmbForCompany(
          ratingsFetcher,
          projectId,
          companyName,
          singleScore
        );
        if (!cancelled && typeof agg === "number") setScore(agg);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, builder?.project?.id, builder?.company, score, redirecting]);

  // Aggregate phones/emails/names/photos/reviews and friend count
  useEffect(() => {
    if (!builder || redirecting) return;

    (async () => {
      const pid = builder?.project?.id;
      const baseCompany = builder?.company || "";

      // If we don't have a project context, just use this single recommendation
      if (!pid || !baseCompany) {
        const singlePhones: string[] = [];
        const singleEmails: string[] = [];

        const phone = String(builder.phone || "").trim();
        if (phone && phone.length >= 7) singlePhones.push(phone);

        const email = String(builder.email || "").trim();
        if (email && email.includes("@")) singleEmails.push(email);

        setAggPhones(singlePhones);
        setAggEmails(singleEmails);
        setAggNames([recommenderLabel(builder)]);
        setAggPhotos(normalizePhotos(builder));
        setAggUpdatedAt(builder?.createdAt || null);
        setFriendCount(builder.fromFriend === 1 ? 1 : 0);
        setAggReviews(
          builder.comment
            ? [
                {
                  id: builder.id,
                  name: recommenderLabel(builder),
                  comment: String(builder.comment).trim(),
                  createdAt: builder.createdAt,
                },
              ]
            : []
        );
        return;
      }

      // Fetch all recs for this project and company, then hydrate each one
      const allRecs = await fetchProjectRecommendations(api, pid);
      const key = companyKey(baseCompany);
      const byId = new Map<number, any>();
      const source = [builder, ...allRecs].filter(Boolean);

      for (const r of source) {
        if (!r || typeof r.id !== "number") continue;
        if (companyKey(r.company || "") !== key) continue;
        if (!byId.has(r.id)) byId.set(r.id, r);
      }

      let group = Array.from(byId.values());
      if (group.length === 0) group = [builder];

      // Hydrate each recommendation so we always have phone/email/comment/photos
      const hydratedRaw = await Promise.all(
        group.map(async (r) => {
          if (!r || typeof r.id !== "number") return null;
          try {
            const { data } = await api.get(`/api/recommendations/${r.id}`);
            return data?.recommendation || r;
          } catch {
            return r;
          }
        })
      );
      const full = hydratedRaw.filter(Boolean) as any[];

      // Phones – collect all (including duplicates, as requested)
      const phones: string[] = full
        .map((r) => String(r.phone || "").trim())
        .filter((p) => p && p.length >= 7);

      // Emails – collect all (including duplicates)
      const emails: string[] = full
        .map((r) => String(r.email || "").trim())
        .filter((e) => e && e.includes("@"));

      // Names (dedup – just for display)
      const names = Array.from(new Set(full.map((r) => recommenderLabel(r))));

      const latestMs = Math.max(
        ...full
          .map((r) => +new Date(r.createdAt))
          .filter((n) => Number.isFinite(n))
      );
      const latestIso = Number.isFinite(latestMs)
        ? new Date(latestMs).toISOString()
        : builder.createdAt;

      const friendCountVal = full.filter((r: any) => r.fromFriend === 1).length;

      // Photos from all recommendations
      const photoLists = full.map((rec: any) => {
        const ph = normalizePhotos(rec);
        const by = recommenderLabel(rec);
        return ph.map((p: any) => ({
          ...p,
          alt:
            p.alt && p.alt.trim() ? p.alt : `${rec.company} — photo from ${by}`,
        }));
      });

      const seen = new Set<string>();
      const merged: Photo[] = [];
      for (const arr of photoLists) {
        for (const p of arr) {
          const k = p.url || p.thumb || "";
          if (!k || seen.has(k)) continue;
          seen.add(k);
          merged.push(p);
        }
      }

      // Reviews list from all recommendations with comments
      const reviews: Review[] = full
        .filter((r: any) => r.comment && String(r.comment).trim().length > 0)
        .map((r: any) => ({
          id: r.id,
          name: recommenderLabel(r),
          comment: String(r.comment).trim(),
          createdAt: r.createdAt,
        }));

      reviews.sort((a, b) => {
        const aTime = a.createdAt ? +new Date(a.createdAt) : 0;
        const bTime = b.createdAt ? +new Date(b.createdAt) : 0;
        return bTime - aTime;
      });

      setAggPhones(phones);
      setAggEmails(emails);
      setAggNames(names);
      setAggPhotos(merged.length ? merged : normalizePhotos(builder));
      setAggUpdatedAt(latestIso || builder.createdAt || null);
      setFriendCount(friendCountVal);
      setAggReviews(reviews);
    })();
  }, [api, builder, redirecting]);

  const photos = aggPhotos;
  const galleryImages: GalleryImage[] = photos.map((p, i) => ({
    id: p.id ?? String(i + 1),
    thumbUrl: p.thumb || p.url,
    fullUrl: p.url,
    alt: p.alt,
  }));

  const [voting, setVoting] = useState(false);
  const voteUpOnce = async () => {
    if (!builder || !user || voting || builder.myLike === 1 || !canVote) return;
    setVoting(true);
    setBuilder((b) => (b ? { ...b, myLike: 1, likes: (b.likes || 0) + 1 } : b));
    try {
      await api.post(`/api/recommendations/${builder.id}/like`);
      const { data } = await api.get(`/api/recommendations/${builder.id}`);
      setBuilder(data.recommendation);
      try {
        const { data: r } = await api.get(
          `/api/recommendations/ratings?recommendationId=${builder.id}`
        );
        const v =
          (r && typeof r.item?.score === "number" && r.item.score) ??
          (Array.isArray(r?.items) && typeof r.items[0]?.score === "number"
            ? r.items[0].score
            : undefined);
        if (typeof v === "number") setScore(v);
      } catch {
        // ignore
      }
    } catch (e: any) {
      setBuilder((b) =>
        b && b.myLike === 1
          ? { ...b, myLike: 0, likes: Math.max(0, (b.likes || 1) - 1) }
          : b
      );
      alert(e?.response?.data?.error || "Unable to vote right now");
    } finally {
      setVoting(false);
    }
  };

  if (redirecting) return null;

  const companyName = user
    ? resolveCompanyNameForBuilder(builder, verification)
    : "Create a free account to view company details";

  const updatedDisplay =
    aggUpdatedAt ||
    builder?.createdAt ||
    (builder ? new Date().toISOString() : null);

  const primaryPhone = user && aggPhones.length > 0 ? aggPhones[0] : null;
  const primaryEmail = user && aggEmails.length > 0 ? aggEmails[0] : null;

  const avatarInitials = companyName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const avatarUrl = galleryImages[0]?.thumbUrl ?? galleryImages[0]?.fullUrl;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {authLoading || loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          Loading…
        </div>
      ) : err ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-sm"
          data-testid="builder-error"
        >
          {err}
        </div>
      ) : (
        builder && (
          <div className="space-y-6">
            {/* Back to project */}
            {builder.project?.id && (
              <button
                type="button"
                onClick={() => router.push(`/projects/${builder.project!.id}`)}
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                <span aria-hidden>←</span>
                <span>Back to this project</span>
              </button>
            )}
            {/* Header card */}
            <header className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur px-4 py-4 sm:px-6 sm:py-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-2xl bg-slate-200 grid place-items-center text-lg font-semibold text-white">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={companyName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{avatarInitials}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2
                      className="truncate text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900"
                      title={companyName}
                      data-testid="builder-company"
                    >
                      {companyName}
                    </h2>

                    {/* badges row */}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      {verification?.status === "verified" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                          <span aria-hidden>✅</span>
                          Companies House verified
                        </span>
                      )}

                      {friendCount > 0 && (
                        <Badge color="indigo">
                          {friendCount === 1
                            ? "Shared by a friend"
                            : "Shared by friends"}
                        </Badge>
                      )}

                      {builder.fromCommunity ? (
                        <Badge color="green">Community recommendation</Badge>
                      ) : null}

                      {updatedDisplay && (
                        <span className="text-xs text-slate-500">
                          Updated{" "}
                          {new Date(updatedDisplay).toLocaleDateString(
                            "en-GB",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </span>
                      )}
                    </div>

                    {/* quick stats */}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-neutral-700">
                      <span data-testid="builder-votes">
                        <ThumbsUpIcon className="mr-1 inline-block h-4 w-4 align-middle" />{" "}
                        <span className="tabular-nums">
                          {builder.likes ?? 0}
                        </span>{" "}
                        vote{(builder.likes ?? 0) === 1 ? "" : "s"}
                      </span>
                      {user ? (
                        <>
                          <span>
                            <ScoreChip value={score ?? builder.score} />
                          </span>

                          {verification?.googleRating != null &&
                            !Number.isNaN(
                              Number(verification.googleRating)
                            ) && (
                              <span>
                                <GoogleRatingChip
                                  rating={verification.googleRating}
                                  count={
                                    verification.googleReviewsCount ?? null
                                  }
                                  placeId={verification.googlePlaceId ?? null}
                                />
                              </span>
                            )}
                        </>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-500">
                          VMB —
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: vote button */}
                <div className="flex sm:flex-col items-start sm:items-end">
                  {!isOwner && user && (
                    <button
                      className={[
                        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium shadow-sm border",
                        builder.myLike === 1
                          ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
                        voting ? "opacity-70 cursor-wait" : "",
                      ].join(" ")}
                      disabled={
                        !user || builder.myLike === 1 || voting || !canVote
                      }
                      onClick={voteUpOnce}
                      data-testid="btn-vote-up"
                      aria-pressed={builder.myLike === 1}
                      title={
                        !user
                          ? "Sign in to vote"
                          : builder.myLike === 1
                          ? "You’ve voted"
                          : "Vote up"
                      }
                      aria-label={
                        !user
                          ? "Sign in to vote"
                          : builder.myLike === 1
                          ? "You have voted"
                          : "Vote up"
                      }
                    >
                      <ThumbsUpIcon className="h-4 w-4" />
                      <span>
                        {builder.myLike === 1 ? "You’ve voted" : "Vote up"}
                      </span>
                    </button>
                  )}
                  {scoreErr && (
                    <div className="mt-2 text-xs text-rose-600">{scoreErr}</div>
                  )}
                </div>
              </div>
            </header>

            {/* Main two-column layout */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
              {/* LEFT: Reviews + shared photos */}
              <div className="space-y-6">
                {/* Reviews */}
                {aggReviews.length > 0 && (
                  <section
                    className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                    data-testid="builder-reviews-card"
                  >
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                      Reviews from neighbours
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      What your neighbours said when they recommended this
                      builder.
                    </p>

                    <div className="mt-4 space-y-4">
                      {aggReviews.map((rev) => (
                        <article
                          key={rev.id}
                          className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-xs font-semibold">
                                {rev.name
                                  .split(" ")
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((p) => p[0])
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <div className="text-sm font-medium text-slate-900">
                                {rev.name}
                              </div>
                            </div>
                            {rev.createdAt && (
                              <time className="text-xs text-slate-500">
                                {new Date(rev.createdAt).toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  }
                                )}
                              </time>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                            {rev.comment}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {/* Shared photos */}
                {user ? (
                  galleryImages.length > 0 ? (
                    <SharedProfilePhotosSection images={galleryImages} />
                  ) : (
                    <section
                      className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5"
                      data-testid="builder-shared-photos-empty"
                    >
                      <h2 className="text-sm sm:text-base font-semibold text-emerald-900 mb-1">
                        Shared photos
                      </h2>
                      <p className="text-sm text-emerald-800">
                        No photos have been shared for this builder yet.
                      </p>
                    </section>
                  )
                ) : (
                  <section
                    className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5"
                    data-testid="builder-shared-photos-locked"
                  >
                    <h2 className="text-sm sm:text-base font-semibold text-emerald-900 mb-1">
                      Shared photos
                    </h2>
                    <p className="text-sm text-emerald-800 mb-3">
                      Create a free account to see photos your neighbours shared
                      with this recommendation.
                    </p>
                    <BlurUnlock
                      previewCount={3}
                      totalCount={photos.length || undefined}
                      label="photos from neighbours"
                    >
                      <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
                        aria-hidden
                      >
                        {new Array(6).fill(null).map((_, i) => (
                          <div
                            key={i}
                            className="relative aspect-square overflow-hidden rounded-lg border border-emerald-100 bg-emerald-100"
                          >
                            <div className="absolute inset-0 animate-pulse bg-emerald-200/70" />
                          </div>
                        ))}
                      </div>
                    </BlurUnlock>
                  </section>
                )}
              </div>

              {/* RIGHT: Profile details – phone + email list */}
              <div className="space-y-6">
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                  aria-label="Contact details"
                  data-testid="contact-details-card"
                >
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900 mb-4">
                    Profile details
                  </h2>

                  {user ? (
                    <div className="space-y-6 text-sm text-slate-800">
                      <section data-testid="builder-contact-details-section">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          Contact details
                        </h3>
                        <div className="space-y-4">
                          {/* Phone numbers */}
                          <div data-testid="builder-phone">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500 block">
                              Phone
                            </span>

                            {primaryPhone ? (
                              <div className="mt-0.5 flex items-center gap-2">
                                <a
                                  href={`tel:${primaryPhone}`}
                                  className="text-sm text-emerald-700 tabular-nums hover:underline"
                                >
                                  {primaryPhone}
                                </a>
                                <span className="rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                                  Primary
                                </span>
                              </div>
                            ) : (
                              <span className="mt-0.5 block text-sm text-slate-400">
                                Not provided
                              </span>
                            )}

                            {aggPhones.length > 1 && (
                              <ul className="mt-2 space-y-1">
                                {aggPhones.slice(1).map((p, idx) => (
                                  <li key={`${p}-${idx}`}>
                                    <div className="flex items-center gap-2 text-xs">
                                      <a
                                        href={`tel:${p}`}
                                        className="text-slate-700 tabular-nums hover:underline"
                                      >
                                        {p}
                                      </a>
                                      <span className="rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                                        Secondary
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Emails */}
                          <div data-testid="builder-email">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500 block">
                              Email
                            </span>

                            {primaryEmail ? (
                              <div className="mt-0.5 flex items-center gap-2">
                                <a
                                  href={`mailto:${primaryEmail}`}
                                  className="text-sm text-emerald-700 break-all hover:underline"
                                >
                                  {primaryEmail}
                                </a>
                                <span className="rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                                  Primary
                                </span>
                              </div>
                            ) : (
                              <span className="mt-0.5 block text-sm text-slate-400">
                                Not provided
                              </span>
                            )}

                            {aggEmails.length > 1 && (
                              <ul className="mt-2 space-y-1">
                                {aggEmails.slice(1).map((e, idx) => (
                                  <li key={`${e}-${idx}`}>
                                    <div className="flex items-center gap-2 text-xs">
                                      <a
                                        href={`mailto:${e}`}
                                        className="break-all text-slate-700 hover:underline"
                                      >
                                        {e}
                                      </a>
                                      <span className="rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
                                        Secondary
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : (
                    <BlurUnlock
                      previewCount={0}
                      label="contact details"
                      totalCount={undefined}
                    >
                      <div className="space-y-4" aria-hidden>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Phone
                          </div>
                          <SkeletonLine className="mt-1 h-4 w-32" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Email
                          </div>
                          <SkeletonLine className="mt-1 h-4 w-40" />
                        </div>
                      </div>
                    </BlurUnlock>
                  )}
                </section>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
