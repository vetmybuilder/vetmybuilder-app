// web/components/project/views/OwnerProjectView.tsx
import * as React from "react";
import StatusBadge from "@/components/StatusBadge";
import ShortlistSection from "@/components/project/ShortlistSection";
import {
  SquarePen,
  XCircle,
  Archive as ArchiveIcon,
  Link as LinkIcon,
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
    if (!project?.id) return;
    if (typeof window === "undefined") return;
    const key = `vmb_neighbourhood_shared_${project.id}`;
    const val = window.localStorage.getItem(key);
    setHasSharedNeighbourhood(val === "1");
  }, [project?.id]);

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

  if (!project) return null;

  // Use the "short" project name in the header (type is the clean label like "Cavity Wall Insulation")
  const headerTitle = project.type || project.name;
  const budget = extractBudget(project.description);

  // Build list of work types for the estimator (primary type + "Additional work types")
  const additionalTypes = extractAdditionalTypes(project.description);
  const allTypes = [project.type, ...additionalTypes].filter((x): x is string =>
    Boolean(x && x.trim())
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
    ]
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
    [featured, router]
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
        `/api/v2/projects/${project.id}/magic-link`
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
            // TODO: call backend flag if you want to block community sharing server-side
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
                Created {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {headerTitle}
              <StatusBadge value={project.status} />
              {/* Edit icon right next to project name */}
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
              {/* <span role="listitem" data-testid="badge-status">
                <StatusBadge value={project.status} />
              </span> */}
            </div>

            {/* Primary CTA: Share / Share & Publish – bottom-left under badges */}
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

              {/* Helper text under the CTA */}
              {!isClosed && (
                <p className="text-xs text-slate-500 max-w-xl">
                  Share this project to start seeing recommendations and vetted
                  tradespeople.
                </p>
              )}
            </div>
          </div>

          {/* RIGHT: lifecycle actions + estimate card */}
          <div className="mt-1 flex w-full flex-col items-stretch md:mt-0 md:w-auto md:items-end">
            <div
              className="flex flex-wrap justify-start gap-2 md:justify-end"
              aria-label="Project management actions"
              data-testid="owner-actions-secondary"
            >
              {!isClosed ? (
                <>
                  {/* Close = destructive (red) */}
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 md:text-sm"
                    onClick={onCloseProject}
                    data-testid="btn-close-project"
                  >
                    <XCircle size={14} />
                    <span>Close this Job</span>
                  </button>

                  {/* Archive = neutral (grey) */}
                  {/* <button
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 md:text-sm"
                    onClick={onArchive}
                    data-testid="btn-archive"
                  >
                    <ArchiveIcon size={14} />
                    <span>Archive</span>
                  </button> */}
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

            {/* Estimate summary card */}
            {estimate && (
              <div className="mt-3 w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Estimated cost (guide only)
                </div>
                <p className="mt-1 leading-snug">
                  Based on your project details, we estimate the cost to be
                  between{" "}
                  <span className="font-semibold text-slate-900">
                    £{estimate.low.toLocaleString()} and £
                    {estimate.high.toLocaleString()}
                  </span>
                  .
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Actual quotes may vary depending on site visit, materials and
                  final scope.
                </p>
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
            items={recs || []}
            total={recTotal}
            viewMoreHref={`/projects/${project.id}/shortlist`}
            isOwner={true}
            canVote={false}
            votingId={null}
            onVoteUp={async () => {}}
            recHasPhotos={{}}
            recVerification={{} as any}
            showOwnerShareCta={
              !isLive &&
              !isClosed &&
              !hideShortlistShareCta &&
              (recs?.length ?? 0) === 0
            }
            onOwnerShareClick={() => setShowGetRecModal(true)}
          />
          {recsErr && <p className="mt-2 text-sm text-rose-600">{recsErr}</p>}
        </div>

        {/* RIGHT: Spotlight (auto-rotated by server, shows all) */}
        <div>
          <section
            aria-label="Spotlight tradesmen"
            data-testid="spotlight-strip"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            {/* Cast to string to satisfy SpotlightStrip's prop type */}
            <SpotlightStrip projectId={String(project.id)} />
          </section>
        </div>
      </div>
    </>
  );
}
