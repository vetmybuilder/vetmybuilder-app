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
import {
  buildDefaultInviteMessage,
  openWhatsAppShare,
  openSmsShare,
  openEmailShare,
} from "@/utils/shareInvite";
import SharedTradesmen from "@/components/project/SharedTradesmen";
import type { Verification } from "@/types/vmb"; // 🔑 CH verification type

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

export default function OwnerProjectView({ vm }: { vm: VM }) {
  const {
    project,
    backHref,
    isLive,
    isClosed,
    isArchived,
    canPublish,
    onPublish,
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

  // 🔑 Companies House verification per recommendation
  const [recVerification, setRecVerification] = React.useState<
    Record<number, Verification>
  >({});

  // 🔹 NEW: shortlist items using aggregated VMB scores (ratings endpoint)
  const [shortlistItems, setShortlistItems] = React.useState<any[]>([]);
  const [shortlistTotal, setShortlistTotal] = React.useState<number>(0);

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

  // track if neighbourhood has already been shared (per project, persisted in localStorage)
  const [hasSharedNeighbourhood, setHasSharedNeighbourhood] =
    React.useState(false);

  // track if we've already prompted+shared so we can hide CTA in shortlist
  const [hideShortlistShareCta, setHideShortlistShareCta] =
    React.useState(false);

  // Load neighbourhood-shared flag from localStorage per project
  React.useEffect(() => {
    if (!project?.id || !project?.createdAt) return;
    if (typeof window === "undefined") return;

    const key = `vmb_neighbourhood_shared_${project.id}_${project.createdAt}`;
    const val = window.localStorage.getItem(key);

    setHasSharedNeighbourhood(val === "1");
  }, [project?.id, project?.createdAt]);

  // 🔥🔥 FULL BLOCK REPLACED WITH OPTION A (PHOTO CHECK FIX) 🔥🔥
  // 🔑 Fetch Companies House + Google verification + photos for each recommendation (Option A)
  React.useEffect(() => {
    const src =
      (shortlistItems && shortlistItems.length ? shortlistItems : recs) || [];

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
  }, [api, recs, shortlistItems]);
  // 🔥🔥 END OF OPTION A UPDATE 🔥🔥

  // 🔹 NEW: fetch shortlist *with aggregated VMB scores* from ratings endpoint
  React.useEffect(() => {
    if (!project?.id) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await api.get("/api/recommendations/ratings", {
          params: {
            projectId: project.id,
            limit: 6,
            offset: 0,
          },
        } as any);

        const data: any = (res as any)?.data ?? res;
        const items: any[] = Array.isArray(data?.items) ? data.items : [];

        if (cancelled) return;

        setShortlistItems(items);
        setShortlistTotal(
          typeof data?.total === "number" ? data.total : items.length,
        );
      } catch {
        if (cancelled) return;
        // Fallback to the original project recs if ratings endpoint fails
        setShortlistItems(recs || []);
        setShortlistTotal(recTotal);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, project?.id, recs, recTotal]);

  // Fetch existing hires so we can render the Hire button as "Hired" on
  // recommendations that are currently hired. Only ACTIVE hires (pending,
  // pending_invite, accepted) block the rec card — terminal statuses
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
        // non-critical — leave the set as-is
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

    // 1) Ensure project is live: auto-publish if needed (regardless of channel)
    if (!isLive && canPublish) {
      try {
        await onPublish(); // onPublish already handles flash + state
      } catch {
        // ignore; onPublish will have flashed any error
      }
    }

    // If no share channel was selected, stop here – project is already published.
    if (!channel) return;

    // 2) Generate magic link – r/<token>
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

  // Decide what to feed into ShortlistSection
  const shortlistData = shortlistItems.length ? shortlistItems : recs || [];
  const shortlistCount = shortlistItems.length ? shortlistTotal : recTotal;

  // ===== Created vs Updated meta (robust for MySQL DATETIME strings) =====
  const createdAtRaw = (project as any)?.createdAt;
  const updatedAtRaw = (project as any)?.updatedAt;

  // MySQL DATETIME has no timezone suffix — treat as UTC so local display is correct
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
        neighbourhoodLocked={hasSharedNeighbourhood}
        alreadyLive={isLive}
        onConfirm={async ({ neighbourhood, channel }) => {
          // If neighbourhood sharing is selected and not previously used, mark it as used
          if (neighbourhood && project?.id && !hasSharedNeighbourhood) {
            setHasSharedNeighbourhood(true);
            if (typeof window !== "undefined") {
              const key = `vmb_neighbourhood_shared_${project.id}`;
              window.localStorage.setItem(key, "1");
            }
          }

          await handleShare(channel);
          setHideShortlistShareCta(true);
          setShowGetRecModal(false);
        }}
      />

      {/* Back link — outside the header card */}
      <a
        href={backHref}
        className="inline-block mb-3 text-sm font-medium text-zinc-400 hover:text-zinc-700 transition-colors"
      >
        ← Back to projects
      </a>

      {/* Header */}
      <header className="mb-6 rounded-2xl bg-gradient-to-br from-emerald-100 via-emerald-50 to-green-50 border border-emerald-200 p-4 sm:p-6 shadow-md shadow-emerald-100/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          {/* LEFT: title + meta + badges + primary CTA */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {metaLabel} {metaText}
              </span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {headerTitle}
              <StatusBadge value={project.status} />
              {!isClosed && (
                <NextLink
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:bg-slate-50"
                  href={`/projects/${project.id}/edit`}
                  aria-label="Edit project"
                  title="Edit project"
                  data-testid="btn-edit"
                >
                  <SquarePen size={16} />
                </NextLink>
              )}
            </h1>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="list"
              aria-label="Project attributes"
              data-testid="project-badges"
            >
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
            </div>

            {/* Primary CTA: Share */}
            <div className="mt-4 space-y-1">
              <div
                className="flex flex-wrap gap-2"
                aria-label="Primary owner actions"
                data-testid="owner-actions-primary"
              >
                {isLive && (
                  <button
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-600"
                    onClick={() => setShowGetRecModal(true)}
                    data-testid="btn-get-recs"
                  >
                    <LinkIcon size={18} /> Share
                  </button>
                )}

                {!isLive && !isClosed && (
                  <button
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-600"
                    onClick={() => setShowGetRecModal(true)}
                    data-testid="btn-get-recs-draft"
                  >
                    <LinkIcon size={18} /> Share &amp; Publish
                  </button>
                )}
              </div>

              {!isClosed && (
                <p className="text-xs text-slate-500 max-w-xl">
                  Share this project to start seeing recommendations and vetted
                  tradespeople.
                </p>
              )}
            </div>
          </div>

          {/* RIGHT: lifecycle actions + estimate */}
          <div className="mt-1 flex w-full flex-col items-stretch md:mt-0 md:w-auto md:items-end">
            <div
              className="flex flex-wrap justify-start gap-2 md:justify-end"
              aria-label="Project management actions"
              data-testid="owner-actions-secondary"
            >
              {!isClosed ? (
                <>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-zinc-700 hover:border-zinc-300 transition-all md:text-sm"
                    onClick={onCloseProject}
                    data-testid="btn-close-project"
                  >
                    <XCircle size={14} />
                    <span>Close this Job</span>
                  </button>
                </>
              ) : (
                isArchived && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 md:text-sm"
                    onClick={onUnarchive}
                    data-testid="btn-unarchive"
                  >
                    <ArchiveIcon size={14} />
                    <span>Unarchive</span>
                  </button>
                )
              )}
            </div>

          </div>
        </div>
      </header>

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
              <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1 rounded-full">
                {vm.classification.type}
              </span>
            )}
            {vm.classification.scope && (
              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                {vm.classification.scope.charAt(0).toUpperCase() + vm.classification.scope.slice(1)} scope
              </span>
            )}
            {vm.classification.complexity && (
              <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-3 py-1 rounded-full">
                {vm.classification.complexity.charAt(0).toUpperCase() + vm.classification.complexity.slice(1)}
              </span>
            )}
            {vm.classification.urgency && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
                {vm.classification.urgency.charAt(0).toUpperCase() + vm.classification.urgency.slice(1)}
              </span>
            )}
          </div>

          <div className="grid gap-2 text-sm">
            {vm.classification.price_band_estimate && (
              <div className="flex gap-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide min-w-[100px] pt-0.5">Est. budget</span>
                <span className="text-zinc-700 font-semibold">{vm.classification.price_band_estimate}</span>
              </div>
            )}
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

      {/* === Shared tradesmen strip (profiles shared directly to this project) === */}
      <SharedTradesmen projectId={project.id} />

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
            showOwnerShareCta={
              !isLive &&
              !isClosed &&
              !hideShortlistShareCta &&
              (shortlistData?.length ?? 0) === 0
            }
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

          {/* Hired tradesmen — only renders if there are any */}
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
