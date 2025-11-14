import { useRouter } from "next/router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import Link from "next/link";
import { getAggregateVmbForCompany, type FetchRecsFn } from "@/utils/vmb";
import BlurUnlock from "@/components/ui/BlurUnlock";
import LightboxGallery, {
  type GalleryImage,
} from "@/components/LightboxGallery";

type Photo = { id: string; url: string; thumb?: string; alt?: string };

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
const ClockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm1 11h5v-2h-2V6h-2v7z" />
  </svg>
);
const ExclamationTriangleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z" />
  </svg>
);
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
    } catch {}
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
    // block UI while we check role
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

  // --- Normal page state/hooks (declared every render) ---
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [aggPhones, setAggPhones] = useState<string[]>([]);
  const [aggNames, setAggNames] = useState<string[]>([]);
  const [aggPhotos, setAggPhotos] = useState<Photo[]>([]);
  const [aggUpdatedAt, setAggUpdatedAt] = useState<string | null>(null);

  const [verification, setVerification] = useState<Verification | null>(null);
  const [verr, setVerr] = useState<string | null>(null);
  const [vLoading, setVLoading] = useState(false);

  const [score, setScore] = useState<number | undefined>(undefined);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);
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
      // guests: show locked preview quickly
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

  // CH verification
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id || redirecting) return;
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
      } catch {
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
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [api, builder?.project?.id, builder?.company, score, redirecting]);

  useEffect(() => {
    if (!builder || redirecting) return;
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

  // --- block UI completely while redirecting (no flicker for tradesmen) ---
  if (redirecting) return null;

  const companyName = user
    ? resolveCompanyNameForBuilder(builder, verification)
    : "Create a free account to view company details";

  const updatedDisplay =
    aggUpdatedAt ||
    builder?.createdAt ||
    (builder ? new Date().toISOString() : null);

  const primaryPhone = user && aggPhones.length > 0 ? aggPhones[0] : null;

  // simple initials avatar if no photo
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold" data-testid="builder-page-title">
          Builder profile
        </h1>
        {builder?.project && (
          <Link
            href="/projects"
            aria-label="Back to my projects"
            title="Back to my projects"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            data-testid="btn-back"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
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
            <span>Back to projects</span>
          </Link>
        )}
      </div>

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
            {/* Header card like tradesman page */}
            <header className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur px-4 py-4 sm:px-6 sm:py-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-slate-200 grid place-items-center text-lg font-semibold text-white">
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
                      className="truncate text-xl sm:text-2xl font-semibold tracking-tight text-slate-900"
                      title={companyName}
                      data-testid="builder-company"
                    >
                      {companyName}
                    </h2>
                    <div
                      className="mt-2 flex flex-wrap items-center gap-2"
                      data-testid="builder-badges"
                    >
                      {verification?.status === "verified" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          <span aria-hidden>✅</span>
                          <span>Companies House verified</span>
                        </span>
                      )}
                      {builder.fromFriend ? (
                        <Badge color="indigo">Friend</Badge>
                      ) : null}
                      {builder.fromCommunity ? (
                        <Badge color="green">Community</Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-2">
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
                      <span className="tabular-nums">{builder.likes ?? 0}</span>
                    </div>
                    {user ? (
                      <ScoreChip value={score ?? builder.score} />
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-500">
                        VMB —
                      </span>
                    )}
                  </div>

                  {!isOwner && user && (
                    <button
                      className={`mt-1 h-9 w-9 rounded-full border grid place-items-center text-sm transition ${
                        builder.myLike === 1
                          ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                          : "border-slate-300 hover:bg-slate-50"
                      }`}
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
                    <div className="mt-1 text-xs text-rose-600">{scoreErr}</div>
                  )}

                  {updatedDisplay && (
                    <div className="mt-1 text-xs text-slate-500">
                      Updated{" "}
                      {new Date(updatedDisplay).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Main two-column layout */}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
              {/* LEFT: Gallery + summary */}
              <div className="space-y-6">
                {/* Gallery */}
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                  data-testid="gallery-card"
                  aria-labelledby="gallery-heading"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3
                      id="gallery-heading"
                      className="text-lg font-semibold text-slate-900"
                    >
                      Project photos
                    </h3>
                    <span
                      className="text-xs text-slate-500"
                      data-testid="gallery-count"
                    >
                      {user
                        ? `${photos.length} photo${
                            photos.length === 1 ? "" : "s"
                          }`
                        : "Locked preview"}
                    </span>
                  </div>

                  {user ? (
                    galleryImages.length === 0 ? (
                      <p
                        className="text-sm text-slate-500"
                        data-testid="gallery-empty"
                      >
                        No photos yet. Upload images when submitting a
                        recommendation to showcase the work.
                      </p>
                    ) : (
                      <LightboxGallery
                        images={galleryImages}
                        cols={4}
                        rounded="rounded-xl"
                      />
                    )
                  ) : (
                    <BlurUnlock
                      previewCount={3}
                      totalCount={photos.length || undefined}
                      label="photos from neighbours"
                    >
                      <div
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
                        aria-hidden
                      >
                        {new Array(6).fill(null).map((_, i) => (
                          <div
                            key={i}
                            className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                          >
                            <div className="absolute inset-0 animate-pulse bg-slate-200" />
                          </div>
                        ))}
                      </div>
                    </BlurUnlock>
                  )}
                </section>

                {/* Summary / recommenders / comment */}
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                  data-testid="builder-summary-card"
                  aria-labelledby="builder-summary-heading"
                >
                  <h3
                    id="builder-summary-heading"
                    className="text-lg font-semibold text-slate-900 mb-2"
                  >
                    Neighbours’ feedback
                  </h3>

                  {builder.comment && (
                    <p
                      className="text-sm text-slate-700 whitespace-pre-wrap mb-4"
                      data-testid="builder-comment"
                    >
                      {builder.comment}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    {user ? (
                      <>
                        <div className="space-y-1">
                          <div className="text-slate-500">
                            {aggNames.length > 1
                              ? "Recommenders"
                              : "Recommender"}
                          </div>
                          <div data-testid="builder-recommender">
                            {aggNames.length === 0 ? (
                              "—"
                            ) : (
                              <ul className="space-y-1">
                                {aggNames.map((n, i) => (
                                  <li
                                    key={`${n}-${i}`}
                                    className="flex items-start gap-2"
                                  >
                                    <span
                                      aria-hidden
                                      className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500"
                                    />
                                    <span className="text-slate-700">{n}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-slate-500">Date updated</div>
                          <time data-testid="builder-updated">
                            {updatedDisplay
                              ? new Date(updatedDisplay).toLocaleString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )
                              : "—"}
                          </time>
                        </div>

                        <div className="space-y-1">
                          <div className="text-slate-500">Builder phone</div>
                          <div
                            data-testid="builder-phone"
                            className="tabular-nums"
                          >
                            {aggPhones.length === 0 ? (
                              "—"
                            ) : (
                              <ul className="space-y-0.5">
                                {aggPhones.map((p, i) => (
                                  <li key={`${p}-${i}`}>{p}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <div className="text-slate-500">Recommender</div>
                          <SkeletonLine className="h-4 w-40" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-slate-500">Date updated</div>
                          <SkeletonLine className="h-4 w-28" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-slate-500">Builder phone</div>
                          <SkeletonLine className="h-4 w-36" />
                        </div>
                      </>
                    )}
                  </div>
                </section>
              </div>

              {/* RIGHT: Contact details + verifications (stacked) */}
              <div className="space-y-6">
                {/* Contact details card – like tradesman page */}
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                  aria-label="Contact details"
                  data-testid="contact-details-card"
                >
                  <h2 className="text-base font-semibold text-slate-900 mb-3">
                    Contact details
                  </h2>

                  {user ? (
                    <>
                      <div className="space-y-1 mb-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Phone
                        </div>
                        <div className="mt-1 text-sm text-emerald-700">
                          {primaryPhone ?? "Not provided"}
                        </div>
                        {aggPhones.length > 1 && (
                          <ul className="mt-1 text-xs text-slate-500 space-y-0.5">
                            {aggPhones.slice(1).map((p, idx) => (
                              <li key={`${p}-${idx}`}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <hr className="my-3 border-slate-100" />

                      <div className="space-y-1 mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Recommenders
                        </div>
                        <div className="mt-1 text-sm text-slate-700">
                          {aggNames.length === 0
                            ? "Not specified"
                            : aggNames.join(", ")}
                        </div>
                      </div>

                      <hr className="my-3 border-slate-100" />

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Date updated
                        </div>
                        <div className="mt-1 text-sm text-slate-700">
                          {updatedDisplay
                            ? new Date(updatedDisplay).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )
                            : "—"}
                        </div>
                      </div>
                    </>
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
                            Recommenders
                          </div>
                          <SkeletonLine className="mt-1 h-4 w-40" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Date updated
                          </div>
                          <SkeletonLine className="mt-1 h-4 w-28" />
                        </div>
                      </div>
                    </BlurUnlock>
                  )}
                </section>

                {/* Verifications card (unchanged content, new styling) */}
                <section
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                  data-testid="verifications-card"
                  aria-labelledby="verifications-heading"
                >
                  <h3
                    id="verifications-heading"
                    className="text-base font-semibold text-slate-900"
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
                    <div
                      className="py-3 flex items-center justify-between gap-4"
                      data-testid="verification-companies-house"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          Companies House
                        </div>
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
                        ) : user ? (
                          renderCHStatus(verification)
                        ) : (
                          <span className="text-sm text-slate-500">
                            Sign in to view
                          </span>
                        )}
                      </div>
                    </div>

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
            </div>
          </div>
        )
      )}
    </div>
  );
}
