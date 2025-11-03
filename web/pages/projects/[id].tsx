// web/pages/projects/[id].tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useMemo, useState } from "react";
import CloseProjectModal from "@/components/CloseProjectModal";
import { fetchVmbRatings, voteUpRecommendation } from "@/utils/vmb";
import EmptyState from "@/components/project/EmptyState";
import ShortlistSection from "@/components/project/ShortlistSection";
import ProjectDetailsCard from "@/components/project/ProjectDetailsCard";
import ProjectHeaderBar from "@/components/project/ProjectHeaderBar";
import DiscoverInline from "@/components/project/DiscoverInline";

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

/* ===== Discover (nearby tradespeople) ===== */
type TradesmanLite = {
  companyNumber?: string | null;
  companyName: string;
  topRecId?: number | null; // use to link to profile
  votes?: number; // aggregated likes
  score?: number | null; // VMB score if available
  area?: string | null; // optional area/city
  photos?: string[] | { filePath: string }[] | null;
};

function asPhotoUrl(p?: string | { filePath?: string } | null) {
  if (!p) return null;
  if (typeof p === "string") return p;
  if (typeof p === "object" && p.filePath) return p.filePath;
  return null;
}

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

  // verification map: recId -> verification
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

  /* ===== Detect if viewer is a tradesman (for back navigation & discover visibility) ===== */
  const [isTrades, setIsTrades] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) {
        if (alive) setIsTrades(false);
        return;
      }
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const role = String(data?.role || "").toLowerCase();
        const hasProfile = !!data?.profile;
        if (alive) setIsTrades(role === "tradesman" || hasProfile);
      } catch {
        if (alive) setIsTrades(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, user]);

  const backHref = isTrades
    ? "/tradesman/projects"
    : `/projects${sourceTab ? `?tab=${sourceTab}` : ""}`;

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
        } catch {}
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

  /* Load shortlist (skip entirely for tradesmen) */
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !project?.id) return;
    if (isTrades) {
      // viewer is a tradesman — don't fetch shortlist at all
      setRecs([]);
      setRecTotal(0);
      setRecsErr(null);
      return;
    }
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
  }, [api, router.isReady, authLoading, user, project?.id, isTrades]);

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

  /* ===== Discover: load nearby verified tradespeople (SKIPPED for tradesmen) ===== */
  const [nearby, setNearby] = useState<TradesmanLite[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyErr, setNearbyErr] = useState<string | null>(null);

  useEffect(() => {
    // Do not load or show the Discover section for tradesmen
    if (
      !router.isReady ||
      authLoading ||
      !user ||
      !project?.location ||
      isTrades
    ) {
      if (isTrades) {
        // ensure UI stays hidden/empty and no spinners are shown
        setNearby([]);
        setNearbyErr(null);
        setNearbyLoading(false);
      }
      return;
    }
    let killed = false;
    (async () => {
      try {
        setNearbyLoading(true);
        setNearbyErr(null);
        const { data } = await api.get("/api/tradesmen/discover", {
          params: { near: project.location, limit: 6 },
        });
        if (killed) return;
        const items: TradesmanLite[] = Array.isArray(data?.items)
          ? data.items
          : [];
        setNearby(items);
      } catch (e: any) {
        if (killed) return;
        setNearby([]);
        setNearbyErr(null); // stay quiet if endpoint isn’t ready
      } finally {
        if (!killed) setNearbyLoading(false);
      }
    })();
    return () => {
      killed = true;
    };
  }, [api, router.isReady, authLoading, user, project?.location, isTrades]);

  /* ===== Tradesman → Express Interest CTA ===== */
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  // prevent flicker by hiding the button until share status is known
  const [shareCheckDone, setShareCheckDone] = useState(false);

  // Query server to see if this tradesman already shared for this project
  useEffect(() => {
    if (!project?.id) return;

    // If viewer isn't a tradesman, there's nothing to check
    if (!isTrades) {
      setInterestSent(false);
      setShareCheckDone(true);
      return;
    }

    let alive = true;
    setShareCheckDone(false); // hide CTA until we know

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/interest", {
          params: { projectId: project.id },
        });
        if (!alive) return;
        const already =
          !!data?.shared ||
          !!data?.alreadyShared ||
          Number.isFinite(Number(data?.recommendationId));
        setInterestSent(already);
      } catch {
        if (alive) setInterestSent(false); // default to not shared if GET fails
      } finally {
        if (alive) setShareCheckDone(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, isTrades, project?.id]);

  const canExpressInterest =
    !!project &&
    isTrades &&
    !isOwner &&
    !isClosed &&
    isLive &&
    !interestSent &&
    shareCheckDone; // gate on check completion to avoid flicker

  const onExpressInterest = async () => {
    if (!project || interestBusy || interestSent) return;
    setInterestBusy(true);
    try {
      const { data } = await api.post("/api/tradesmen/interest", {
        projectId: project.id,
      });
      if (data?.ok || data?.alreadyShared) {
        setInterestSent(true);
      }
      setFlash({
        kind: "success",
        text: "Thanks! We’ve notified the owner and shared your profile. They can view it from their notifications.",
      });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text:
          e?.response?.data?.error ||
          e?.message ||
          "Failed to notify the project owner",
      });
    } finally {
      setInterestBusy(false);
    }
  };

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
                  href={backHref}
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
            <ProjectHeaderBar
              title={project.name}
              createdAt={project.createdAt}
              backHref={backHref}
              showAddToFavourites={
                isFromCommunity && !isOwner && !isClosed && !addedToFavourites
              }
              onAddToFavourites={onAddToFavourites}
              busy={busy}
            />

            {/* Tradesman CTA: share profile with owner (no flicker) */}
            <div className="mb-4 flex justify-end min-h-[44px]">
              {canExpressInterest && (
                <button
                  className="btn"
                  onClick={onExpressInterest}
                  disabled={interestBusy}
                  data-testid="btn-express-interest"
                >
                  {interestBusy ? "Sending…" : "Share profile with owner"}
                </button>
              )}
            </div>

            {/* Content grid — hide Top recommendations (Shortlist) for tradesmen */}
            <div
              className={`grid gap-6 ${
                isTrades ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12"
              }`}
            >
              {/* Left: details */}
              <ProjectDetailsCard
                project={project}
                isOwner={isOwner}
                isClosed={isClosed}
                isArchived={isArchived}
                isLive={isLive}
                canPublish={canPublish}
                busy={busy}
                flash={flash}
                onPublish={onPublish}
                onArchive={onArchive}
                onUnarchive={onUnarchive}
                onCopyInvite={onCopyInvite}
                onOpenCloseModal={() => setCloseOpen(true)}
                canAddRec={canAddRec}
              />

              {/* Right: shortlist (Top recommendations) — hidden for tradesmen */}
              {!isTrades && (
                <ShortlistSection
                  items={recs || []}
                  total={recTotal}
                  viewMoreHref={`/projects/${project.id}/shortlist`}
                  isOwner={isOwner}
                  canVote={!!user && !!project && !isOwner}
                  votingId={votingId}
                  onVoteUp={(rid) => {
                    const rec = (recs || []).find((x) => x.id === rid);
                    if (rec) voteUpOnce(rec);
                  }}
                  recHasPhotos={recHasPhotos}
                  recVerification={recVerification}
                />
              )}
            </div>

            {/* ===== Discover inline section (hidden for tradesmen) ===== */}
            {!isTrades && nearby.length > 0 && (
              <DiscoverInline location={project?.location} limit={6} />
            )}
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
