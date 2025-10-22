import { useRouter } from "next/router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import AuthedOnly from "@/components/AuthedOnly";
import Link from "next/link";
import {
  getAggregateVmbForCompany,
  fetchVmbRatings,
  type FetchRecsFn,
} from "@/utils/vmb";

type Photo = { id: string; url: string; thumb?: string; alt?: string };

type Builder = {
  id: number;
  company: string;
  comment: string | null;
  createdAt: string;
  // recommender
  name: string | null;
  email: string | null;
  phone?: string | null; // <-- this is the BUILDER’S phone
  isAnonymous: 0 | 1;
  // aggregates
  likes?: number;
  myLike?: 0 | 1;
  // gallery
  photos?: any;
  photoUrls?: string[];
  // badges
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  // back to project
  project?: { id: number; name: string };
  // VMB ranking score
  score?: number;

  // Optional: item-level Companies House verification already present
  companyVerification?: Verification | null;
};

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
};

function shouldUseChName(status?: VerificationStatus) {
  return status === "verified" || status === "ambiguous";
}

/** Prefer item-level CH name, then loaded verification; fallback to entered name. */
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

/** Thumbs up icon (vote) */
const ThumbsUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M2 10h4v12H2V10zm7.5 12h6.27c1.02 0 1.94-.64 2.29-1.6l2.41-6.52a2 2 0 0 0-1.24-2.55c-.2-.07-.42-.11-.64-.11h-4.6l.62-3.02.02-.23a2 2 0 0 0-.59-1.42L13.2 4 8.9 8.29A3 3 0 0 0 8 10.4V20a2 2 0 0 0 1.5 2z" />
  </svg>
);

/** Compact VMB score pill. Shows “—” if unknown. */
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

const ClockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm1 11h5v-2h-4V6h-2v7z" />
  </svg>
);
const ExclamationTriangleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z" />
  </svg>
);

/** Simple Google mark (visual only) */
function GoogleMark() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        aria-hidden
        focusable="false"
      >
        <rect x="0" y="0" width="7" height="7" rx="1" fill="#4285F4" />
        <rect x="9" y="0" width="7" height="7" rx="1" fill="#EA4335" />
        <rect x="0" y="9" width="7" height="7" rx="1" fill="#34A853" />
        <rect x="9" y="9" width="7" height="7" rx="1" fill="#FBBC05" />
      </svg>
      <span className="font-medium">Google</span>
    </span>
  );
}

/** Accept a variety of server shapes for photos and produce a normalized list */
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

/* ---------------- Aggregation helpers ---------------- */

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

// Try hard to load ALL recs for a given project (for photos/names/phones aggregation)
async function fetchProjectRecommendations(
  api: any,
  projectId: number
): Promise<any[]> {
  const tryRoutes = [
    `/api/projects/${projectId}/recommendations`,
    `/api/v2/projects/${projectId}/recommendations`,
    `/api/projects/${projectId}`, // sometimes embeds recommendations
  ];
  for (const path of tryRoutes) {
    try {
      const { data } = await api.get(path);
      if (Array.isArray(data?.recommendations)) return data.recommendations;
      if (Array.isArray(data?.project?.recommendations))
        return data.project.recommendations;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.project?.items)) return data.project.items;
    } catch {}
  }

  // Fallback: pull ids from ratings, then hydrate each
  try {
    const { data } = await api.get(
      `/api/v2/recommendations/ratings?projectId=${projectId}&limit=200&offset=0`
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

/* ---------------- Small auth-race retry helpers ---------------- */

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

  const [builder, setBuilder] = useState<Builder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Aggregated (same company in the same project)
  const [aggPhones, setAggPhones] = useState<string[]>([]);
  const [aggNames, setAggNames] = useState<string[]>([]);
  const [aggPhotos, setAggPhotos] = useState<Photo[]>([]);
  const [aggUpdatedAt, setAggUpdatedAt] = useState<string | null>(null);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const lightboxOpen = lightboxIdx !== null;

  // Verification state
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verr, setVerr] = useState<string | null>(null);
  const [vLoading, setVLoading] = useState(false);

  // VMB score (will be replaced with aggregate when applicable)
  const [score, setScore] = useState<number | undefined>(undefined);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  // Project owner (to hide vote button if I'm the owner)
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);

  // Derived permission: can I vote?
  const isOwner = useMemo(
    () =>
      !!(user && projectOwnerId && String(user.uid) === String(projectOwnerId)),
    [user, projectOwnerId]
  );
  const canVote = !!user && !isOwner;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen]);

  // Fetch builder
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;

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
        if (status === 401 || /bearer token/i.test(String(msg))) {
          setErr("You need to sign in again to view this builder.");
        } else {
          setErr("Failed to load builder");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  // Fetch project owner (so we can hide the vote button for owners)
  useEffect(() => {
    const projectId = builder?.project?.id;
    if (!projectId || !user) return;
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
  }, [api, builder?.project?.id, user]);

  // Companies House verification
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    setVLoading(true);
    setVerr(null);
    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/${id}/verification`)
        );
        if (!alive) return;
        setVerification(data?.verification || null);
      } catch (e: any) {
        if (!alive) return;
        setVerr("Could not load verification");
        setVerification(null);
      } finally {
        if (alive) setVLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  // Fetch VMB score for this recommendation (server-calculated, single)
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    setScoreErr(null);
    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/v2/recommendations/ratings?recommendationId=${id}`)
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
  }, [api, id, router.isReady, authLoading, user]);

  // Compute aggregate VMB (shared util) when there are multiple recs for the same company
  useEffect(() => {
    const projectId = builder?.project?.id;
    const companyName = builder?.company || "";
    if (!projectId || !companyName) return;

    let cancelled = false;

    (async () => {
      try {
        // Bridge function to the ratings endpoint -> RecLite[]
        const ratingsFetcher: FetchRecsFn = async ({
          projectId,
          offset = 0,
          limit = 250,
        }) => {
          const res: any = await fetchVmbRatings(api, {
            projectId,
            offset,
            limit,
          });
          const items =
            (res?.items || []).map((it: any) => ({
              id: it.id,
              company: it.company,
              score: it.score,
            })) ?? [];
          const total = Number.isFinite(res?.total) ? res.total : items.length;
          return { items, total };
        };

        // Use whatever single score we currently have as the fallback
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

        if (!cancelled && typeof agg === "number") {
          setScore(agg);
        }
      } catch {
        // ignore — keep whatever score we had
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally *not* depending on `score` to avoid loops.
    // We provide a stable fallback above (uses latest known score/builder.score).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, builder?.project?.id, builder?.company]);

  // Aggregate same-company recs within the same project for phones/names/photos/date
  useEffect(() => {
    if (!builder) return;

    (async () => {
      const pid = builder?.project?.id;
      const baseCompany = builder?.company || "";

      if (!pid || !baseCompany) {
        setAggPhones(builder?.phone ? [builder.phone] : []);
        setAggNames([recommenderLabel(builder)]);
        setAggPhotos(normalizePhotos(builder));
        setAggUpdatedAt(builder?.createdAt || null);
        return;
      }

      const allRecs = await fetchProjectRecommendations(api, pid);

      const key = companyKey(baseCompany);
      const byId = new Map<number, any>();
      const source = [builder, ...allRecs].filter(Boolean);
      for (const r of source) {
        if (!r || typeof r.id !== "number") continue;
        if (companyKey(r.company || "") !== key) continue;
        if (!byId.has(r.id)) byId.set(r.id, r);
      }
      const group = Array.from(byId.values());
      if (group.length === 0) group.push(builder);

      const phones = Array.from(
        new Set(
          group
            .map((r) => String(r.phone || "").trim())
            .filter((p) => p && p.length >= 7)
        )
      );

      const names = Array.from(new Set(group.map((r) => recommenderLabel(r))));

      const latestMs = Math.max(
        ...group
          .map((r) => +new Date(r.createdAt))
          .filter((n) => Number.isFinite(n))
      );
      const latestIso = Number.isFinite(latestMs)
        ? new Date(latestMs).toISOString()
        : builder.createdAt;

      // Merge photos, hydrating per-rec if needed to get URLs + alt
      const photoLists = await Promise.all(
        group.map(async (r) => {
          try {
            const { data } = await api.get(`/api/recommendations/${r.id}`);
            const rec = data?.recommendation || r;
            const ph = normalizePhotos(rec);
            const by = recommenderLabel(rec);
            return ph.map((p: any) => ({
              ...p,
              alt:
                p.alt && p.alt.trim()
                  ? p.alt
                  : `${rec.company} — photo from ${by}`,
            }));
          } catch {
            return [] as Photo[];
          }
        })
      );
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

      setAggPhones(phones);
      setAggNames(names);
      setAggPhotos(merged.length ? merged : normalizePhotos(builder));
      setAggUpdatedAt(latestIso || builder.createdAt || null);
    })();
  }, [api, builder]);

  // Lightbox
  const photos = aggPhotos;
  const [voting, setVoting] = useState(false);
  const voteUpOnce = async () => {
    if (!builder || !user || voting || builder.myLike === 1 || !canVote) return;
    setVoting(true);
    setBuilder((b) => (b ? { ...b, myLike: 1, likes: (b.likes || 0) + 1 } : b));
    try {
      await api.post(`/api/recommendations/${builder.id}/like`);
      const { data } = await api.get(`/api/recommendations/${builder.id}`);
      setBuilder(data.recommendation);

      // refresh score too
      try {
        const { data: r } = await api.get(
          `/api/v2/recommendations/ratings?recommendationId=${builder.id}`
        );
        const v =
          (r && typeof r.item?.score === "number" && r.item.score) ??
          (Array.isArray(r?.items) && typeof r.items[0]?.score === "number"
            ? r.items[0].score
            : undefined);
        if (typeof v === "number") setScore(v);
      } catch {}
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

  function renderCHStatus(v?: Verification | null) {
    const status = v?.status ?? (vLoading ? "running" : "queued");
    if (status === "verified") {
      return (
        <span
          className="inline-flex items-center gap-1"
          data-testid="verification-ch-status"
          aria-label="Companies House: Verified"
          title="Verified"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
            <circle cx="12" cy="12" r="10" fill="#22C55E" />
            <path
              d="M7.5 12.5l3 3 6-6"
              fill="none"
              stroke="white"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">Verified</span>
        </span>
      );
    }
    if (status === "running" || status === "queued") {
      return (
        <span
          className="inline-flex items-center gap-1 text-sm text-slate-600"
          data-testid="verification-ch-status"
        >
          <ClockIcon className="h-5 w-5 text-slate-500" />
          Checking…
        </span>
      );
    }
    if (status === "ambiguous") {
      return (
        <span
          className="inline-flex items-center gap-1 text-sm text-amber-700"
          data-testid="verification-ch-status"
        >
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
          Needs review
        </span>
      );
    }
    if (status === "no_match") {
      return (
        <span
          className="inline-flex items-center gap-1 text-sm text-slate-600"
          data-testid="verification-ch-status"
        >
          <ExclamationTriangleIcon className="h-5 w-5 text-slate-500" />
          No match
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-sm text-rose-700"
        data-testid="verification-ch-status"
      >
        <ExclamationTriangleIcon className="h-5 w-5 text-rose-600" />
        Error
      </span>
    );
  }

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-4">
          <h1
            className="text-2xl font-semibold"
            data-testid="builder-page-title"
          >
            Builder profile
          </h1>
          {builder?.project && (
            <Link
              href="/projects"
              aria-label="Back to my projects"
              title="Back to my projects"
              className="btn-back"
              data-testid="btn-back"
            >
              <svg
                viewBox="0 0 24 24"
                className="icon-24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 19l-7-7 7-7" />
                <path d="M3 12h18" />
              </svg>
              <span className="sr-only">Back to my projects</span>
            </Link>
          )}
        </div>

        {authLoading || loading ? (
          <div className="card" data-testid="builder-loading">
            Loading…
          </div>
        ) : err ? (
          <div className="card text-red-600" data-testid="builder-error">
            {err}
            <div className="mt-3">
              <Link href="/login" className="btn" data-testid="btn-go-login">
                Go to sign in
              </Link>
            </div>
          </div>
        ) : !builder ? (
          <div className="card" data-testid="builder-not-found">
            Not found
          </div>
        ) : (
          <div className="space-y-5">
            {/* TOP: Gallery (aggregated) */}
            <section
              className="card"
              data-testid="gallery-card"
              aria-labelledby="gallery-heading"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 id="gallery-heading" className="text-lg font-semibold">
                  Gallery
                </h3>
                <span
                  className="text-xs text-slate-500"
                  data-testid="gallery-count"
                >
                  {photos.length} photo{photos.length === 1 ? "" : "s"}
                </span>
              </div>

              {photos.length === 0 ? (
                <p
                  className="text-sm text-slate-500"
                  data-testid="gallery-empty"
                >
                  No photos yet. Upload images when submitting a recommendation
                  to showcase the work.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:opacity-90"
                      onClick={() => setLightboxIdx(i)}
                      aria-label={`Open image ${i + 1} of ${photos.length}`}
                      data-testid={`gallery-thumb-${i}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb || p.url}
                        alt={p.alt || ""}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Summary + Verifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* LEFT: summary */}
              <section
                className="card"
                data-testid="builder-summary-card"
                aria-labelledby="builder-summary-heading"
              >
                <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                  {/* Left: company + badges */}
                  <div className="min-w-0">
                    <h2
                      id="builder-summary-heading"
                      className="text-xl font-semibold truncate"
                      data-testid="builder-company"
                      title={resolveCompanyNameForBuilder(
                        builder,
                        verification
                      )}
                    >
                      {resolveCompanyNameForBuilder(builder, verification)}
                    </h2>

                    <div
                      className="mt-2 flex items-center gap-2"
                      data-testid="builder-badges"
                    >
                      {builder.fromFriend ? (
                        <Badge color="indigo">Friend</Badge>
                      ) : null}
                      {builder.fromCommunity ? (
                        <Badge color="green">Community</Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Right: votes + VMB */}
                  <div className="justify-self-end shrink-0 flex flex-col items-end">
                    <div className="flex items-center gap-3">
                      <div
                        className="text-sm text-zinc-500 flex items-center gap-1"
                        data-testid="builder-votes"
                        aria-label={`Votes: ${builder.likes ?? 0}`}
                        title={`${builder.likes ?? 0} vote${
                          (builder.likes ?? 0) === 1 ? "" : "s"
                        }`}
                      >
                        <ThumbsUpIcon className="h-4 w-4" />
                        <span className="tabular-nums">
                          {builder.likes ?? 0}
                        </span>
                      </div>
                      <ScoreChip value={score ?? builder.score} />
                    </div>

                    {!isOwner && (
                      <button
                        className={`mt-2 h-9 w-9 rounded-full border grid place-items-center text-sm transition
            ${
              builder.myLike === 1
                ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                : "border-slate-300 hover:bg-slate-50"
            }
            ${!user ? "opacity-60 cursor-not-allowed" : ""}`}
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
                      </button>
                    )}

                    {scoreErr && (
                      <div className="mt-1 text-xs text-rose-600">
                        {scoreErr}
                      </div>
                    )}
                  </div>
                </div>

                {builder.comment && (
                  <p
                    className="text-sm text-slate-700 mt-3 whitespace-pre-wrap"
                    data-testid="builder-comment"
                  >
                    {builder.comment}
                  </p>
                )}

                {/* Meta rows */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {/* Recommenders (names only, aggregated) */}
                  <div className="space-y-1">
                    <div className="text-slate-500">Recommender</div>
                    <div data-testid="builder-recommender">
                      {aggNames.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="list-disc list-inside">
                          {aggNames.map((n, i) => (
                            <li key={`${n}-${i}`}>Recommended by {n}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Date updated (latest createdAt across group) */}
                  <div className="space-y-1">
                    <div className="text-slate-500">Date updated</div>
                    <time data-testid="builder-updated">
                      {aggUpdatedAt
                        ? new Date(aggUpdatedAt).toLocaleString()
                        : new Date(builder.createdAt).toLocaleString()}
                    </time>
                  </div>

                  {/* Builder phone(s) (aggregated) */}
                  {aggPhones.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-slate-500">Builder phone</div>
                      <div data-testid="builder-phone" className="tabular-nums">
                        <ul className="space-y-0.5">
                          {aggPhones.map((p, i) => (
                            <li key={`${p}-${i}`}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* RIGHT: Verifications */}
              <section
                className="card"
                data-testid="verifications-card"
                aria-labelledby="verifications-heading"
              >
                <h3
                  id="verifications-heading"
                  className="text-lg font-semibold"
                >
                  Verifications
                </h3>
                <p
                  className="mt-1 text-sm text-slate-600"
                  data-testid="verifications-copy"
                >
                  Extra checks we run so you can decide with confidence.
                </p>

                <div className="mt-4 divide-y divide-slate-100">
                  {/* Companies House (single block) */}
                  <div
                    className="py-3 flex items-center justify-between gap-4"
                    data-testid="verification-companies-house"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">Companies House</div>
                      {verification?.companyNumber ? (
                        <div className="text-xs text-slate-500">
                          #{verification.companyNumber}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      {verr ? (
                        <span className="text-sm text-rose-700 inline-flex items-center gap-1">
                          <ExclamationTriangleIcon className="h-5 w-5 text-rose-600" />
                          Error
                        </span>
                      ) : (
                        renderCHStatus(verification)
                      )}
                    </div>
                  </div>

                  {/* Google row (placeholder visual only) */}
                  <div
                    className="py-3 flex items-center justify-between gap-4"
                    data-testid="verification-google-row"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <GoogleMark />
                    </div>
                    <div className="shrink-0">
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="font-medium">5.0</span>
                        <span aria-hidden className="flex gap-0.5">
                          <span className="text-yellow-400">★</span>
                          <span className="text-yellow-400">★</span>
                          <span className="text-yellow-400">★</span>
                          <span className="text-yellow-400">★</span>
                          <span className="text-yellow-400">★</span>
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {lightboxOpen && photos[lightboxIdx as number] && (
              <Lightbox
                photos={photos}
                index={lightboxIdx as number}
                onClose={() => setLightboxIdx(null)}
                onIndex={(i) => setLightboxIdx(i)}
              />
            )}
          </div>
        )}
      </div>
    </AuthedOnly>
  );
}

/* ---------------- Lightbox ---------------- */

function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        onIndex((index + 1) % Math.max(1, photos.length));
      if (e.key === "ArrowLeft")
        onIndex((index - 1 + Math.max(1, photos.length)) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndex]);

  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 px-3 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
      onClick={onClose}
    >
      <button
        ref={closeBtnRef}
        className="absolute top-3 right-3 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onClick={onClose}
        aria-label="Close"
        data-testid="lightbox-close"
      >
        ✕
      </button>

      {photos.length > 1 && (
        <button
          className="absolute left-3 md:left-6 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index - 1 + photos.length) % photos.length);
          }}
          aria-label="Previous image"
          data-testid="lightbox-prev"
        >
          ‹
        </button>
      )}

      <div
        className="max-w-6xl w-full"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt || ""}
          className="mx-auto max-h-[80vh] w-auto object-contain rounded-lg shadow-2xl"
          data-testid="lightbox-image"
        />
        <div
          className="mt-2 text-center text-xs text-white/80"
          data-testid="lightbox-count"
        >
          {index + 1} / {photos.length}
        </div>
      </div>

      {photos.length > 1 && (
        <button
          className="absolute right-3 md:right-6 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/15 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index + 1) % photos.length);
          }}
          aria-label="Next image"
          data-testid="lightbox-next"
        >
          ›
        </button>
      )}
    </div>
  );
}
