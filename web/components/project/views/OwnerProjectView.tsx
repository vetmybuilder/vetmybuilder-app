// web/components/project/views/OwnerProjectView.tsx
import * as React from "react";
import StatusBadge from "@/components/StatusBadge";
import ShortlistSection from "@/components/project/ShortlistSection";
import {
  SquarePen,
  XCircle,
  Archive as ArchiveIcon,
  Link as LinkIcon,
  Info as InfoIcon,
} from "lucide-react";
import { useApi } from "@/utils/api";
import { FeaturedSimpleStrip } from "@/components/tradesmen/FeaturedSimpleCard";
import { FeaturedTradesman } from "@/components/tradesmen/GoldTradesmanCard";
import SpotlightStrip from "@/components/tradesmen/SpotlightStrip";
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
import { estimateProjectCost } from "@/utils/estimate";
import type { Verification } from "@/types/vmb"; // 🔑 CH verification type

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

// Helper: extract a clean budget string from the description
function extractBudget(description?: string | null): string | null {
  if (!description) return null;
  const desc = String(description).trim();

  // 1) Pattern like: "Budget: £5k–£15k" (up to first dot/newline)
  const explicit = desc.match(/Budget[:\-]\s*([^.\n]+)/i);
  if (explicit?.[1]) {
    return explicit[1].trim();
  }

  // 2) If description starts with a budget like: "£5k–£15k. Materials: ..."
  const startMatch = desc.match(/^£([^.\n]*)\./);
  if (startMatch?.[1]) {
    return `£${startMatch[1]}`.replace(/\.$/, "").trim();
  }

  // 3) Fallback: any "£..." chunk (e.g. "£5k–£15k")
  const poundMatch = desc.match(/£[0-9][0-9,.\-\sKk+–£]*/);
  if (poundMatch?.[0]) {
    return poundMatch[0].replace(/\.$/, "").trim();
  }

  return null;
}

// Helper: pull "Additional work types: A, B, C" from the description
function extractAdditionalTypes(description?: string | null): string[] {
  if (!description) return [];
  const match = description.match(/Additional work types:\s*([^\n]+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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

  const [featured, setFeatured] = React.useState<FeaturedTradesman[]>([]);
  const [featuredErr, setFeaturedErr] = React.useState<string | null>(null);
  const [featuredLoading, setFeaturedLoading] = React.useState(false);
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

  // Load featured tradesmen for this project
  React.useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;

    (async () => {
      try {
        setFeaturedLoading(true);
        setFeaturedErr(null);

        const res = await api.get("/api/tradesmen/featured", {
          params: {
            onlyGold: true,
            limit: 30,
            projectId: String(project.id),
          },
        } as any);

        const data: any = (res as any)?.data ?? res;
        const items: FeaturedTradesman[] = Array.isArray(data?.items)
          ? data.items
          : [];

        if (!cancelled) {
          setFeatured(items);
        }
      } catch (e: any) {
        if (!cancelled) {
          setFeaturedErr(e?.message || "Failed to load featured tradesmen");
        }
      } finally {
        if (!cancelled) setFeaturedLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.id, api]);

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

  if (!project) return null;

  // Use the "short" project name in the header (type is the clean label like "Cavity Wall Insulation")
  const headerTitle = project.type || project.name;
  const budget = extractBudget(project.description);

  // Build list of work types for the estimator (primary type + "Additional work types")
  const additionalTypes = extractAdditionalTypes(project.description);
  const allTypes = [project.type, ...additionalTypes].filter((x): x is string =>
    Boolean(x && x.trim()),
  );

  const estimate = React.useMemo(
    () =>
      estimateProjectCost({
        category: null, // can be wired up when category is available on project
        types: allTypes,
        location: project.location || "",
        propertyType: project.propertyType || "",
        bedrooms: project.bedrooms ?? 0,
        description: project.description || "",
      }),
    [
      allTypes.join("|"),
      project.location,
      project.propertyType,
      project.bedrooms,
      project.description,
    ],
  );

  // Map API items into FeaturedSimpleStrip items
  const featuredItems = React.useMemo(
    () =>
      featured.map((t) => ({
        id: String(t.builderId),
        name: t.companyName || t.displayName || "Tradesman",
        img:
          t.avatarUrl ||
          (Array.isArray(t.gallery) && t.gallery.length > 0
            ? t.gallery[0]
            : null),
        onClick: () => router.push(`/tradesman/${t.builderId}`),
      })),
    [featured, router],
  );

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

  const createdAtDate = createdAtRaw ? new Date(createdAtRaw) : null;
  const updatedAtDate = updatedAtRaw ? new Date(updatedAtRaw) : null;

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

      {/* Header */}
      <header className="mb-6 rounded-xl border border-slate-200 bg-white/70 backdrop-blur p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          {/* LEFT: title + meta + badges + primary CTA */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <a
                href={backHref}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                ← Back
              </a>
              <span className="text-xs text-slate-400">
                {metaLabel} {metaText}
              </span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {headerTitle}
              <StatusBadge value={project.status} />
              {!isClosed && (
                <a
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-600 shadow-sm hover:bg-slate-50"
                  href={`/projects/${project.id}/edit`}
                  aria-label="Edit project"
                  title="Edit project"
                  data-testid="btn-edit"
                >
                  <SquarePen size={16} />
                </a>
              )}
            </h1>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="list"
              aria-label="Project attributes"
              data-testid="project-badges"
            >
              {budget && (
                <span
                  role="listitem"
                  className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
                  data-testid="badge-budget"
                >
                  {budget}
                </span>
              )}

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
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                    onClick={() => setShowGetRecModal(true)}
                    data-testid="btn-get-recs"
                  >
                    <LinkIcon size={18} /> Share
                  </button>
                )}

                {!isLive && !isClosed && (
                  <button
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 md:text-sm"
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

            {estimate && (
              <div className="mt-3 w-full text-right">
                <div className="inline-flex items-center gap-2">
                  <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                    £{estimate.low.toLocaleString()}–£
                    {estimate.high.toLocaleString()}
                  </div>
                  <div className="relative group">
                    <button
                      type="button"
                      data-testid="job-estimate-info"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label="How this estimate is calculated"
                    >
                      <InfoIcon size={14} />
                    </button>
                    <div
                      data-testid="job-estimate-tooltip"
                      className="pointer-events-none absolute right-0 z-10 mt-2 w-72 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11px] leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <p className="font-semibold">
                        Job estimate based on your project details.
                      </p>
                      <p className="mt-1">
                        This is a guide price and actual quotes may vary
                        depending on site visit, materials and final scope.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* === Featured Gold Tradesmen === */}
      <section
        aria-label="Featured Gold Tradesmen"
        data-testid="featured-gold"
        className="mb-6"
      >
        {featuredLoading && (
          <p className="text-sm text-slate-500">Loading featured…</p>
        )}
        {featuredErr && <p className="text-sm text-rose-600">{featuredErr}</p>}

        {!featuredLoading && !featuredErr && featuredItems.length === 0 && (
          <p className="text-sm text-slate-500">No Gold tradesmen yet.</p>
        )}

        {featuredItems.length > 0 && (
          <FeaturedSimpleStrip items={featuredItems} pageSize={4} />
        )}
      </section>

      {/* === Shared tradesmen strip (profiles shared directly to this project) === */}
      <SharedTradesmen projectId={project.id} />

      {/* === Two-column: Top recs (left) • Spotlight (right) === */}
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
            showOwnerShareCta={
              !isLive &&
              !isClosed &&
              !hideShortlistShareCta &&
              (shortlistData?.length ?? 0) === 0
            }
            onOwnerShareClick={() => setShowGetRecModal(true)}
          />
          {recsErr && <p className="mt-2 text-sm text-rose-600">{recsErr}</p>}
        </div>

        {/* RIGHT: Spotlight */}
        <div>
          <section
            aria-label="Spotlight tradesmen"
            data-testid="spotlight-strip"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <SpotlightStrip projectId={String(project.id)} />
          </section>
        </div>
      </div>
    </>
  );
}
