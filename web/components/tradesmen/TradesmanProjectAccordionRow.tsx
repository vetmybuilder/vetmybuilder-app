import * as React from "react";
import { useApi } from "@/utils/api";
import ContactDetailsCard from "@/components/project/ContactDetailsCard";
import ShareProfileModal from "@/components/fileUpload/ShareProfileModal";
import PlansModal from "@/components/plans/PlansModal";
import AccordionRow from "@/components/AccordionRow";
import ProjectDetailsSummaryCard from "@/components/project/ProjectDetailsSummaryCard";
import type { PlanId } from "@/shared/lib/plans";
import { useRouter } from "next/router";

/** Shape from tradesman/projects list */
export type ListProject = {
  id: number;
  name: string;
  type: string;
  location: string;
  createdAt: string;

  description?: string;
  propertyType?: string;
  bedrooms?: number;
  status?: "pending" | "live" | "archived" | "completed";
  ownerUserId?: string;
};

/** Full project payload from /api/projects/:id */
type FullProject = {
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

type Flash =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

type Contact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ContactStatus =
  | "unknown"
  | "not_unlocked"
  | "pending_admin_review"
  | "loaded"
  | "error"
  // extended for verification + payment flow
  | "verification_required"
  | "verification_pending"
  | "verification_rejected"
  | "payment_required"
  | "unlock_rejected";

type Props = {
  project: ListProject;
  expanded: boolean;
  onToggle: () => void;
};

export default function TradesmanProjectAccordionRow({
  project,
  expanded,
  onToggle,
}: Props) {
  const api = useApi();
  const router = useRouter();

  // ----- project details -----
  const [fullProject, setFullProject] = React.useState<FullProject | null>(
    null
  );
  const [projLoading, setProjLoading] = React.useState(false);
  const [projErr, setProjErr] = React.useState<string | null>(null);

  // ----- share / interest state -----
  const [shareChecking, setShareChecking] = React.useState(false);
  const [hasShared, setHasShared] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareBusy, setShareBusy] = React.useState(false);
  const [shareFlash, setShareFlash] = React.useState<Flash | null>(null);

  // ----- contact + plans -----
  const [ownerContact, setOwnerContact] = React.useState<Contact | null>(null);
  const [contactLoading, setContactLoading] = React.useState(false);
  const [contactStatus, setContactStatus] =
    React.useState<ContactStatus>("unknown");

  // ensure we only ever call /owner-contact once per row (per page load)
  const hasRequestedContactRef = React.useRef(false);

  const [plansOpen, setPlansOpen] = React.useState(false);
  const [currentPlanId, setCurrentPlanId] = React.useState<PlanId | undefined>(
    "free"
  );

  // Load current plan (for PlansModal badge only)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        if (cancelled) return;
        const livePlan =
          (data?.profile?.plan as PlanId | undefined) ||
          (data?.profile?.planId as PlanId | undefined) ||
          "free";
        setCurrentPlanId(livePlan);
      } catch {
        if (!cancelled) setCurrentPlanId("free");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  // When expanded: load full project details (only once per row)
  React.useEffect(() => {
    if (!expanded) return;
    if (fullProject) {
      // already loaded, don't refetch – avoids flicker on re-open
      return;
    }

    let cancelled = false;
    setProjLoading(true);
    setProjErr(null);

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${project.id}`);
        if (cancelled) return;
        setFullProject(data?.project ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setProjErr(
          e?.response?.data?.error ||
            e?.message ||
            "Failed to load project details"
        );
        setFullProject(null);
      } finally {
        if (!cancelled) setProjLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, project.id, api, fullProject]);

  // When expanded: check if profile already shared for this project (only until true)
  React.useEffect(() => {
    if (!expanded) return;

    // If we already know it's shared, don't keep re-checking
    if (hasShared) {
      setShareChecking(false);
      return;
    }

    let cancelled = false;
    setShareChecking(true);

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/interest", {
          params: { projectId: project.id },
        });
        if (cancelled) return;
        const already =
          !!data &&
          (data.shared === true ||
            data.alreadyShared === true ||
            Number.isFinite(Number(data.recommendationId)));
        setHasShared(already);
      } catch {
        if (!cancelled) setHasShared(false);
      } finally {
        if (!cancelled) setShareChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, project.id, api, hasShared]);

  // When expanded: try to fetch owner contact (server enforces entitlement).
  // We cache the result and hard-stop further requests using a ref.
  React.useEffect(() => {
    if (!expanded) return;

    // If we've already attempted once for this row, don't hammer the endpoint
    if (hasRequestedContactRef.current) {
      setContactLoading(false);
      return;
    }

    let cancelled = false;
    hasRequestedContactRef.current = true;
    setContactLoading(true);

    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${project.id}/owner-contact`
        );
        if (cancelled) return;

        const ok = Boolean(data?.ok);
        const unlocked = Boolean(data?.unlocked);
        const email = data?.email || data?.owner?.email || null;

        if (ok && unlocked && email) {
          // Fully unlocked – we have contact details
          setOwnerContact({
            firstName: data.firstName ?? data?.owner?.firstName ?? null,
            lastName: data.lastName ?? data?.owner?.lastName ?? null,
            email: email,
          });
          setContactStatus("loaded");
        } else {
          // Locked / pending states
          setOwnerContact(null);

          const state = String(data?.state || "").toLowerCase();
          const error = String(data?.error || "").toLowerCase();

          let nextStatus: ContactStatus = "not_unlocked";

          switch (state) {
            case "verification_required":
              nextStatus = "verification_required";
              break;
            case "verification_pending":
              nextStatus = "verification_pending";
              break;
            case "verification_rejected":
              nextStatus = "verification_rejected";
              break;
            case "pending_admin_review":
              nextStatus = "pending_admin_review";
              break;
            case "payment_required":
              nextStatus = "payment_required";
              break;
            case "unlock_rejected":
              nextStatus = "unlock_rejected";
              break;
            case "no_entitlement":
            case "project_not_live":
            case "owner_cannot_request_own_contact":
              nextStatus = "not_unlocked";
              break;
            default: {
              if (
                error === "verification_required" ||
                error === "verification_pending" ||
                error === "verification_rejected"
              ) {
                nextStatus = error as ContactStatus;
              } else if (error === "payment_required") {
                nextStatus = "payment_required";
              } else if (error === "pending_admin_review") {
                nextStatus = "pending_admin_review";
              } else if (error === "unlock_rejected") {
                nextStatus = "unlock_rejected";
              } else if (error === "not_unlocked" || !error) {
                nextStatus = "not_unlocked";
              } else {
                nextStatus = "error";
              }
            }
          }

          setContactStatus(nextStatus);
        }
      } catch (e: any) {
        if (cancelled) return;

        setOwnerContact(null);
        setContactStatus("error");
        // eslint-disable-next-line no-console
        console.warn(
          "[TradesmanProjectAccordionRow] owner-contact failed:",
          e?.response?.data || e?.message || e
        );
      } finally {
        if (!cancelled) setContactLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expanded, project.id, api]);

  // ----- share submit -----
  const defaultShareSubmit = async (files: File[]) => {
    const fd = new FormData();
    const pid = String(project.id);
    fd.append("projectId", pid);
    fd.append("pid", pid);
    (files || []).forEach((f) => fd.append("photos", f)); // photos[]

    await api.post("/api/tradesmen/shares", fd);
  };

  const handleShareSubmit = async (files: File[]) => {
    setShareFlash(null);
    setShareBusy(true);
    try {
      await defaultShareSubmit(files);
      setShareOpen(false);
      setHasShared(true);
      setShareFlash({
        kind: "success",
        text: "Profile shared. We’ve notified the homeowner.",
      });
      window.setTimeout(() => setShareFlash(null), 5000);
    } catch (e: any) {
      setShareFlash({
        kind: "error",
        text:
          e?.response?.data?.error ||
          e?.message ||
          "Failed to share profile. Please try again.",
      });
      window.setTimeout(() => setShareFlash(null), 6000);
    } finally {
      setShareBusy(false);
    }
  };

  const effectiveProject = (fullProject || project) as
    | FullProject
    | ListProject;

  const propType =
    (effectiveProject as any).propertyType || (project.propertyType ?? "—");
  const bedrooms =
    (effectiveProject as any).bedrooms ??
    (typeof project.bedrooms === "number" ? project.bedrooms : "—");
  const status = (effectiveProject as any).status || (project.status ?? "live");
  const descriptionRaw =
    "description" in effectiveProject &&
    (effectiveProject as any).description &&
    String((effectiveProject as any).description).trim().length > 0
      ? (effectiveProject as any).description
      : "No description provided.";

  const summaryProject = {
    id: effectiveProject.id,
    type: effectiveProject.type,
    location: effectiveProject.location,
    propertyType: propType,
    bedrooms,
    status,
    createdAt: effectiveProject.createdAt,
    description: descriptionRaw,
  };

  // ----- Upgrade / CTA handler -----
  const handleUpgradeClick = () => {
    // If verification is not approved yet, send them to manage profile
    if (
      contactStatus === "verification_required" ||
      contactStatus === "verification_rejected" ||
      contactStatus === "verification_pending"
    ) {
      router.push("/tradesman/register");
      return;
    }

    // Otherwise, they're verified and we can show plans/payment
    setPlansOpen(true);
  };

  return (
    <AccordionRow
      expanded={expanded}
      onToggle={onToggle}
      testId="project-row"
      header={
        <>
          <div className="text-sm font-medium text-slate-900">
            {project.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              {project.type}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              {project.location}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              Created: {new Date(project.createdAt).toLocaleDateString("en-GB")}
            </span>
          </div>
        </>
      }
    >
      {/* share banners */}
      {shareFlash && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            shareFlash.kind === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
          data-testid="share-flash-inline"
        >
          {shareFlash.text}
        </div>
      )}

      {!shareFlash && hasShared && (
        <div
          className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
          data-testid="share-already-banner-inline"
        >
          ✓ Your profile has already been shared.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        {/* Project details: loading / error / card */}
        <div>
          {projLoading ? (
            <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="space-y-3 text-sm text-slate-500">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              </div>
            </section>
          ) : projErr ? (
            <section className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
              <p className="text-sm text-red-700">{projErr}</p>
            </section>
          ) : (
            <ProjectDetailsSummaryCard
              project={summaryProject}
              headerAction={
                !hasShared && (
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    disabled={shareBusy || shareChecking}
                    aria-busy={shareBusy || shareChecking}
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900/90 disabled:opacity-60"
                    data-testid="btn-express-interest-inline"
                  >
                    {shareBusy || shareChecking
                      ? "Sending…"
                      : "Express interest"}
                  </button>
                )
              }
            />
          )}
        </div>

        {/* Contact details card */}
        <ContactDetailsCard
          locked={contactStatus !== "loaded"}
          loading={contactLoading}
          contact={ownerContact || undefined}
          onUpgrade={handleUpgradeClick}
          title="Homeowner contact"
          status={contactStatus}
        />
      </div>

      {/* Share modal */}
      {shareOpen && !hasShared && (
        <ShareProfileModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onSubmit={handleShareSubmit}
        />
      )}

      {/* Plans modal for Upgrade */}
      <PlansModal
        isOpen={plansOpen}
        onClose={() => setPlansOpen(false)}
        currentPlanId={currentPlanId}
        projectId={project.id}
      />
    </AccordionRow>
  );
}
