import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
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

  // NEW: extra actions rendered in the card footer (right-aligned)
  footerRight?: ReactNode;
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
  footerRight, // NEW
}: Props) {
  return (
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

        {/* Badges */}
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

        {/*Footer actions row (appears only when provided) */}
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
            aria-label="Add recommendation"
            data-testid="btn-add-recommendation"
          >
            Add recommendation
          </Link>
        </div>
      )}
    </section>
  );
}
