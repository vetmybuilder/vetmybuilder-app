import * as React from "react";
import { useRouter } from "next/router";
import ProjectDetailsCard from "@/components/project/ProjectDetailsCard";
import ContactDetailsCard from "@/components/project/ContactDetailsCard";

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

export default function TradesmanProjectView({ vm }: { vm: VM }) {
  const router = useRouter();

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

    ownerContact,
    contactLoading,
    contactUnlocked,
    contactError,

    onUpgradeClick,
  } = vm;

  if (!project) return null;

  const handleUpgrade =
    onUpgradeClick || (() => router.push("/tradesman/plans"));

  return (
    <>
      {isTrades && !isOwner && (
        <div className="mb-4">
          <a
            href={backHref}
            className="inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            ← Back to projects
          </a>
        </div>
      )}

      {/* === Project Insights (AI classification) === */}
      {vm.classification && (
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 border-l-4 border-violet-500 mb-6 animate-slide-in-left">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <h3 className="text-sm font-bold text-zinc-900">Project Insights</h3>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {vm.classification.type && (
              <span className="bg-violet-100 text-violet-700 text-xs px-3 py-1 rounded-full">
                <span className="font-medium opacity-60">Trade · </span>
                <span className="font-bold">{vm.classification.type}</span>
              </span>
            )}
            {vm.classification.complexity && (
              <span className="bg-amber-100 text-amber-700 text-xs px-3 py-1 rounded-full">
                <span className="font-medium opacity-60">Complexity · </span>
                <span className="font-bold">{vm.classification.complexity.charAt(0).toUpperCase() + vm.classification.complexity.slice(1)}</span>
              </span>
            )}
            {vm.classification.urgency && (
              <span className="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full">
                <span className="font-medium opacity-60">Timing · </span>
                <span className="font-bold">{vm.classification.urgency.charAt(0).toUpperCase() + vm.classification.urgency.slice(1)}</span>
              </span>
            )}
          </div>

          <div className="grid gap-2 text-sm">
            {vm.classification.recommended_trades?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[100px] pt-0.5">Trades</span>
                <span className="text-zinc-600">{vm.classification.recommended_trades.join(", ")}</span>
              </div>
            )}
            {vm.classification.key_concerns?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[100px] pt-0.5">Concerns</span>
                <span className="text-zinc-600">{vm.classification.key_concerns.join(", ")}</span>
              </div>
            )}
            {vm.classification.summary && (
              <div className="flex gap-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[100px] pt-0.5">Summary</span>
                <span className="text-zinc-600 italic">{vm.classification.summary}</span>
              </div>
            )}
          </div>
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
              !!project && isTrades && !isOwner && isLive && !isClosed
            }
            shareBusy={false}
          />
        </div>

        <div>
          <ContactDetailsCard
            locked={!contactUnlocked}
            loading={contactLoading}
            contact={ownerContact || undefined}
            status={
              contactError === "verification_required"
                ? "verification_required"
                : contactError === "verification_pending"
                ? "verification_pending"
                : contactError === "verification_rejected"
                ? "verification_rejected"
                : contactError === "pending_admin_review"
                ? "pending_admin_review"
                : contactError === "not_unlocked"
                ? "not_unlocked"
                : contactError === "error"
                ? "error"
                : undefined
            }
            onUpgrade={handleUpgrade}
          />
        </div>
      </div>
    </>
  );
}
