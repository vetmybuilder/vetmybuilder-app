import * as React from "react";
import ProjectDetailsCard from "@/components/project/ProjectDetailsCard";
import ContactDetailsCard from "@/components/project/ContactDetailsCard";

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

export default function TradesmanProjectView({ vm }: { vm: VM }) {
  const {
    project,
    isOwner,
    isTrades,
    isLive,
    isClosed,
    isArchived,
    canPublish,
    backHref,
    busy,
    flash,
    copyInvite,
    onPublish,
    onArchive,
    onUnarchive,
    onCloseProject,
    interestBusy,
    interestSent,
    shareCheckDone,
    ownerContact,
    contactLoading,
    onUpgradeClick,
  } = vm;

  if (!project) return null;

  return (
    <>
      {/* Back to projects for tradesmen */}
      {isTrades && !isOwner && (
        <div className="mb-4">
          <a
            href={backHref}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800"
          >
            ← Back to projects
          </a>
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 lg:[grid-template-columns:580px_minmax(0,1fr)]">
        <div>
          <ProjectDetailsCard
            project={project}
            isOwner={false}
            isClosed={isClosed}
            isArchived={isArchived}
            isLive={isLive}
            canPublish={canPublish}
            busy={busy}
            flash={flash}
            onPublish={onPublish}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onCopyInvite={copyInvite}
            onOpenCloseModal={onCloseProject}
            canAddRec={false}
            showShareButton={
              !!project &&
              isTrades &&
              !isOwner &&
              isLive &&
              !isClosed &&
              !interestSent &&
              shareCheckDone
            }
            shareBusy={interestBusy}
          />
        </div>

        <div>
          <ContactDetailsCard
            locked={!ownerContact}
            loading={contactLoading}
            contact={ownerContact || undefined}
            onUpgrade={onUpgradeClick}
          />
        </div>
      </div>
    </>
  );
}
