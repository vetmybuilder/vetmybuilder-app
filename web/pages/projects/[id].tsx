import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";

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
  status: "pending" | "live" | "archived";
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
  likes?: number;
  myLike?: 0 | 1;
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
const LikeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12.1 21.35c-.32 0-.63-.1-.9-.3l-1.2-.9C5.2 16.54 2 13.76 2 10.28 2 7.5 4.2 5.3 7 5.3c1.45 0 2.86.63 3.8 1.7.94-1.07 2.35-1.7 3.8-1.7 2.8 0 5 2.2 5 4.98 0 3.48-3.2 6.26-7 9.88l-1.2.9c-.27.2-.58.3-.9.3z" />
  </svg>
);
const CameraIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M9 3a1 1 0 0 0-.9.56L7.38 5H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2.38l-.72-1.44A1 1 0 0 0 14 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
  </svg>
);

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
  const { id } = router.query;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // shortlist
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recTotal, setRecTotal] = useState(0);
  const [recsErr, setRecsErr] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<number | null>(null);

  // photos map: recId -> hasPhotos
  const [recHasPhotos, setRecHasPhotos] = useState<Record<number, boolean>>({});

  // eligibility to add recommendation
  const [canAddRec, setCanAddRec] = useState(false);

  // busy flag for archive/unarchive/publish
  const [busy, setBusy] = useState(false);

  // flash banner (auto-dismiss)
  const [flash, setFlash] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 50000);
    return () => clearTimeout(t);
  }, [flash]);

  /* Load project */
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;
    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        setProject(data.project);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const message =
          e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(message))) {
          setErr("You need to sign in again to view this project.");
        } else {
          setErr("Failed to load project");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  const isOwner = !!(user && project && user.uid === project.ownerUserId);
  const isArchived = (project?.status || "").toLowerCase() === "archived";
  const isLive = (project?.status || "").toLowerCase() === "live";
  const canPublish = isOwner && !isArchived && !isLive;

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

  // Updated: copy invite shows flash message like onUnarchive
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

  async function loadRecs(pid: number) {
    const { data } = await api.get(
      `/api/projects/${pid}/recommendations?page=1&pageSize=3`
    );
    setRecs(data.items || []);
    setRecTotal(data.total || 0);
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

  /* Fetch photos flags */
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

  /* Can add recommendation?
     - Only when project is LIVE
     - And user profile has a location (unchanged)
     - And project is NOT archived (extra guard) */
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
        if (alive) setCanAddRec(isLive && !isArchived && hasLoc);
      } catch {
        if (alive) setCanAddRec(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, router.isReady, authLoading, user, project, isLive, isArchived]);

  /* Likes */
  const canLike = !!user && !!project && !isOwner;
  const likeOnce = async (rec: Recommendation) => {
    if (!canLike || !project || likingId) return;
    if (rec.myLike === 1) return;
    setLikingId(rec.id);
    setRecs((prev) =>
      (prev || []).map((r) =>
        r.id === rec.id
          ? { ...r, myLike: 1 as 0 | 1, likes: (r.likes ?? 0) + 1 }
          : r
      )
    );
    try {
      await api.post(`/api/recommendations/${rec.id}/like`);
      await loadRecs(project.id);
    } catch {
      await loadRecs(project.id);
    } finally {
      setLikingId(null);
    }
  };

  const maxLikes = Math.max(0, ...(recs || []).map((r) => r.likes ?? 0));

  /* ===== Render ===== */
  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="project-view-page"
      >
        {authLoading || (router.isReady && loading) ? (
          <p
            className="py-10 text-sm text-slate-500"
            data-testid="project-loading"
          >
            Loading…
          </p>
        ) : err ? (
          <div className="py-10" data-testid="project-error">
            <p className="text-red-600">{err}</p>
            <Link
              href="/login"
              className="btn mt-3"
              aria-label="Go to sign in"
              data-testid="btn-go-signin"
            >
              Go to sign in
            </Link>
          </div>
        ) : project ? (
          <>
            {/* Header band */}
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
                    href="/projects"
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
                </div>
              </div>
            </div>

            {/* Main grid */}
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
                      <Link
                        className="btn"
                        href={`/projects/${project.id}/edit`}
                        aria-label="Edit project"
                        data-testid="btn-edit"
                      >
                        Edit
                      </Link>
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
                      {!isArchived ? (
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
                      ) : (
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
                      )}
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

                  {/* Meta badges */}
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

                {/* Add recommendation button: only if LIVE, not owner, and not archived */}
                {canAddRec && !isOwner && !isArchived && (
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
                        Top 3 recommendations, ranked by the community.
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
                          const likes = r.likes ?? 0;
                          const hasLiked = r.myLike === 1;
                          const stars =
                            (r.rating ?? 0) > 0
                              ? Math.max(
                                  1,
                                  Math.min(5, Math.round(Number(r.rating)))
                                )
                              : likes > 0
                              ? starsFromLikes(likes, maxLikes)
                              : 0;

                          const hasPhotos = !!recHasPhotos[r.id];

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
                                      <StarRating value={stars} />
                                      <div
                                        className="text-xs text-slate-500 tabular-nums flex items-center gap-1"
                                        aria-label={`${likes} likes`}
                                        data-testid="shortlist-likes"
                                      >
                                        <LikeIcon className="h-3.5 w-3.5" />{" "}
                                        {likes}
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
                                      onClick={() => likeOnce(r)}
                                      disabled={
                                        !user || hasLiked || likingId === r.id
                                      }
                                      className={`h-9 w-9 rounded-full grid place-items-center border transition
                                        ${
                                          hasLiked
                                            ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                                            : "border-slate-200 hover:bg-slate-50"
                                        }
                                        ${!user ? "opacity-60" : ""}`}
                                      title={
                                        !user
                                          ? "Sign in to like"
                                          : hasLiked
                                          ? "You’ve liked this"
                                          : "Like"
                                      }
                                      aria-label={
                                        !user
                                          ? "Sign in to like"
                                          : hasLiked
                                          ? "You have liked this"
                                          : "Like"
                                      }
                                      data-testid="shortlist-like-button"
                                    >
                                      <LikeIcon className="h-4 w-4" />
                                    </button>
                                    <div
                                      className="mt-1 text-xs tabular-nums text-slate-600"
                                      aria-live="polite"
                                      data-testid="shortlist-like-count"
                                    >
                                      {likes}
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
        ) : null}
      </div>
    </AuthedOnly>
  );
}
