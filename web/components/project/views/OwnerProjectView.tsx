// web/components/project/views/OwnerProjectView.tsx
import * as React from "react";
import StatusBadge from "@/components/StatusBadge";
import ShortlistSection from "@/components/project/ShortlistSection";
import {
  Pencil,
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
          setShowGetRecModal(false);
        }}
      />

      {/* Header */}
      <header className="mb-6 rounded-xl border border-slate-200 bg-white/70 backdrop-blur p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {headerTitle}
            </h1>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="list"
              aria-label="Project attributes"
              data-testid="project-badges"
            >
              <span
                role="listitem"
                className="badge blue"
                data-testid="badge-type"
              >
                {project.type}
              </span>

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
              <span role="listitem" data-testid="badge-status">
                <StatusBadge value={project.status} />
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div
              className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end"
              aria-label="Owner actions"
              data-testid="owner-actions"
            >
              {!isClosed && (
                <a
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  href={`/projects/${project.id}/edit`}
                  aria-label="Edit project"
                  data-testid="btn-edit"
                >
                  <Pencil size={16} /> Edit
                </a>
              )}

              {!isClosed ? (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                    onClick={onCloseProject}
                    data-testid="btn-close-project"
                  >
                    <XCircle size={16} /> Close
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                    onClick={onArchive}
                    data-testid="btn-archive"
                  >
                    <ArchiveIcon size={16} /> Archive
                  </button>
                </>
              ) : (
                isArchived && (
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={onUnarchive}
                    data-testid="btn-unarchive"
                  >
                    <ArchiveIcon size={16} /> Unarchive
                  </button>
                )
              )}

              {isLive && (
                <button
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
                  onClick={() => setShowGetRecModal(true)}
                  data-testid="btn-get-recs"
                >
                  <LinkIcon size={16} /> Share
                </button>
              )}

              {!isLive && !isClosed && (
                <button
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                  onClick={() => setShowGetRecModal(true)}
                  data-testid="btn-get-recs-draft"
                >
                  <LinkIcon size={16} /> Share &amp; Publish
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* === Featured Gold Tradesmen (reuses shared strip component) === */}
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
