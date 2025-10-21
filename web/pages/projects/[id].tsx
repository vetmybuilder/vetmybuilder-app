import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import CloseProjectModal from "@/components/CloseProjectModal";
import { fetchVmbRatings, voteUpRecommendation } from "@/utils/vmb";

/* ===== Types ===== */
type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  ownerUserId: string;
  status: "pending" | "live" | "archived" | "completed";
};

type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  phone?: string | null;
  company: string;
  rating?: number | null;
  comment: string | null;
  isAnonymous: 0 | 1;
  createdAt: string;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  likes?: number; // treat as "votes"
  myLike?: 0 | 1; // 1 when I’ve voted already
  score?: number; // VMB score (server-calculated)
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

/* ===== UI Helpers ===== */
function StarRating({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(value ?? 0))));
  return (
    <div className="flex gap-0.5" aria-label={`Rating: ${v} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= v ? "text-yellow-400" : "text-gray-300"}
          aria-hidden
        >
          ★
        </span>
      ))}
    </div>
  );
}

/** Thumbs up icon */
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

/* Small icons for CH status */
const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm-1.2 13.3-3.1-3.1 1.4-1.4 1.7 1.7 4-4 1.4 1.4-5.4 5.4z" />
  </svg>
);
const ExclamationTriangleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z" />
  </svg>
);
const ClockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm1 11h5v-2h-2V6h-2v7z" />
  </svg>
);

/** VMB score chip (shows exact value like 2.5; drops .0) */
function ScoreChip({ value }: { value?: number }) {
  if (value == null || Number.isNaN(Number(value))) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600">
        VMB —
      </span>
    );
  }
  const n = Number(value);
  const label =
    n <= 5 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
      title={`VMB score: ${label}`}
      aria-label={`VMB score ${label}`}
      data-testid="shortlist-vmb-score"
    >
      VMB {label}
    </span>
  );
}

function starsFromLikes(likes: number, maxLikes: number) {
  if (maxLikes <= 0) return 0;
  const pct = likes / maxLikes;
  return Math.max(1, Math.round(pct * 5));
}
const displayRecommender = (r: Recommendation) =>
  r.name && r.name.trim() ? r.name.trim() : "Guest";

/* ===== Page ===== */
export default function ProjectView() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const projectId = useMemo(() => {
    const raw = router.query.id;
    const n = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(n) ? n : null;
  }, [router.query.id]);

  type Tab = "mine" | "community" | "favourites" | "archived" | "recommended";
  const tabParam = Array.isArray(router.query.tab)
    ? router.query.tab[0]
    : router.query.tab;
  const sourceTab = (typeof tabParam === "string" ? tabParam : undefined) as
    | Tab
    | undefined;
  const isFromCommunity = sourceTab === "community";

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  // shortlist
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recTotal, setRecTotal] = useState(0);
  const [recsErr, setRecsErr] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<number | null>(null);

  // photos: recId -> hasPhotos
  const [recHasPhotos, setRecHasPhotos] = useState<Record<number, boolean>>({});

  // NEW: verification map: recId -> verification
  const [recVerification, setRecVerification] = useState<
    Record<number, Verification>
  >({});

  // eligibility to add recommendation
  const [canAddRec, setCanAddRec] = useState(false);

  // busy flag
  const [busy, setBusy] = useState(false);

  // favourites
  const [addedToFavourites, setAddedToFavourites] = useState(false);

  // flash banner
  const [closeOpen, setCloseOpen] = useState(false);
  const [flash, setFlash] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  /* Load project */
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !projectId) return;
    let alive = true;
    setLoading(true);
    setErrorStatus(null);
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}`);
        if (!alive) return;
        setProject(data.project);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status ?? 500;
        setErrorStatus(status);
        setProject(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, projectId, router.isReady, authLoading, user]);

  const isOwner = !!(user && project && user.uid === project.ownerUserId);
  const statusLower = (project?.status || "").toLowerCase();
  const isArchived = statusLower === "archived";
  const isCompleted = statusLower === "completed";
  const isClosed = isArchived || isCompleted;
  const isLive = statusLower === "live";
  const canPublish = isOwner && !isClosed && !isLive;

  const onPublish = async () => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/projects/${project.id}/publish`);
      setProject(data.project);
      setFlash({ kind: "success", text: "Project published" });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text: e?.response?.data?.error || "Failed to publish",
      });
    } finally {
      setBusy(false);
    }
  };

  const onArchive = async () => {
    if (!project || busy || !isOwner) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/projects/${project.id}/archive`);
      setProject(data.project);
      setFlash({ kind: "success", text: "Project archived" });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text: e?.response?.data?.error || e?.message || "Failed to archive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onUnarchive = async () => {
    if (!project || busy || !isOwner) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/projects/${project.id}/unarchive`);
      setProject(data.project);
      setFlash({ kind: "success", text: "Project unarchived" });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text: e?.response?.data?.error || e?.message || "Failed to unarchive",
      });
    } finally {
      setBusy(false);
    }
  };

  // Close: trust server to set status to 'completed' (community) or 'archived' (otherwise)
  const onCloseProject = async (payload: {
    didGoAhead: boolean;
    reasons: string[];
    otherReason?: string;
    selectedRecommendationId?: number; // forwarded from modal if user picked a winner
  }) => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(
        `/api/projects/${project.id}/close`,
        payload
      );
      const updated: Project = data?.project ?? project;
      setProject(updated);
      setFlash({
        kind: "success",
        text:
          updated.status === "completed"
            ? "Project closed (Completed — Community)"
            : "Project closed and archived",
      });
      setCloseOpen(false);
    } catch (e: any) {
      setFlash({
        kind: "error",
        text:
          e?.response?.data?.error || e?.message || "Failed to close project",
      });
    } finally {
      setBusy(false);
    }
  };

  const onCopyInvite = async () => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/projects/${project.id}/magic-link`);
      if (!data?.url) throw new Error("No URL returned");
      let copied = false;
      try {
        await navigator.clipboard.writeText(data.url);
        copied = true;
      } catch {
        try {
          const ta = document.createElement("textarea");
          ta.value = String(data.url);
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.top = "-10000px";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          copied = false;
        }
      }
      setFlash({
        kind: "success",
        text: copied
          ? "Invite link copied to clipboard"
          : `Invite link: ${data.url}`,
      });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text:
          e?.response?.data?.error || e?.message || "Failed to generate link",
      });
    } finally {
      setBusy(false);
    }
  };

  const canShowAddFavourite =
    isFromCommunity && !isOwner && !isClosed && !addedToFavourites;
  const onAddToFavourites = async () => {
    if (!project || !canShowAddFavourite || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/projects/${project.id}/favourite`);
      setAddedToFavourites(true);
      setFlash({ kind: "success", text: "Added to favourites" });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text: e?.response?.data?.error || e?.message || "Could not favourite",
      });
    } finally {
      setBusy(false);
    }
  };

  type VmbListOk = { items: Recommendation[]; total?: number };
  type VmbSingleOk = { item?: Recommendation | null };

  function hasItems(res: unknown): res is VmbListOk {
    return !!res && typeof res === "object" && "items" in (res as any);
  }
  function hasItem(res: unknown): res is VmbSingleOk {
    return !!res && typeof res === "object" && "item" in (res as any);
  }

  // --- Use unified ratings endpoint for shortlist with a type guard ---
  async function loadRecs(pid: number) {
    const res = await fetchVmbRatings(api, { projectId: pid, limit: 3 });

    if (hasItems(res)) {
      const { items, total } = res;
      setRecs(items ?? []);
      setRecTotal(total ?? (items ? items.length : 0));
      setRecsErr(null);
      return;
    }

    if (hasItem(res)) {
      const item = res.item ?? null;
      setRecs(item ? [item] : []);
      setRecTotal(item ? 1 : 0);
      setRecsErr(null);
      return;
    }

    // fallback (unexpected shape)
    setRecs([]);
    setRecTotal(0);
    setRecsErr(null);
  }

  /* Load shortlist */
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !project?.id) return;
    let alive = true;
    (async () => {
      try {
        await loadRecs(project.id);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error ?? e?.response?.data?.error ?? e?.message ?? "";
        if (status === 401 || /missing bearer token/i.test(String(msg))) {
          setRecs([]);
          setRecTotal(0);
          setRecsErr(null);
        } else {
          setRecsErr("Failed to load recommendations");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading, user, project?.id]);

  /* Photos flags */
  useEffect(() => {
    if (!recs || recs.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        recs.map(async (r) => {
          try {
            const { data } = await api.get(`/api/recommendations/${r.id}`);
            const has = Array.isArray(data?.recommendation?.photos)
              ? data.recommendation.photos.length > 0
              : false;
            return [r.id, has] as const;
          } catch {
            return [r.id, false] as const;
          }
        })
      );
      if (!cancelled) {
        const map: Record<number, boolean> = {};
        for (const [rid, has] of entries) map[rid] = has;
        setRecHasPhotos(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, recs]);

  /* Companies House verification per recommendation */
  useEffect(() => {
    if (!recs || recs.length === 0) {
      setRecVerification({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        recs.map(async (r) => {
          try {
            const { data } = await api.get(
              `/api/recommendations/${r.id}/verification`
            );
            const ver: Verification = data?.verification ?? {
              recommendationId: r.id,
              status: "queued",
            };
            return [r.id, ver] as const;
          } catch {
            return [
              r.id,
              { recommendationId: r.id, status: "error" as VerificationStatus },
            ] as const;
          }
        })
      );
      if (!cancelled) {
        const map: Record<number, Verification> = {};
        for (const [rid, ver] of entries) map[rid] = ver;
        setRecVerification(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, recs]);

  /* Can add recommendation? */
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !project) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/profile`);
        const hasLoc =
          !!data?.profile?.postcode ||
          !!data?.profile?.postcodeSector ||
          !!data?.profile?.postcodeOutward ||
          !!data?.profile?.city;
        if (alive) setCanAddRec(isLive && !isClosed && hasLoc);
      } catch {
        if (alive) setCanAddRec(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading, user, project, isLive, isClosed]);

  /* Voting (upvote) */
  const canVote = !!user && !!project && !isOwner;
  const voteUpOnce = async (rec: Recommendation) => {
    if (!canVote || !project || votingId) return;
    if (rec.myLike === 1) return; // already voted
    setVotingId(rec.id);
    // optimistic
    setRecs((prev) =>
      (prev || []).map((r) =>
        r.id === rec.id
          ? { ...r, myLike: 1 as 0 | 1, likes: (r.likes ?? 0) + 1 }
          : r
      )
    );
    try {
      await voteUpRecommendation(api, rec.id); // backend counts this into VMB
      await loadRecs(project.id); // refresh counts + VMB score
    } catch {
      await loadRecs(project.id);
    } finally {
      setVotingId(null);
    }
  };

  const maxLikes = Math.max(0, ...(recs || []).map((r) => r.likes ?? 0));

  /* Helpers for CH badge */
  function chLabel(status?: VerificationStatus) {
    switch (status) {
      case "verified":
        return "Verified";
      case "running":
      case "queued":
        return "Checking";
      case "ambiguous":
        return "Needs review";
      case "no_match":
        return "No match";
      case "error":
        return "Error";
      default:
        return "Checking";
    }
  }
  function chBadgeClass(status?: VerificationStatus) {
    switch (status) {
      case "verified":
        return "bg-green-300 text-orange-700 border-green-200 font-bold";
      case "ambiguous":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "no_match":
        return "bg-slate-100 text-slate-600 border-slate-200";
      case "error":
        return "bg-red-100 text-red-700 border-red-200";
      case "queued":
      case "running":
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  }
  function chIcon(status?: VerificationStatus) {
    switch (status) {
      case "verified":
        return <CheckCircleIcon className="h-3.5 w-3.5" />;
      case "queued":
      case "running":
        return <ClockIcon className="h-3.5 w-3.5" />;
      case "ambiguous":
      case "no_match":
      case "error":
        return <ExclamationTriangleIcon className="h-3.5 w-3.5" />;
      default:
        return <ClockIcon className="h-3.5 w-3.5" />;
    }
  }

  /* ===== Render ===== */
  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="project-view-page"
      >
        {(authLoading || (router.isReady && loading)) && (
          <p
            className="py-10 text-sm text-slate-500"
            data-testid="project-loading"
          >
            Loading…
          </p>
        )}

        {!loading && errorStatus === 401 && (
          <EmptyState
            title="Sign in required"
            description="You need to sign in to view projects."
            actions={
              <Link
                href="/login"
                className="btn mt-3"
                aria-label="Go to sign in"
                data-testid="btn-go-signin"
              >
                Go to sign in
              </Link>
            }
            dataTestId="project-error-401"
          />
        )}

        {!loading && errorStatus === 404 && (
          <EmptyState
            title="Project not found or not visible"
            description="This project either doesn’t exist or isn’t visible to you. It may be pending or archived by its owner."
            actions={
              <div className="flex gap-3">
                <Link
                  href="/projects"
                  className="btn"
                  data-testid="btn-back-to-my-projects"
                >
                  Back to My Projects
                </Link>
              </div>
            }
            dataTestId="project-error-404"
          />
        )}

        {!loading &&
          errorStatus != null &&
          errorStatus !== 401 &&
          errorStatus !== 404 && (
            <EmptyState
              title="Failed to load project"
              description="Something went wrong while fetching this project."
              actions={
                <button
                  className="btn mt-3"
                  onClick={() => {
                    if (projectId) {
                      setErrorStatus(null);
                      setLoading(true);
                      api
                        .get(`/api/projects/${projectId}`)
                        .then(({ data }) => setProject(data.project))
                        .catch((e: any) =>
                          setErrorStatus(
                            e?.status ?? e?.response?.status ?? 500
                          )
                        )
                        .finally(() => setLoading(false));
                    }
                  }}
                  data-testid="btn-retry"
                >
                  Try again
                </button>
              }
              dataTestId="project-error-generic"
            />
          )}

        {!loading && !errorStatus && project && (
          <>
            <div
              className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm"
              data-testid="project-header"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div aria-labelledby="project-title">
                  <h1
                    id="project-title"
                    className="text-2xl font-semibold tracking-tight"
                    data-testid="project-title"
                  >
                    {project.name}
                  </h1>
                  <p
                    className="mt-1 text-sm text-slate-500"
                    aria-live="polite"
                    data-testid="project-created"
                  >
                    Created {new Date(project.createdAt).toLocaleString()}
                  </p>
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  aria-label="Project actions"
                  data-testid="project-actions"
                >
                  <Link
                    href={`/projects${sourceTab ? `?tab=${sourceTab}` : ""}`}
                    aria-label="Back to my projects"
                    title="Back to my projects"
                    className="btn-back"
                    data-testid="btn-back-to-projects"
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

                  {isFromCommunity &&
                    !isOwner &&
                    !isClosed &&
                    !addedToFavourites && (
                      <button
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium ring-1 shadow-sm transition bg-amber-500 text-white ring-amber-400 hover:bg-amber-600 disabled:opacity-60"
                        onClick={onAddToFavourites}
                        disabled={busy}
                        aria-busy={busy}
                        data-testid="btn-add-to-favourites"
                        aria-label="Add to favourites"
                        title="Add to favourites"
                      >
                        Add to favourites
                      </button>
                    )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: details */}
              <section
                className="lg:col-span-6"
                aria-labelledby="details-heading"
                data-testid="project-details"
              >
                <div className="card">
                  {!!flash && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                        flash.kind === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      } transition-opacity`}
                      data-testid="flash-message"
                    >
                      {flash.text}
                    </div>
                  )}

                  <h2 id="details-heading" className="sr-only">
                    Project details
                  </h2>

                  {isOwner && (
                    <div
                      className="mb-4 flex flex-wrap gap-2"
                      aria-label="Owner actions"
                      data-testid="owner-actions"
                    >
                      {/* Edit — only when NOT closed */}
                      {!isClosed && (
                        <Link
                          className="btn"
                          href={`/projects/${project.id}/edit`}
                          aria-label="Edit project"
                          data-testid="btn-edit"
                        >
                          Edit
                        </Link>
                      )}
                      {/* Publish — only when canPublish (not live, not closed) */}
                      {canPublish && (
                        <button
                          className="btn"
                          onClick={onPublish}
                          aria-label="Publish project"
                          disabled={busy}
                          aria-busy={busy}
                          data-testid="btn-publish"
                        >
                          Publish
                        </button>
                      )}
                      {/* Close + Archive vs Unarchive */}
                      {!isClosed ? (
                        <>
                          <button
                            className="btn-danger"
                            onClick={() => setCloseOpen(true)}
                            aria-label="Close project"
                            disabled={busy}
                            aria-busy={busy}
                            data-testid="btn-close-project"
                          >
                            Close project
                          </button>
                          <button
                            className="btn-danger"
                            onClick={onArchive}
                            aria-label="Archive project"
                            disabled={busy}
                            aria-busy={busy}
                            data-testid="btn-archive"
                          >
                            {busy ? "Archiving…" : "Archive"}
                          </button>
                        </>
                      ) : isArchived ? (
                        <button
                          className="btn"
                          onClick={onUnarchive}
                          aria-label="Unarchive project"
                          disabled={busy}
                          aria-busy={busy}
                          data-testid="btn-unarchive"
                        >
                          {busy ? "Unarchiving…" : "Unarchive"}
                        </button>
                      ) : null}
                      {/* Copy Invite Link — only when live */}
                      {isLive && (
                        <button
                          className="btn"
                          onClick={onCopyInvite}
                          aria-label="Copy invite link"
                          data-testid="btn-copy-invite"
                        >
                          Copy Invite Link
                        </button>
                      )}
                    </div>
                  )}

                  <div
                    className="flex flex-wrap gap-2 mb-4"
                    role="list"
                    aria-label="Project attributes"
                    data-testid="project-badges"
                  >
                    <span
                      role="listitem"
                      className="badge blue"
                      aria-label={`Type: ${project.type}`}
                      data-testid="badge-type"
                    >
                      {project.type}
                    </span>
                    <span
                      role="listitem"
                      className="badge gray"
                      aria-label={`Location: ${project.location}`}
                      data-testid="badge-location"
                    >
                      {project.location}
                    </span>
                    <span
                      role="listitem"
                      className="badge orange capitalize"
                      aria-label={`Property: ${project.propertyType}`}
                      data-testid="badge-property"
                    >
                      {project.propertyType}
                    </span>
                    <span
                      role="listitem"
                      className="badge green"
                      aria-label={`Bedrooms: ${project.bedrooms}`}
                      data-testid="badge-bedrooms"
                    >
                      {project.bedrooms} bed
                    </span>
                    <span
                      role="listitem"
                      aria-label={`Project ${project.status}`}
                      data-testid="badge-status"
                    >
                      <StatusBadge value={project.status} />
                    </span>
                  </div>

                  <div className="divider" />

                  <dl
                    className="grid grid-cols-2 gap-4"
                    data-testid="project-fields"
                  >
                    <div>
                      <dt className="text-slate-500 text-sm">Type</dt>
                      <dd className="font-medium" data-testid="field-type">
                        {project.type}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 text-sm">Location</dt>
                      <dd className="font-medium" data-testid="field-location">
                        {project.location}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 text-sm">Property</dt>
                      <dd
                        className="font-medium capitalize"
                        data-testid="field-property"
                      >
                        {project.propertyType}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 text-sm">Bedrooms</dt>
                      <dd className="font-medium" data-testid="field-bedrooms">
                        {project.bedrooms}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 text-sm">Status</dt>
                      <dd
                        className="font-medium capitalize"
                        data-testid="field-status"
                      >
                        <StatusBadge value={project.status} />
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5" data-testid="project-description-block">
                    <h3 className="font-semibold mb-1" id="desc-heading">
                      Description
                    </h3>
                    <p
                      className="whitespace-pre-wrap text-slate-700"
                      aria-labelledby="desc-heading"
                      data-testid="field-description"
                    >
                      {project.description}
                    </p>
                  </div>
                </div>

                {canAddRec && !isOwner && !isClosed && (
                  <div className="mt-4">
                    <Link
                      className="btn"
                      href={`/projects/${project.id}/recommend`}
                      aria-label="Add recommendation"
                      data-testid="btn-add-recommendation"
                    >
                      Add recommendation
                    </Link>
                  </div>
                )}
              </section>

              {/* Right: shortlist */}
              <aside
                className="lg:col-span-6"
                aria-labelledby="shortlist-heading"
                data-testid="project-shortlist"
              >
                <div className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2
                        id="shortlist-heading"
                        className="text-2xl font-semibold tracking-tight"
                      >
                        Shortlist
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Top 3 recommendations, ranked by the VMB score.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4" />

                  {recsErr ? (
                    <p
                      className="text-sm text-red-600"
                      data-testid="shortlist-error"
                    >
                      {recsErr}
                    </p>
                  ) : !recs || recs.length === 0 ? (
                    <p
                      className="text-sm text-slate-500"
                      data-testid="shortlist-empty"
                    >
                      No builders have yet been recommended.
                    </p>
                  ) : (
                    <>
                      <ul
                        className="space-y-3"
                        aria-label="Top recommendations"
                        data-testid="shortlist-list"
                      >
                        {recs.map((r) => {
                          const votes = r.likes ?? 0;
                          const hasVoted = r.myLike === 1;

                          const stars =
                            (r.rating ?? 0) > 0
                              ? Math.max(
                                  1,
                                  Math.min(5, Math.round(Number(r.rating)))
                                )
                              : votes > 0
                              ? starsFromLikes(votes, maxLikes)
                              : 0;

                          const hasPhotos = !!recHasPhotos[r.id];

                          const ver = recVerification[r.id];
                          const vStatus = ver?.status;
                          const vLabel = chLabel(vStatus);

                          return (
                            <li
                              key={r.id}
                              className="rounded-xl border border-slate-200 bg-white/80 hover:bg-white shadow-sm hover:shadow-md transition p-3"
                              data-testid="shortlist-item"
                            >
                              <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="font-medium truncate flex-1 min-w-0"
                                      data-testid="shortlist-company"
                                    >
                                      <Link
                                        href={`/builders/${r.id}`}
                                        className="hover:underline decoration-indigo-400/60"
                                        title="Open builder profile"
                                      >
                                        {r.company}
                                      </Link>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-3 whitespace-nowrap">
                                      <ScoreChip value={r.score} />
                                      <div
                                        className="text-xs text-slate-500 tabular-nums flex items-center gap-1"
                                        aria-label={`${votes} votes`}
                                        data-testid="shortlist-votes"
                                        title={`${votes} vote${
                                          votes === 1 ? "" : "s"
                                        }`}
                                      >
                                        <ThumbsUpIcon className="h-3.5 w-3.5" />{" "}
                                        {votes}
                                      </div>
                                    </div>
                                  </div>

                                  {r.comment && (
                                    <p
                                      className="text-sm text-slate-700 mt-1 line-clamp-3"
                                      data-testid="shortlist-comment"
                                    >
                                      {r.comment}
                                    </p>
                                  )}

                                  <div className="mt-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {/* Companies House status badge */}
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chBadgeClass(
                                          vStatus
                                        )}`}
                                        title={`Companies House status${
                                          ver?.checkedAt
                                            ? ` · checked ${new Date(
                                                ver.checkedAt
                                              ).toLocaleString()}`
                                            : ""
                                        }${
                                          ver?.companyNumber
                                            ? ` · ${ver.companyNumber}`
                                            : ""
                                        }`}
                                        aria-label={`Companies House status: ${vLabel}`}
                                        data-testid="shortlist-badge-ch"
                                        data-status={vStatus || "unknown"}
                                      >
                                        {chIcon(vStatus)}
                                        <span data-testid="shortlist-badge-ch-text">
                                          {vLabel}
                                        </span>
                                      </span>

                                      {r.fromFriend ? (
                                        <span
                                          className="badge blue"
                                          aria-label="From a friend"
                                          data-testid="shortlist-badge-friend"
                                        >
                                          Friend
                                        </span>
                                      ) : null}
                                      {r.fromCommunity ? (
                                        <span
                                          className="badge green"
                                          aria-label="From the community"
                                          data-testid="shortlist-badge-community"
                                        >
                                          Community
                                        </span>
                                      ) : null}
                                      {hasPhotos && (
                                        <span
                                          className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs"
                                          title="Includes photos"
                                          aria-label="Includes photos"
                                          data-testid="shortlist-badge-photos"
                                        >
                                          <CameraIcon className="h-3.5 w-3.5" />
                                          Gallery
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="text-xs text-slate-500"
                                      data-testid="shortlist-date"
                                    >
                                      {new Date(
                                        r.createdAt
                                      ).toLocaleDateString()}
                                    </div>
                                  </div>

                                  <div
                                    className="text-xs text-slate-500 mt-1"
                                    aria-label="Recommender"
                                    data-testid="shortlist-recommender"
                                  >
                                    {displayRecommender(r)}
                                    {r.email ? ` · ${r.email}` : ""}
                                    {r.phone ? ` · ${r.phone}` : ""}
                                  </div>
                                </div>

                                {!isOwner && (
                                  <div className="ml-3 shrink-0 flex flex-col items-center">
                                    <button
                                      onClick={() => voteUpOnce(r)}
                                      disabled={
                                        !user || hasVoted || votingId === r.id
                                      }
                                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-sm transition
        ${
          hasVoted
            ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
            : "border-slate-200 hover:bg-slate-50"
        }
        ${!user ? "opacity-60" : ""}`}
                                      title={
                                        !user
                                          ? "Sign in to vote"
                                          : hasVoted
                                          ? "You’ve voted"
                                          : "Vote up"
                                      }
                                      aria-label={
                                        !user
                                          ? "Sign in to vote"
                                          : hasVoted
                                          ? "You have voted"
                                          : "Vote up"
                                      }
                                      data-testid="shortlist-vote-button"
                                    >
                                      <ThumbsUpIcon className="h-4 w-4" />
                                      <span>
                                        {hasVoted ? "Voted" : "Vote up"}
                                      </span>
                                    </button>
                                    <div
                                      className="mt-1 text-xs tabular-nums text-slate-600"
                                      aria-live="polite"
                                      data-testid="shortlist-vote-count"
                                      title={`${votes} vote${
                                        votes === 1 ? "" : "s"
                                      }`}
                                    >
                                      {votes}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {recTotal > (recs?.length ?? 0) && (
                        <div className="mt-3">
                          <Link
                            className="btn"
                            href={`/projects/${project.id}/shortlist`}
                            aria-label="View more recommendations"
                            data-testid="btn-shortlist-view-more"
                          >
                            View more
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      <CloseProjectModal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onSubmit={onCloseProject}
        projectName={project?.name}
        projectId={project?.id as number}
      />
    </AuthedOnly>
  );
}

/* ---------- small presentational bits ---------- */
function EmptyState({
  title,
  description,
  actions,
  dataTestId,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  dataTestId?: string;
}) {
  return (
    <div
      className="mx-auto max-w-3xl p-6"
      data-testid={dataTestId ?? "empty-state"}
      aria-live="polite"
      role="status"
    >
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <p
          className="text-red-600 font-semibold"
          data-testid="empty-state-title"
        >
          {title}
        </p>
        {description && (
          <p
            className="mt-2 text-slate-700"
            data-testid="empty-state-description"
          >
            {description}
          </p>
        )}
        {actions && <div className="mt-4">{actions}</div>}
      </div>
    </div>
  );
}
