// web/components/tradesmen/TradesmanProjectAccordionRow.tsx
import * as React from "react";
import { useApi } from "@/utils/api";
import ContactDetailsCard from "@/components/project/ContactDetailsCard";
import ShareProfileModal from "@/components/fileUpload/ShareProfileModal";
import StatusBadge from "@/components/StatusBadge";
import PlansModal from "@/components/plans/PlansModal";
import AccordionRow from "@/components/AccordionRow";
import type { PlanId } from "@/shared/lib/plans";

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
  | "error";

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
    // again – just reuse the previous state (loaded / locked / pending / error).
    if (hasRequestedContactRef.current) {
      setContactLoading(false);
      return;
    }

    let cancelled = false;
    hasRequestedContactRef.current = true; // mark as attempted
    setContactLoading(true);

    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${project.id}/owner-contact`
        );
        if (cancelled) return;

        const owner = data?.owner || data || {};
        setOwnerContact({
          firstName: owner.firstName ?? null,
          lastName: owner.lastName ?? null,
          email: owner.email ?? null,
        });
        setContactStatus("loaded");
      } catch (e: any) {
        if (cancelled) return;
        const status = e?.response?.status ?? e?.status;
        const code = e?.response?.data?.error;

        if (status === 403) {
          if (code === "pending_admin_review") {
            setContactStatus("pending_admin_review");
          } else if (code === "not_unlocked") {
            setContactStatus("not_unlocked");
          } else {
            setContactStatus("error");
          }
        } else {
          setContactStatus("error");
          // eslint-disable-next-line no-console
          console.warn(
            "[TradesmanProjectAccordionRow] owner-contact failed:",
            e?.response?.data || e?.message || e
          );
        }

        setOwnerContact(null);
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

  const createdLabel = new Date(effectiveProject.createdAt).toLocaleString();

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

  const descriptionSections = parseDescriptionSections(descriptionRaw);

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
        {/* Project details – richer styling */}
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          {/* Header row */}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Project details
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Summary of this homeowner’s job.
              </p>
            </div>

            {/* Express interest button (only if not already shared) */}
            {!hasShared && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                disabled={shareBusy || shareChecking}
                aria-busy={shareBusy || shareChecking}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900/90 disabled:opacity-60"
                data-testid="btn-express-interest-inline"
              >
                {shareBusy || shareChecking ? "Sending…" : "Express interest"}
              </button>
            )}
          </div>

          {/* Loading / error */}
          {projLoading ? (
            <div className="space-y-3 text-sm text-slate-500">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            </div>
          ) : projErr ? (
            <p className="text-sm text-red-600">{projErr}</p>
          ) : (
            <>
              {/* Badges row */}
              <div
                className="mb-3 flex flex-wrap gap-2 text-xs"
                data-testid="project-badges-inline"
              >
                <span className="badge blue">{effectiveProject.type}</span>
                <span className="badge gray">{effectiveProject.location}</span>
                <span className="badge orange capitalize">{propType}</span>
                <span className="badge green">
                  {bedrooms} bed{bedrooms === 1 ? "" : ""}
                </span>
                <span>
                  <StatusBadge value={status as any} />
                </span>
              </div>

              {/* Spec grid */}
              <dl className="grid grid-cols-1 gap-y-3 gap-x-10 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Type
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {effectiveProject.type || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Location
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {effectiveProject.location || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Property
                  </dt>
                  <dd className="mt-0.5 font-medium capitalize">{propType}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Bedrooms
                  </dt>
                  <dd className="mt-0.5 font-medium">{bedrooms}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Status
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    <StatusBadge value={status as any} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Created
                  </dt>
                  <dd className="mt-0.5 font-medium">{createdLabel}</dd>
                </div>
              </dl>

              {/* Description block */}
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
                <h4 className="mb-1 text-sm font-semibold text-slate-900">
                  Description
                </h4>

                {descriptionSections.length <= 1 ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {descriptionRaw}
                  </p>
                ) : (
                  <dl className="mt-2 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                    {descriptionSections.map((sec) => (
                      <div key={sec.label}>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {sec.label}
                        </dt>
                        <dd className="mt-0.5 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                          {sec.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </>
          )}
        </section>

        {/* Contact details card */}
        <ContactDetailsCard
          locked={contactStatus !== "loaded"}
          loading={contactLoading}
          contact={ownerContact || undefined}
          onUpgrade={() => setPlansOpen(true)}
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

/**
 * Parse a free-text description into labelled sections.
 * Looks for patterns like "Timeframe: … Budget: … Access: …"
 * and returns [{ label, value }, …].
 * Falls back gracefully if there are no "Label:" pairs.
 */
function parseDescriptionSections(
  desc: string
): { label: string; value: string }[] {
  const clean = (desc || "").trim();
  if (!clean || clean === "No description provided.") return [];

  const sections: { label: string; value: string }[] = [];
  const re =
    /([A-Za-z][A-Za-z0-9 /&()-]*):\s*([\s\S]*?)(?=(?:[A-Za-z][A-Za-z0-9 /&()-]*:\s)|$)/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(clean)) !== null) {
    const label = match[1]?.trim();
    let value = (match[2] || "").trim();
    // Strip leading dash/bullet if present
    value = value.replace(/^[-–•]\s*/, "");
    if (!label || !value) continue;
    sections.push({ label, value });
  }

  return sections;
}
