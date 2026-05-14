import * as React from "react";
import { useMemo, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";
import { useApi } from "@/utils/api";
import CloseProjectModal from "@/components/CloseProjectModal";
import PlansModal from "@/components/plans/PlansModal";
import { getPlan } from "@/shared/lib/plans";
import type { PlanId } from "@/shared/lib/plans";

export type Project = {
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

export type Recommendation = {
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
  source?: string | null;
  linked_tradesman_uid?: string | null;
  tradesmanPublicId?: string | null;
  companyEmail?: string | null;
};

export type Flash =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

export function useProjectView() {
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

  const [project, setProject] = useState<Project | null>(null);
  const [classification, setClassification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  const [isTrades, setIsTrades] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<PlanId>("free");
  const [subStatus, setSubStatus] = useState<"inactive" | "draft" | "active">(
    "inactive"
  );
  const [pendingPlanId, setPendingPlanId] = useState<PlanId | null>(null);

  const [contactUnlocked, setContactUnlocked] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [ownerContact, setOwnerContact] = useState<{
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null>(null);
  const [contactLoading, setContactLoading] = useState(false);

  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recTotal, setRecTotal] = useState(0);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  const [interestBusy, setInterestBusy] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [shareCheckDone, setShareCheckDone] = useState(false);

  const [copyingInvite, setCopyingInvite] = useState(false);

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
          data?.profile?.subscription_status ||
          data?.profile?.subscriptionStatus ||
          "inactive";

        const livePlan = data?.profile?.plan || data?.profile?.planId || "free";

        const pending =
          data?.profile?.purchased_plan || data?.profile?.purchasedPlan || null;

        if (alive) {
          setIsTrades(role === "tradesman" || hasProfile);
          setSubStatus(status);
          setCurrentPlanId(livePlan);
          setPendingPlanId(pending);
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

  useEffect(() => {
    if (!router.isReady || authLoading) return;
    if (!projectId) {
      setErrorStatus(404);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setErrorStatus(null);
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}`);
        if (!alive) return;
        setProject(data.project);
        setClassification(data.classification || null);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status ?? 500;
        setErrorStatus(status);
        setProject(null);
        setClassification(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, projectId, router.isReady, authLoading, user?.uid]);

  const isOwner = !!(user && project && user.uid === project?.ownerUserId);
  const statusLower = (project?.status || "").toLowerCase();
  const isArchived = statusLower === "archived";
  const isCompleted = statusLower === "completed";
  const isClosed = isArchived || isCompleted;
  const isLive = statusLower === "live";
  const canPublish = isOwner && !isClosed && !isLive;

  const backHref = isTrades
    ? "/tradesman/jobs"
    : `/projects${sourceTab ? `?tab=${sourceTab}` : ""}`;

  const [recsRefreshKey, setRecsRefreshKey] = useState(0);
  const refreshRecs = useCallback(() => setRecsRefreshKey((k) => k + 1), []);

  useEffect(() => {
    // Guests (no user) can't fetch recommendations — skip to avoid 401/404
    if (!project?.id || isTrades || !user) return;
    let dead = false;
    const go = async () => {
      setRecsErr(null);
      try {
        const r1 = await api.get(
          `/api/projects/${project.id}/recommendations`,
          { params: { limit: 50 } }
        );
        if (dead) return;
        const list: Recommendation[] =
          r1.data?.items || r1.data?.recommendations || r1.data || [];
        const total = r1.data?.total || r1.data?.count || list.length;
        setRecs(list);
        setRecTotal(total);
      } catch (e1) {
        try {
          const r2 = await api.get(`/api/recommendations`, {
            params: { projectId: project.id, limit: 50 },
          });
          if (dead) return;
          const list: Recommendation[] =
            r2.data?.items || r2.data?.recommendations || r2.data || [];
          const total = r2.data?.total || r2.data?.count || list.length;
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
    go();
    return () => {
      dead = true;
    };
  }, [api, project?.id, isTrades, recsRefreshKey]);

  // Listen for real-time recommendation notifications via SSE
  useEffect(() => {
    if (!project?.id || isTrades) return;
    if (typeof window === "undefined") return;

    const sseBase = (() => {
      const loc = window.location;
      if (loc.hostname === "localhost" && loc.port === "3000") {
        return `${loc.protocol}//localhost:3100`;
      }
      return loc.origin;
    })();

    const onNotif = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data) return;
      if (
        data.projectId === project.id &&
        (data.type === "recommendation_new" || data.type === "tradesman_shared_profile")
      ) {
        refreshRecs();
      }
      // Auto-update insights card when classification completes
      if (data.projectId === project.id && data.type === "classification_ready") {
        api.get(`/api/projects/${project.id}`).then(({ data: d }) => {
          if (d?.classification) setClassification(d.classification);
        }).catch(() => {});
      }
    };

    window.addEventListener("vmb:notification", onNotif);
    return () => window.removeEventListener("vmb:notification", onNotif);
  }, [project?.id, isTrades, refreshRecs, api]);

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
      setFlash({
        kind: "success",
        text: "Project unarchived",
      });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text: e?.response?.data?.error || e?.message || "Failed to unarchive",
      });
    } finally {
      setBusy(false);
    }
  };

  const doCloseSubmit = async (payload: {
    didGoAhead: boolean;
    reasons: string[];
    otherReason?: string;
    selectedRecommendationId?: number;
    winnerFromCommunity?: boolean;
  }) => {
    if (!project || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(
        `/api/projects/${project.id}/close`,
        payload
      );
      const updated: Project = data?.project ?? project;
      setCloseOpen(false);
      // Navigate away from the now-closed project before flipping vm
      // state. Archived AND completed projects are both invisible to
      // the homeowner now (post-CR3 the completed tab is retired), so
      // drop them back on the main /projects list in either case.
      if (updated.status === "archived" || updated.status === "completed") {
        router.replace("/projects");
        return;
      }
      setProject(updated);
      setFlash({
        kind: "success",
        text: "Project updated",
      });
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

  const onUpgradeClick = () => {
    if (!paymentsEnabled) {
      setFlash({ kind: "success", text: "Contact access is free during our launch period." });
      return;
    }
    setPlansOpen(true);
  };

  const startOneOffCheckout = async () => {
    if (!project?.id) return;
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
            price: { amount: pence, currency: "GBP" },
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
      if (url) window.location.href = url;
      else if (sid)
        window.location.href = `/payments/mock/checkout/${encodeURIComponent(
          sid
        )}`;
      else
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
      });
      const url =
        data?.url || data?.session?.hosted_url || data?.hosted_url || null;
      const sid =
        data?.sessionId ||
        data?.session_id ||
        data?.id ||
        data?.session?.id ||
        null;
      if (url) window.location.href = url;
      else if (sid)
        window.location.href = `/payments/mock/checkout/${encodeURIComponent(
          sid
        )}`;
      else
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

  const handlePlanSelect = (planId: PlanId) => {
    setPlansOpen(false);
    if (planId === "free") {
      setFlash({
        kind: "error",
        text: "Free plan selected — upgrade to contact owners directly.",
      });
      return;
    }
    if (planId === "unlock_contact") void startOneOffCheckout();
    else void startSubscriptionCheckout(planId);
  };

  const unlockQuery = String((router.query.unlock || "") as string);

  const paymentsEnabled =
    process.env.NEXT_PUBLIC_ENABLE_PAYMENTS === "true";

  const entitledToContact = paymentsEnabled
    ? !!project &&
      isTrades &&
      !isOwner &&
      !isClosed &&
      isLive &&
      subStatus === "active" &&
      currentPlanId !== "free"
    : !!project && isTrades && !isOwner && !isClosed && isLive;

  const canAttemptContact =
    !!project &&
    isTrades &&
    !isOwner &&
    isLive &&
    !isClosed &&
    (entitledToContact || unlockQuery === "success");

  useEffect(() => {
    (async () => {
      if (!project?.id) return;

      if (!canAttemptContact) {
        setContactUnlocked(false);
        setContactError("not_unlocked");
        setOwnerContact(null);
        return;
      }

      setContactLoading(true);
      setContactUnlocked(false);
      setContactError(null);

      try {
        const { data } = await api.get(
          `/api/projects/${project.id}/contact-details`
        );

        setContactUnlocked(!!data?.unlocked);
        setContactError(data?.error ?? null);

        if (data?.unlocked && data?.owner) {
          setOwnerContact({
            firstName: data.owner.firstName ?? null,
            lastName: data.owner.lastName ?? null,
            email: data.owner.email ?? null,
          });
        } else {
          setOwnerContact(null);
        }
      } catch (e: any) {
        setContactUnlocked(false);
        setContactError("error");
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

  const copyInvite = async () => {
    if (!project || copyingInvite) return;
    setCopyingInvite(true);
    try {
      let inviteUrl: string | null = null;
      try {
        const { data } = await api.get(
          `/api/projects/${project.id}/invite-link`
        );
        inviteUrl =
          data?.url || data?.inviteUrl || data?.invite || data?.link || null;
      } catch {}
      if (!inviteUrl)
        inviteUrl = `${window.location.origin}/projects/${project.id}/recommend`;

      const ok = await (async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(inviteUrl!);
            return true;
          }
        } catch {}
        try {
          const el = document.createElement("textarea");
          el.value = inviteUrl!;
          el.setAttribute("readonly", "");
          el.style.position = "absolute";
          el.style.left = "-9999px";
          document.body.appendChild(el);
          el.select();
          const ok2 = document.execCommand("copy");
          document.body.removeChild(el);
          return ok2;
        } catch {
          return false;
        }
      })();

      if (!ok) throw new Error("Clipboard not available");
      setFlash({
        kind: "success",
        text: "Invite link copied. Share it with friends to collect recommendations.",
      });
    } catch (e: any) {
      setFlash({
        kind: "error",
        text: e?.message || "Couldn’t copy invite link. Please try again.",
      });
    } finally {
      setCopyingInvite(false);
    }
  };

  const loadingUi =
    authLoading || (router.isReady && loading) ? (
      <p className="py-10 text-sm text-slate-500" data-testid="project-loading">
        Loading…
      </p>
    ) : null;

  const closeProjectModal = (
    <CloseProjectModal
      open={closeOpen}
      onClose={() => setCloseOpen(false)}
      onSubmit={doCloseSubmit}
      projectName={project?.name}
      projectId={project?.id as number}
    />
  );

  const plansModal = (
    <PlansModal
      isOpen={plansOpen}
      onClose={() => setPlansOpen(false)}
      currentPlanId={currentPlanId}
      projectId={project?.id ?? undefined}
    />
  );

  return {
    project,
    classification,
    loading,
    errorStatus,
    flash,
    setFlash,
    busy,
    isOwner,
    isTrades,
    isLive,
    isClosed,
    isArchived,
    isCompleted,
    canPublish,
    backHref,
    currentPlanId,
    subStatus,
    pendingPlanId,
    recs,
    recTotal,
    recsErr,
    refreshRecs,
    ownerContact,
    contactLoading,
    contactUnlocked,
    contactError,
    interestBusy,
    interestSent,
    shareCheckDone,
    onPublish,
    onArchive,
    onUnarchive,
    onCloseProject: () => setCloseOpen(true),
    doCloseSubmit,
    copyInvite,
    copyingInvite,
    onUpgradeClick,
    startOneOffCheckout,
    startSubscriptionCheckout,
    handlePlanSelect,
    loadingUi,
    closeProjectModal,
    plansModal,
  };
}
