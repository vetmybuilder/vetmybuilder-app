import * as React from "react";
import StatusBadge from "@/components/StatusBadge";
import ShortlistSection from "@/components/project/ShortlistSection";
import {
  Pencil,
  XCircle,
  Archive as ArchiveIcon,
  Link as LinkIcon,
  Rocket,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Flash } from "./useProjectView";
import { useApi } from "@/utils/api";
import FeaturedSimpleCard from "@/components/tradesmen/FeaturedSimpleCard";
import { FeaturedTradesman } from "@/components/tradesmen/GoldTradesmanCard";
import SpotlightStrip from "@/components/tradesmen/SpotlightStrip";

type VM = ReturnType<typeof import("./useProjectView").useProjectView>;

export default function OwnerProjectView({ vm }: { vm: VM }) {
  const {
    project,
    backHref,
    isLive,
    isClosed,
    isArchived,
    canPublish,
    copyInvite,
    copyingInvite,
    onPublish,
    onArchive,
    onUnarchive,
    onCloseProject,
    recs,
    recTotal,
    recsErr,
  } = vm;

  const api = useApi();
  const [featured, setFeatured] = React.useState<FeaturedTradesman[]>([]);
  const [featuredErr, setFeaturedErr] = React.useState<string | null>(null);
  const [featuredLoading, setFeaturedLoading] = React.useState(false);

  // pagination for featured (no horizontal scroller)
  const [page, setPage] = React.useState(0); // 0-based
  const pageSize = 3;

  React.useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setFeaturedLoading(true);
        setFeaturedErr(null);
        const url = `/api/tradesmen/featured?onlyGold=true&limit=30&projectId=${encodeURIComponent(
          String(project.id)
        )}`;
        const res = await api.get?.(url);
        const data =
          res && typeof (res as any).json === "function"
            ? await (res as any).json()
            : (res as any)?.data ?? res;
        const items: FeaturedTradesman[] = Array.isArray(data?.items)
          ? data.items
          : [];
        if (!cancelled) {
          setFeatured(items);
          setPage(0); // reset to first set
        }
      } catch (e: any) {
        if (!cancelled)
          setFeaturedErr(e?.message || "Failed to load featured tradesmen");
      } finally {
        if (!cancelled) setFeaturedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.id, api]);

  const totalPages = Math.max(1, Math.ceil((featured?.length || 0) / pageSize));
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;
  const start = page * pageSize;
  const visible = featured.slice(start, start + pageSize);

  if (!project) return null;

  return (
    <>
      {/* Header (unchanged) */}
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
              {project.name}
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
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Project actions
            </span>
            <div
              className="flex flex-wrap gap-2"
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
              {canPublish && (
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
                  onClick={onPublish}
                  data-testid="btn-publish"
                >
                  <Rocket size={16} /> Publish
                </button>
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
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
                  onClick={copyInvite}
                  disabled={copyingInvite}
                  data-testid="btn-copy-invite"
                >
                  <LinkIcon size={16} />{" "}
                  {copyingInvite ? "Copying…" : "Copy invite"}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* === Featured (max 3, arrows, no horizontal scroller) === */}
      <section
        aria-label="Featured Gold Tradesmen"
        data-testid="featured-gold"
        className="mb-6"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
            🏆 Featured Gold Tradesmen
          </h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!canPrev}
              aria-label="Previous"
              className="rounded-full p-2 border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={!canNext}
              aria-label="Next"
              className="rounded-full p-2 border border-slate-200 bg-white shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {featuredLoading && (
          <p className="text-sm text-slate-500">Loading featured…</p>
        )}
        {featuredErr && <p className="text-sm text-rose-600">{featuredErr}</p>}

        {!featuredLoading && !featuredErr && featured.length === 0 && (
          <p className="text-sm text-slate-500">No Gold tradesmen yet.</p>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {visible.map((t) => (
              <FeaturedSimpleCard
                key={t.builderId}
                name={t.companyName || t.displayName || "Tradesman"}
                // initials-only card: no img prop
                onClick={() =>
                  (window.location.href = `/tradesmen/${t.builderId}`)
                }
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-2 text-center text-xs text-slate-500">
            Page {page + 1} of {totalPages}
          </div>
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
            <h2 className="mb-3 text-base font-semibold tracking-tight">
              ✨ Spotlight tradesmen
            </h2>
            {/* Cast to string to satisfy SpotlightStrip's prop type */}
            <SpotlightStrip projectId={String(project.id)} />
          </section>
        </div>
      </div>
    </>
  );
}
