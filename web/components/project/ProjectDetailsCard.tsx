import * as React from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { useApi } from "@/utils/api";
import ShareProfileModal from "@/components/fileUpload/ShareProfileModal";
import type { ReactNode } from "react";

/* Keep this in sync with your page type */
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

export type Flash =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

type Props = {
  project: Project;

  // ownership / state
  isOwner: boolean;
  isClosed: boolean;
  isArchived: boolean;
  isLive: boolean;
  canPublish: boolean;

  // ui flags
  busy?: boolean;
  flash?: Flash | null;

  // actions
  onPublish?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onCopyInvite?: () => void;
  onOpenCloseModal?: () => void;

  // recommendation affordance
  canAddRec?: boolean;

  // extra actions rendered in the card footer (right-aligned)
  footerRight?: ReactNode;

  // Share button (for tradesmen)
  showShareButton?: boolean;
  shareBusy?: boolean;

  // Optional override for share submit (parent-managed)
  onShareSubmit?: (files: File[]) => Promise<void> | void;

  // Payment gating: blur job details for non-recommended tradespeople
  gated?: boolean;
  onUnlockJob?: () => void;
  unlockPrice?: string;
};

export default function ProjectDetailsCard({
  project,
  isOwner,
  isClosed,
  isArchived,
  isLive,
  canPublish,
  busy = false,
  flash = null,
  onPublish,
  onArchive,
  onUnarchive,
  onCopyInvite,
  onOpenCloseModal,
  canAddRec = false,
  footerRight,
  showShareButton = false,
  shareBusy = false,
  onShareSubmit,
  gated = false,
  onUnlockJob,
  unlockPrice = "14.99",
}: Props) {
  const api = useApi();

  // Local state (share flow)
  const [shareOpen, setShareOpen] = React.useState(false);
  const [localBusy, setLocalBusy] = React.useState(false);
  const [localFlash, setLocalFlash] = React.useState<Flash | null>(null);

  // Source-of-truth from API on whether a share already exists
  const [hasSharedFromApi, setHasSharedFromApi] = React.useState(false);
  const [checkingShared, setCheckingShared] = React.useState(false);

  // True only for this session after a successful submit.
  // Used to suppress the "already submitted" banner immediately after sharing.
  const [justShared, setJustShared] = React.useState(false);

  const effectiveBusy = shareBusy || localBusy;

  // Always check for tradesmen (non-owners) regardless of showShareButton flag
  React.useEffect(() => {
    let alive = true;
    if (isOwner) return; // owners skip the check

    setCheckingShared(true);
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/interest", {
          params: { projectId: project.id },
        });

        if (!alive) return;

        // Treat explicit shared=true OR numeric shareId as already-shared
        const already =
          !!data &&
          (data.shared === true || Number.isFinite(Number(data.shareId)));

        setHasSharedFromApi(already);
      } catch {
        if (alive) setHasSharedFromApi(false);
      } finally {
        if (alive) setCheckingShared(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, project.id, isOwner]);

  // IMPORTANT: let the browser set Content-Type (for boundary). Also append pid as fallback.
  const defaultSubmit = async (files: File[]) => {
    const fd = new FormData();
    const pid = String(project.id);
    fd.append("projectId", pid);
    fd.append("pid", pid); // harmless fallback some routes accept
    (files || []).forEach((f) => fd.append("photos", f)); // key matches server: photos[]

    // Do NOT set "Content-Type" manually.
    await api.post("/api/tradesmen/shares", fd);
  };

  const handleSubmit = async (files: File[]) => {
    setLocalFlash(null);
    setLocalBusy(true);
    try {
      if (onShareSubmit) {
        await onShareSubmit(files);
      } else {
        await defaultSubmit(files);
      }
      setShareOpen(false);
      setJustShared(true); // immediate session success
      setHasSharedFromApi(true); // hide button straight away
      setLocalFlash({
        kind: "success",
        text: "Profile shared. We’ve notified the homeowner.",
      });
      window.setTimeout(() => setLocalFlash(null), 5000);
    } catch (e: any) {
      setLocalFlash({
        kind: "error",
        text:
          e?.response?.data?.error ||
          e?.message ||
          "Failed to share profile. Please try again.",
      });
      window.setTimeout(() => setLocalFlash(null), 6000);
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <section
      className="lg:col-span-6"
      aria-labelledby="details-heading"
      data-testid="project-details"
    >
      <div className="card">
        {/* Global flash (from parent) */}
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

        {/* Local flash (only immediate confirmation right after submit) */}
        {!!localFlash && (
          <div
            role="alert"
            aria-live="polite"
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              localFlash.kind === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
            data-testid="share-flash"
          >
            {localFlash.text}
          </div>
        )}

        {/* "Already submitted" banner — ONLY after a reload/return (i.e., not just shared now) */}
        {!isOwner && hasSharedFromApi && !justShared && (
          <div
            className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm"
            role="status"
            data-testid="share-already-submitted-banner"
          >
            <span className="mr-2">✓</span>
            <span>Your profile has already been shared.</span>
          </div>
        )}

        <h2 id="details-heading" className="sr-only">
          Project details
        </h2>

        {/* Owner actions (top row for owners only) */}
        {isOwner && (
          <div
            className="mb-4 flex flex-wrap gap-2"
            aria-label="Owner actions"
            data-testid="owner-actions"
          >
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

            {!isClosed ? (
              <>
                <button
                  className="btn-danger"
                  onClick={onOpenCloseModal}
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

        {/* Share profile (for tradesmen) — hidden once shared */}
        {!isOwner && showShareButton && !hasSharedFromApi && !justShared && (
          <div className="mb-3 flex justify-end">
            <button
              className="btn"
              onClick={() => setShareOpen(true)}
              disabled={effectiveBusy || checkingShared}
              aria-busy={effectiveBusy || checkingShared}
              data-testid="btn-share-profile-in-card"
            >
              {effectiveBusy || checkingShared
                ? "Sending…"
                : "Express interest"}
            </button>
          </div>
        )}

        {/* Badges */}
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="list"
          aria-label="Project attributes"
          data-testid="project-badges"
        >
          <span role="listitem" className="badge blue" data-testid="badge-type">
            {project.type}
          </span>
          <span
            role="listitem"
            className="badge gray"
            data-testid="badge-location"
          >
            {project.location}
          </span>
          <span
            role="listitem"
            className="badge orange capitalize"
            data-testid="badge-property"
          >
            {project.propertyType}
          </span>
          <span
            role="listitem"
            className="badge green"
            data-testid="badge-bedrooms"
          >
            {project.bedrooms} bed
          </span>
          <span role="listitem" data-testid="badge-status">
            <StatusBadge value={project.status} />
          </span>
        </div>

        <div className="divider" />

        {/* Fields */}
        <dl className="grid grid-cols-2 gap-4" data-testid="project-fields">
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
            <dd className="font-medium capitalize" data-testid="field-property">
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
            <dd className="font-medium capitalize" data-testid="field-status">
              <StatusBadge value={project.status} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 text-sm">Created</dt>
            <dd className="font-medium" data-testid="field-created">
              {new Date(project.createdAt).toLocaleString()}
            </dd>
          </div>
        </dl>

        {/* Description */}
        <div className="mt-5" data-testid="project-description-block">
          <h3 className="mb-1 font-semibold" id="desc-heading">
            Description
          </h3>
          {gated ? (
            <div className="relative">
              <p
                className="whitespace-pre-wrap text-slate-700 blur-sm select-none"
                aria-hidden
              >
                {project.description}
              </p>
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl">
                <div className="bg-white rounded-2xl shadow-lg border border-zinc-200 p-6 text-center max-w-sm">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                    <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h4 className="font-bold text-zinc-900 text-sm">Unlock full job details</h4>
                  <p className="mt-1 text-xs text-zinc-500">See the full description, contact the homeowner, and express your interest.</p>
                  {onUnlockJob && (
                    <button
                      type="button"
                      onClick={onUnlockJob}
                      className="mt-4 w-full inline-flex items-center justify-center rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-colors"
                    >
                      Unlock for &pound;{unlockPrice}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p
              className="whitespace-pre-wrap text-slate-700"
              aria-labelledby="desc-heading"
              data-testid="field-description"
            >
              {project.description}
            </p>
          )}
        </div>

        {/* Footer actions row (optional) */}
        {footerRight && (
          <>
            <div className="divider mt-5" />
            <div
              className="mt-3 flex items-center justify-end"
              data-testid="project-details-footer"
            >
              <div className="ml-auto">{footerRight}</div>
            </div>
          </>
        )}
      </div>

      {/* Add recommendation affordance */}
      {canAddRec && !isOwner && !isClosed && (
        <div className="mt-4">
          <Link
            className="btn"
            href={`/projects/${project.id}/recommend`}
            data-testid="btn-add-recommendation"
          >
            Add recommendation
          </Link>
        </div>
      )}

      {/* Share Modal (self-managed here) */}
      {showShareButton && !isOwner && !hasSharedFromApi && !justShared && (
        <ShareProfileModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  );
}
