import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useEffect, useMemo, useState } from "react";
import CloseProjectModal from "@/components/CloseProjectModal";
import { voteUpRecommendation } from "@/utils/vmb";
import ShortlistSection from "@/components/project/ShortlistSection";
import ProjectDetailsCard from "@/components/project/ProjectDetailsCard";
import ProjectHeaderBar from "@/components/project/ProjectHeaderBar";
import ContactDetailsCard from "@/components/project/ContactDetailsCard";

import PlansModal from "@/components/plans/PlansModal";
import { getPlan } from "@/shared/lib/plans";
import type { PlanId } from "@/shared/lib/plans";

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
  likes?: number;
  myLike?: 0 | 1;
  score?: number;
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

  /* ===== Detect if viewer is a tradesman & plan state ===== */
  const [isTrades, setIsTrades] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<PlanId | undefined>(
    "free"
  );
  const [subStatus, setSubStatus] = useState<
    "inactive" | "draft" | "active" | undefined
  >("inactive");
  const [pendingPlanId, setPendingPlanId] = useState<PlanId | null>(null);
  const effectivePlanId: PlanId =
    subStatus === "active" ? currentPlanId || "free" : "free";

  // Owner contact (revealed only when eligible)
  const [ownerContact, setOwnerContact] = useState<{
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null>(null);
  const [contactLoading, setContactLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) {
        if (alive) {
          setIsTrades(false);
          setCurrentPlanId("free");
          setSubStatus("inactive");
          setPendingPlanId(null);
        }
        return;
      }
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const role = String(data?.role || "").toLowerCase();
        const hasProfile = !!data?.profile;

        const status =
          (data?.profile?.subscription_status as
            | "inactive"
            | "draft"
            | "active"
            | undefined) ||
          (data?.profile?.subscriptionStatus as
            | "inactive"
            | "draft"
            | "active"
            | undefined);

        const livePlan =
          (data?.profile?.plan as PlanId | undefined) ||
          (data?.profile?.planId as PlanId | undefined) ||
          "free";

        const pending =
          (data?.profile?.purchased_plan as PlanId | undefined) ||
          (data?.profile?.purchasedPlan as PlanId | undefined) ||
          null;

        if (alive) {
          setIsTrades(role === "tradesman" || hasProfile);
          setSubStatus(status || "inactive");
          setCurrentPlanId((livePlan as PlanId) || "free");
          setPendingPlanId((pending as PlanId) || null);
        }
      } catch {
        if (alive) {
          setIsTrades(false);
          setCurrentPlanId("free");
          setSubStatus("inactive");
          setPendingPlanId(null);
        }
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

  useEffect(() => {
    setCanAddRec(Boolean(project && isOwner && !isClosed));
  }, [project, isOwner, isClosed]);

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

  // Close modal handler
  const onCloseProject = async (payload: {
    didGoAhead: boolean;
    reasons: string[];
    otherReason?: string;
    selectedRecommendationId?: number;
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

  /* ===== Tradesman → Share & Contact logic ===== */
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [shareCheckDone, setShareCheckDone] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  // One-off checkout state
  const [checkingOut, setCheckingOut] = useState(false);

  // Updated to use plans price (£9.99) if present
  const startOneOffCheckout = async () => {
    if (!project?.id || checkingOut) return;
    setCheckingOut(true);
    try {
      const origin = window.location.origin;

      const unlock = getPlan("unlock_contact");
      const pounds = Number((unlock as any)?.billing?.priceOnce ?? 9.99);
      const pence = Math.round(pounds * 100);

      const { data } = await api.post("/api/payments/checkout", {
        projectId: project.id,
        entity_type: "project",
        entity_id: project.id,
        items: [
          {
            label: "Unlock homeowner contact",
            price: { amount: pence, currency: "GBP" }, // £9.99
            quantity: 1,
          },
        ],
        metadata: { type: "unlock_contact", projectId: project.id },
        success_url: `${origin}/payments/mock/success?session_id={SESSION_ID}`,
        cancel_url: `${origin}/payments/mock/cancel?session_id={SESSION_ID}`,
      });

      const url =
        data?.url || data?.session?.hosted_url || data?.hosted_url || null;
      const sid =
        data?.sessionId ||
        data?.session_id ||
        data?.id ||
        data?.session?.id ||
        null;

      if (url) {
        window.location.href = url;
        return;
      }
      if (sid) {
        window.location.href = `/payments/mock/checkout/${encodeURIComponent(
          sid
        )}`;
        return;
      }

      setFlash({
        kind: "error",
        text: "Checkout session unavailable. Please try again.",
      });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text:
          e?.response?.data?.error ||
          e?.message ||
          "Failed to start checkout session",
      });
    } finally {
      setCheckingOut(false);
    }
  };

  const startSubscriptionCheckout = async (planId: PlanId) => {
    try {
      const plan = getPlan(planId);
      const monthly = Number((plan as any)?.billing?.priceMonthly) || 0;
      const amountPence = Math.round(monthly * 100);
      if (!amountPence || amountPence <= 0) {
        setFlash({ kind: "error", text: "Plan price unavailable." });
        return;
      }

      const { data } = await api.post("/api/payments/checkout", {
        type: "subscription",
        planId,
        amountPence,
        currency: "GBP",
        origin: window.location.origin,
        metadata: { planId, billing: "monthly" },
        success_url: `${window.location.origin}/payments/mock/success?session_id={SESSION_ID}`,
        cancel_url: `${window.location.origin}/payments/mock/cancel?session_id={SESSION_ID}`,
      });

      const url =
        data?.url || data?.session?.hosted_url || data?.hosted_url || null;
      const sid =
        data?.sessionId ||
        data?.session_id ||
        data?.id ||
        data?.session?.id ||
        null;

      if (url) {
        window.location.href = url;
        return;
      }
      if (sid) {
        window.location.href = `/payments/mock/checkout/${encodeURIComponent(
          sid
        )}`;
        return;
      }

      setFlash({
        kind: "error",
        text: "Could not start subscription checkout. Please try again.",
      });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text:
          e?.response?.data?.error ||
          e?.message ||
          "Failed to start subscription checkout",
      });
    }
  };

  // Check if already shared for this project
  useEffect(() => {
    if (!project?.id) return;
    if (!isTrades) {
      setInterestSent(false);
      setShareCheckDone(true);
      return;
    }
    let alive = true;
    setShareCheckDone(false);
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
        if (alive) setInterestSent(false);
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
    effectivePlanId === "free" &&
    !interestSent &&
    shareCheckDone;

  const entitledToContact =
    !!project &&
    isTrades &&
    !isOwner &&
    !isClosed &&
    isLive &&
    subStatus === "active" &&
    currentPlanId !== "free";

  const unlockQuery = String(router.query.unlock || ""); // ?unlock=success
  const canAttemptContact =
    !!project &&
    isTrades &&
    !isOwner &&
    isLive &&
    !isClosed &&
    (entitledToContact || unlockQuery === "success");

  useEffect(() => {
    (async () => {
      if (!project?.id || !canAttemptContact) return;
      setContactLoading(true);
      try {
        const { data } = await api.get(
          `/api/projects/${project.id}/owner-contact`
        );
        const owner = data?.owner || data || {};
        setOwnerContact({
          firstName: owner.firstName ?? null,
          lastName: owner.lastName ?? null,
          email: owner.email ?? null,
        });
      } catch (e: any) {
        const status = e?.response?.status ?? e?.status;
        if (status !== 403) {
          setFlash({
            kind: "error",
            text:
              e?.response?.data?.error ||
              e?.message ||
              "Failed to load contact",
          });
        }
        setOwnerContact(null);
      } finally {
        setContactLoading(false);
      }
    })();
  }, [api, project?.id, canAttemptContact, unlockQuery]);

  const onExpressInterest = async () => {
    if (!project || interestBusy || interestSent) return;
    setInterestBusy(true);
    try {
      const { data } = await api.post("/api/tradesmen/interest", {
        projectId: project.id,
      });
      if (data?.ok || data?.alreadyShared) setInterestSent(true);
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

  const onUpgradeClick = () => setPlansOpen(true);

  // Plan selected from modal (free uses this path; paid plans usually checkout inside the modal)
  const handlePlanSelect = (planId: PlanId) => {
    setPlansOpen(false);
    if (planId === "free") {
      setFlash({
        kind: "error",
        text: "Free plan selected — upgrade to contact owners directly.",
      });
      return;
    }
    // If your modal ever calls onSelect for paid plans, keep safety:
    if (planId === "unlock_contact") {
      void startOneOffCheckout();
    } else {
      void startSubscriptionCheckout(planId);
    }
  };

  /* ===== Shortlist loader (for owners & non-trades viewers) ===== */
  useEffect(() => {
    if (!project?.id || isTrades) return;
    let dead = false;

    const fetchShortlist = async () => {
      setRecsErr(null);
      try {
        const r1 = await api.get(
          `/api/projects/${project.id}/recommendations`,
          { params: { limit: 6 } }
        );
        if (dead) return;
        const list: Recommendation[] = Array.isArray(r1.data?.items)
          ? r1.data.items
          : Array.isArray(r1.data?.recommendations)
          ? r1.data.recommendations
          : Array.isArray(r1.data)
          ? r1.data
          : [];
        const total =
          Number(r1.data?.total) ||
          Number(r1.data?.count) ||
          (Array.isArray(list) ? list.length : 0);
        setRecs(list);
        setRecTotal(total);
        return;
      } catch (e1: any) {
        try {
          const r2 = await api.get(`/api/recommendations`, {
            params: { projectId: project.id, limit: 6 },
          });
          if (dead) return;
          const list: Recommendation[] = Array.isArray(r2.data?.items)
            ? r2.data.items
            : Array.isArray(r2.data?.recommendations)
            ? r2.data.recommendations
            : Array.isArray(r2.data)
            ? r2.data
            : [];
          const total =
            Number(r2.data?.total) ||
            Number(r2.data?.count) ||
            (Array.isArray(list) ? list.length : 0);
          setRecs(list);
          setRecTotal(total);
        } catch (e2: any) {
          if (dead) return;
          setRecs([]);
          setRecTotal(0);
          setRecsErr(
            e2?.response?.data?.error ||
              e2?.message ||
              "Failed to load recommendations"
          );
        }
      }
    };

    fetchShortlist();
    return () => {
      dead = true;
    };
  }, [api, project?.id, isTrades]);

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

        {!loading && !errorStatus && project && (
          <>
            <ProjectHeaderBar
              title={project.name}
              createdAt={project.createdAt}
              backHref={backHref}
              showAddToFavourites={
                isFromCommunity && !isOwner && !isClosed && !addedToFavourites
              }
              onAddToFavourites={() => setAddedToFavourites(true)}
              busy={busy}
            />

            {isTrades && subStatus === "draft" && pendingPlanId && (
              <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Your {pendingPlanId} subscription is pending verification.
                You’ll get access once it’s approved.
              </div>
            )}

            <div className="grid gap-6 grid-cols-1 lg:[grid-template-columns:580px_minmax(0,1fr)]">
              <div>
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
                  onCopyInvite={() => {}}
                  onOpenCloseModal={() => setCloseOpen(true)}
                  canAddRec={canAddRec}
                  footerRight={
                    isTrades && canExpressInterest ? (
                      <div
                        className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 text-sm"
                        data-testid="share-profile-cta"
                      >
                        <p className="text-slate-700">
                          Let the homeowner know you’re interested. We’ll share
                          your VetMyBuilder profile on this project so they can
                          review your work and get in touch.
                        </p>
                        <button
                          className="btn"
                          onClick={onExpressInterest}
                          disabled={interestBusy}
                          data-testid="btn-express-interest"
                        >
                          {interestBusy ? "Sending…" : "Share profile"}
                        </button>
                        <p
                          className="text-xs text-slate-500"
                          data-testid="share-profile-tip"
                        >
                          Tip: Add photos and complete verifications to improve
                          your chances.
                        </p>
                      </div>
                    ) : null
                  }
                />
              </div>

              <div>
                {isTrades ? (
                  <ContactDetailsCard
                    locked={!ownerContact}
                    loading={contactLoading}
                    contact={ownerContact || undefined}
                    onUpgrade={onUpgradeClick}
                  />
                ) : (
                  <ShortlistSection
                    items={recs || []}
                    total={recTotal}
                    viewMoreHref={`/projects/${project.id}/shortlist`}
                    isOwner={isOwner}
                    canVote={!!user && !!project && !isOwner}
                    votingId={votingId}
                    onVoteUp={async (rid) => {
                      const rec = (recs || []).find((x) => x.id === rid);
                      if (rec) await voteUpRecommendation(api, rec.id);
                    }}
                    recHasPhotos={recHasPhotos}
                    recVerification={recVerification}
                  />
                )}

                {!isTrades && recsErr && (
                  <p className="mt-2 text-sm text-rose-600">{recsErr}</p>
                )}
              </div>
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

      <PlansModal
        isOpen={plansOpen}
        onClose={() => setPlansOpen(false)}
        onSelect={handlePlanSelect}
        currentPlanId={currentPlanId}
        projectId={project?.id as number}
      />
    </AuthedOnly>
  );
}
