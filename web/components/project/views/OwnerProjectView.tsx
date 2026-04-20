// web/components/project/views/OwnerProjectView.tsx
import * as React from "react";
import StatusBadge from "@/components/StatusBadge";
import ShortlistSection from "@/components/project/ShortlistSection";
import HireConfirmModal from "@/components/project/HireConfirmModal";
import HiredTradesmenSection from "@/components/project/HiredTradesmenSection";
import {
  SquarePen,
  XCircle,
  Archive as ArchiveIcon,
  Link as LinkIcon,
} from "lucide-react";
import { useApi } from "@/utils/api";
import SpotlightStrip from "@/components/tradesmen/SpotlightStrip";
import ScrollReveal from "@/components/ScrollReveal";
import NextLink from "next/link";
import { useRouter } from "next/router";
import GetRecommendationsModal, {
  GetRecommendationsChannel,
} from "@/components/project/GetRecommendationsModal";
import PriceRangeBadge from "@/components/project/PriceRangeBadge";
import {
  buildDefaultInviteMessage,
  openWhatsAppShare,
  openSmsShare,
  openEmailShare,
} from "@/utils/shareInvite";
import SharedTradesmen from "@/components/project/SharedTradesmen";
import VettedBusinessesStrip from "@/components/project/VettedBusinessesStrip";
import type { Verification } from "@/types/vmb";

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

export default function OwnerProjectView({ vm }: { vm: VM }) {
  const {
    project,
    backHref,
    isClosed,
    isArchived,
    onArchive,
    onUnarchive,
    onCloseProject,
    recs,
    recTotal,
    recsErr,
    setFlash,
  } = vm;

  const api = useApi();
  const router = useRouter();

  const [recHasPhotos, setRecHasPhotos] = React.useState<
    Record<number, boolean>
  >({});

  // Companies House verification per recommendation
  const [recVerification, setRecVerification] = React.useState<
    Record<number, Verification>
  >({});

  // ===== Hire flow state =====
  const [hireTarget, setHireTarget] = React.useState<{
    recommendationId: number;
    displayName: string;
  } | null>(null);
  const [hiredRecommendationIds, setHiredRecommendationIds] = React.useState<
    Set<number>
  >(new Set());
  // Bumped after a successful hire so the HiredTradesmenSection refetches.
  const [hiresRefreshKey, setHiresRefreshKey] = React.useState(0);

  // state for "Get recommendations" modal visibility
  const [showGetRecModal, setShowGetRecModal] = React.useState(false);

  // track if we've already prompted+shared so we can hide CTA in shortlist
  const [hideShortlistShareCta, setHideShortlistShareCta] =
    React.useState(false);

  // "Your job is live!" banner - shown when arriving from project creation
  const [showJustCreated, setShowJustCreated] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('justCreated') === '1') {
      setShowJustCreated(true);
      const t = setTimeout(() => setShowJustCreated(false), 5000);
      // Clean up the URL param
      window.history.replaceState({}, '', window.location.pathname);
      return () => clearTimeout(t);
    }
  }, []);

  // Fetch Companies House + Google verification + photos for each recommendation
  React.useEffect(() => {
    const src = recs || [];

    if (!src.length) {
      setRecVerification({});
      setRecHasPhotos({});
      return;
    }

    let cancelled = false;

    (async () => {
      const verMap: Record<number, Verification> = {};
      const photosMap: Record<number, boolean> = {};

      await Promise.all(
        src.map(async (r: any) => {
          const recId = r.id;

          // --- Verification fetch ---
          try {
            const { data } = await api.get(
              `/api/recommendations/${recId}/verification`,
            );
            if (!cancelled && data?.verification) {
              verMap[recId] = data.verification as Verification;
            }
          } catch {
            /* ignore */
          }

          // --- PHOTO DETECTION (OPTION A) ---
          try {
            const { data } = await api.get(`/api/recommendations/${recId}`);
            const arr = data?.recommendation?.photos ?? [];
            photosMap[recId] = Array.isArray(arr) && arr.length > 0;
          } catch {
            photosMap[recId] = false;
          }
        }),
      );

      if (!cancelled) {
        setRecVerification(verMap);
        setRecHasPhotos(photosMap);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, recs]);

  // Fetch existing hires so we can render the Hire button as "Hired" on
  // recommendations that are currently hired. Only ACTIVE hires (pending,
  // pending_invite, accepted) block the rec card - terminal statuses
  // (declined, cancelled, expired) free it up so the homeowner can re-hire.
  React.useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${project.id}/hires`);
        if (cancelled) return;
        const ACTIVE_STATUSES = new Set([
          "pending",
          "pending_invite",
          "accepted",
        ]);
        const ids = new Set<number>(
          (Array.isArray(data?.items) ? data.items : [])
            .filter((h: any) => ACTIVE_STATUSES.has(h?.status))
            .map((h: any) => h?.recommendationId)
            .filter((id: any): id is number => typeof id === "number"),
        );
        setHiredRecommendationIds(ids);
      } catch {
        // non-critical - leave the set as-is
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, project?.id, hiresRefreshKey]);

  // Handler called when the homeowner confirms a hire from the modal.
  const submitHire = React.useCallback(
    async (message: string) => {
      if (!project?.id || !hireTarget) return;
      await api.post(`/api/projects/${project.id}/hires`, {
        recommendationId: hireTarget.recommendationId,
        homeownerMessage: message || undefined,
      });
      setHireTarget(null);
      setHiresRefreshKey((k) => k + 1);
    },
    [api, project?.id, hireTarget],
  );

  if (!project) return null;

  // Use the "short" project name in the header (type is the clean label like "Cavity Wall Insulation")
  const headerTitle = project.type || project.name;

  const handleShare = async (channel: GetRecommendationsChannel) => {
    if (!project?.id) return;

    // If no share channel was selected, stop here.
    if (!channel) return;

    // 2) Generate magic link - r/<token>
    let inviteUrl: string;

    try {
      const { data } = await api.post(
        `/api/v2/projects/${project.id}/magic-link`,
      );

      inviteUrl =
        data?.url ||
        (data?.token
          ? `${window.location.origin}/r/${data.token}`
          : `${window.location.origin}/projects/${project.id}/recommend`);
    } catch (e: any) {
      inviteUrl = `${window.location.origin}/projects/${project.id}/recommend`;
      setFlash?.({
        kind: "error",
        text:
          e?.response?.data?.error ||
          e?.message ||
          "Failed to generate invite link. Using fallback link.",
      });
    }

    const message = buildDefaultInviteMessage({
      projectName: headerTitle,
      location: project.location,
      inviteUrl,
    });

    if (channel === "whatsapp") {
      openWhatsAppShare(message);
    } else if (channel === "sms") {
      openSmsShare(message);
    } else if (channel === "email") {
      openEmailShare("Can you recommend a tradesperson?", message);
    }
  };

  const allRecs = recs || [];
  const pipelineRecs = allRecs.filter((r) => r.source === "pipeline");
  const communityRecs = allRecs.filter((r) => r.source !== "pipeline");
  const shortlistData = communityRecs;
  const shortlistCount = recTotal - pipelineRecs.length;

  // ===== Created vs Updated meta (robust for MySQL DATETIME strings) =====
  const createdAtRaw = (project as any)?.createdAt;
  const updatedAtRaw = (project as any)?.updatedAt;

  // MySQL DATETIME has no timezone suffix - treat as UTC so local display is correct
  const parseUtc = (raw: any): Date | null => {
    if (!raw) return null;
    const s = String(raw);
    if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
    return new Date(s.replace(" ", "T") + "Z");
  };

  const createdAtDate = parseUtc(createdAtRaw);
  const updatedAtDate = parseUtc(updatedAtRaw);

  const createdOk =
    createdAtDate instanceof Date && !Number.isNaN(createdAtDate.getTime());
  const updatedOk =
    updatedAtDate instanceof Date && !Number.isNaN(updatedAtDate.getTime());

  const rawDifferent =
    createdAtRaw != null &&
    updatedAtRaw != null &&
    String(updatedAtRaw) !== String(createdAtRaw);

  const timeDifferent =
    createdOk &&
    updatedOk &&
    updatedAtDate!.getTime() !== createdAtDate!.getTime();

  const showUpdated = rawDifferent || timeDifferent;

  const metaLabel = showUpdated ? "Updated" : "Created";
  const metaDate = showUpdated ? updatedAtDate : createdAtDate;

  const metaText =
    metaDate && !Number.isNaN(metaDate.getTime())
      ? metaDate.toLocaleDateString("en-GB")
      : "";

  return (
    <>
      <GetRecommendationsModal
        open={showGetRecModal}
        onClose={() => setShowGetRecModal(false)}
        onConfirm={async ({ channel }) => {
          await handleShare(channel);
          setHideShortlistShareCta(true);
          setShowGetRecModal(false);
        }}
      />

      {/* Back link - outside the header card */}
      <a
        href={backHref}
        className="hidden sm:inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
      >
        ← Back to Jobs
      </a>

      {/* Header */}
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-emerald-100 via-emerald-50 to-green-50 border border-emerald-200 p-4 sm:p-6 shadow-md shadow-emerald-100/40">
        {/* TOP ROW: meta date on the left, secondary actions on the
            right. Replaces the previous absolute-positioned Close Job
            which on mobile overlapped the title and made the layout
            feel cluttered. */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-xs text-slate-400">
            {metaLabel} {metaText}
          </span>
          <div data-testid="owner-actions-secondary">
            {!isClosed ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 hover:border-rose-300 transition-all"
                onClick={onCloseProject}
                data-testid="btn-close-project"
              >
                <XCircle size={12} />
                <span>Close Job</span>
              </button>
            ) : (
              isArchived && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all backdrop-blur"
                  onClick={onUnarchive}
                  data-testid="btn-unarchive"
                >
                  <ArchiveIcon size={12} />
                  <span>Unarchive</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* TITLE: full-width line on its own so it can wrap freely.
            Status badge + edit icon sit in a separate row below so a
            long title doesn't push them onto a confusing tail line. */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {headerTitle}
          </h1>
          {!isClosed && (
            <NextLink
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:bg-slate-50 flex-shrink-0"
              href={`/projects/${project.id}/edit`}
              aria-label="Edit job"
              title="Edit job"
              data-testid="btn-edit"
            >
              <SquarePen size={14} />
            </NextLink>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge value={project.status} />
        </div>

        {/* Primary CTA + guidance */}
        {!isClosed && (
          <div className="mt-4" data-testid="owner-actions-primary">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 hover:shadow-xl transition-all flex-shrink-0"
                onClick={() => setShowGetRecModal(true)}
                data-testid="btn-get-recs"
              >
                <LinkIcon size={16} /> Share with friends
              </button>
              <p className="text-sm text-slate-600 leading-relaxed">
                Your job is live and visible to local tradespeople. Share it via WhatsApp, SMS or email to collect recommendations.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2">
              <span className="text-amber-500 flex-shrink-0">&#9660;</span>
              <p className="text-sm font-medium text-amber-800">
                Recommendations will appear below as builders respond to your job.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* "Your job is live!" success banner - shown when arriving from project creation */}
      {showJustCreated && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4 animate-slide-in-left" data-testid="job-live-banner">
          <p className="text-sm font-semibold text-emerald-800">Your job is live!</p>
          <p className="text-xs text-emerald-600 mt-0.5">Share it with friends and neighbours to start getting recommendations.</p>
        </div>
      )}

      {/* === Project Insights (AI classification) === */}
      {vm.classification && (
        <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-6 border-l-4 border-violet-500 mb-6 animate-slide-in-left" data-testid="project-insights-card">
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
            {vm.classification.scope && (
              <span className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full">
                <span className="font-medium opacity-60">Scope · </span>
                <span className="font-bold">{vm.classification.scope.charAt(0).toUpperCase() + vm.classification.scope.slice(1)}</span>
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

          <div className="grid gap-3 text-sm sm:text-sm">
            <div className="flex gap-2">
              <span className="text-xs sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[90px] pt-0.5">Property</span>
              <span className="text-base sm:text-sm text-zinc-600">{project.location}{project.propertyType ? ` \u00b7 ${project.propertyType}` : ""}{project.bedrooms ? ` \u00b7 ${project.bedrooms} bed` : ""}</span>
            </div>
            {vm.classification.key_concerns?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-xs sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[90px] pt-0.5">What matters</span>
                <span className="text-base sm:text-sm text-zinc-600">{vm.classification.key_concerns.join(", ")}</span>
              </div>
            )}
            {vm.classification.summary && (
              <div className="flex gap-2">
                <span className="text-xs sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[90px] pt-0.5">About</span>
                <span className="text-base sm:text-sm text-zinc-600">{vm.classification.summary}</span>
              </div>
            )}
          </div>

          <PriceRangeBadge
            workType={(project as any)?.type}
            answers={(project as any)?.answers_json}
            fallback={vm.classification?.price_band_estimate}
          />
        </div>
      )}

      {/* === Shared tradesmen strip (profiles shared directly to this project) === */}
      <SharedTradesmen projectId={project.id} />

      {/* === Vetted businesses strip (pipeline recs) === */}
      <VettedBusinessesStrip
        items={pipelineRecs}
        projectId={project.id}
      />

      {/* === Two-column: Top recs (left) • Spotlight (right) === */}
      <ScrollReveal>
      <div className="grid gap-6 grid-cols-1 lg:[grid-template-columns:580px_minmax(0,1fr)]">
        {/* LEFT: Top recommendations */}
        <div>
          <ShortlistSection
            items={shortlistData}
            total={shortlistCount}
            viewMoreHref={`/projects/${project.id}/shortlist`}
            isOwner={true}
            canVote={false}
            votingId={null}
            onVoteUp={async () => {}}
            recHasPhotos={recHasPhotos}
            recVerification={recVerification}
            projectId={project.id}
            showOwnerShareCta={false}
            onOwnerShareClick={() => setShowGetRecModal(true)}
            onHire={(recommendationId, displayName) =>
              setHireTarget({ recommendationId, displayName })
            }
            hiredRecommendationIds={hiredRecommendationIds}
          />
          {recsErr && <p className="mt-2 text-sm text-rose-600">{recsErr}</p>}
        </div>

        {/* RIGHT: Spotlight + Hired tradesmen */}
        <div>
          <section
            aria-label="Spotlight tradesmen"
            data-testid="spotlight-strip"
            className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm"
          >
            <SpotlightStrip projectId={String(project.id)} />
          </section>

          {/* Hired tradesmen - only renders if there are any */}
          <div className="mt-3">
            <HiredTradesmenSection
              projectId={project.id}
              refreshKey={hiresRefreshKey}
            />
          </div>
        </div>
      </div>
      </ScrollReveal>

      {/* Invisible bottom spacer so content doesn't sit flush with the viewport edge */}
      <div aria-hidden="true" className="h-8" />

      {/* Hire confirmation modal */}
      <HireConfirmModal
        open={hireTarget !== null}
        targetName={hireTarget?.displayName || ""}
        onConfirm={submitHire}
        onClose={() => setHireTarget(null)}
      />
    </>
  );
}
