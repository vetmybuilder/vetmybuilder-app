import Link from "next/link";
import * as React from "react";
import { ThumbsUpIcon, CameraIcon } from "@/components/ui/Icons";
import { ScoreChip, chLabel, chBadgeClass, chIcon } from "@/components/ui/vmb";
import type { Recommendation, Verification } from "@/types/vmb";
import {
  groupRecommendationsByCompany,
  type CompanyGroup,
  normalizedCompanyKey,
} from "@/utils/vmb";
import { Link as LinkIcon } from "lucide-react";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";

/** Normalise raw score (0-~15) to 0-100. Mirrors server-side normaliseScore. */
function normaliseScore(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  // If already normalised (from ratings endpoint), pass through
  if (raw > 15) return Math.min(100, Math.round(raw));
  // Raw score: apply logarithmic curve (divisor=5, matches server)
  return Math.min(100, Math.max(0, Math.round(100 * (1 - Math.exp(-raw / 5)))));
}

/* ===== Props (component-local API) ===== */
type Props = {
  title?: string;
  subtitle?: string;
  items: Recommendation[];
  total: number;
  viewMoreHref?: string;
  isOwner: boolean;
  canVote: boolean;
  votingId: number | null;
  onVoteUp: (recommendationId: number) => void;
  recHasPhotos?: Record<number, boolean>;
  recVerification?: Record<number, Verification>;
  /** Optional CTA for owners when no recs yet */
  showOwnerShareCta?: boolean;
  onOwnerShareClick?: () => void;
  /** Project id so we can fetch canonical VMB aggregate scores */
  projectId?: number;
  /**
   * Owner-only: callback when the homeowner clicks "Hire" on a recommendation
   * card. Receives the top recommendation's id and the display name. The
   * parent owns the modal and the API call.
   */
  onHire?: (recommendationId: number, displayName: string) => void;
  /**
   * Owner-only: set of recommendation ids that have already been hired for
   * this project. Used to render the Hire button as "Hired" + disabled.
   */
  hiredRecommendationIds?: Set<number>;
  "data-testid"?: string;
};

/* ===== Component ===== */
export default function ShortlistSection({
  title = "Top recommendations",
  subtitle = "Top recommendations, grouped by company (VMB score).",
  items,
  total,
  viewMoreHref,
  isOwner,
  canVote,
  votingId,
  onVoteUp,
  recHasPhotos = {},
  recVerification = {},
  showOwnerShareCta = false,
  onOwnerShareClick,
  projectId,
  onHire,
  hiredRecommendationIds,
  "data-testid": dataTestId = "project-shortlist",
}: Props) {
  // 🔹 Single source of truth for grouping + base agg scores
  const groups = React.useMemo(() => {
    const base = groupRecommendationsByCompany(items) as Array<
      CompanyGroup<Recommendation> & {
        companyNumber?: string | null;
      }
    >;

    // Enrich each group with CH number (for display only)
    return base.map((g) => {
      const top: any = g.top;
      const ver = recVerification[top.id];

      // Fallback: if there's no verification map entry yet, use CH fields from the ratings item
      const num =
        (
          ver?.companyNumber ||
          (typeof top.chCompanyNumber === "string" ? top.chCompanyNumber : "")
        ).trim() || null;

      return { ...g, companyNumber: num };
    });
  }, [items, recVerification]);


  const SHOW_THRESHOLD = 3;
  const shouldShowViewMore =
    Boolean(viewMoreHref) && groups.length >= SHOW_THRESHOLD;
  const groupsToShow = groups.slice(0, SHOW_THRESHOLD);

  /* Little helper to render decorative stacked “tabs” behind the main card */
  function DeckLayers({ count }: { count: number }) {
    const layers = Math.min(Math.max(count - 1, 0), 3);
    if (layers === 0) return null;
    const palette = ["bg-emerald-100", "bg-lime-100", "bg-slate-100"];
    return (
      <>
        {Array.from({ length: layers }).map((_, idx) => {
          const i = layers - idx;
          const dx = i * 10;
          const dy = i * 8;
          const rot = i % 2 === 0 ? -2 : 2;
          const color = palette[(idx + 1) % palette.length];
          return (
            <div
              key={`deck-${idx}`}
              className={`pointer-events-none absolute inset-0 rounded-xl border border-slate-200 ${color} shadow-sm -z-10`}
              style={{
                transform: `translate(${dx}px, -${dy}px) rotate(${rot}deg)`,
              }}
              aria-hidden="true"
            >
              <div className="h-2 w-[55%] rounded-t-xl bg-white/70 border-b border-slate-200" />
            </div>
          );
        })}
      </>
    );
  }

  return (
    <aside
      className="lg:col-span-6"
      aria-labelledby="shortlist-heading"
      data-testid={dataTestId}
    >
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="shortlist-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              {title}
            </h2>
            {/* <p className="mt-1 text-sm text-slate-500">{subtitle}</p> */}
          </div>
        </div>

        <div className="mt-4" />

        {items.length === 0 ? (
          <div data-testid="shortlist-empty">
            <p className="text-sm text-slate-500">
              No builders have yet been recommended by a friend or neighbours.
            </p>

            {isOwner && showOwnerShareCta && onOwnerShareClick && (
              <div className="mt-4 space-y-1">
                <button
                  type="button"
                  onClick={onOwnerShareClick}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-600"
                  data-testid="btn-shortlist-share-publish"
                >
                  <LinkIcon size={18} />
                  Share &amp; Publish
                </button>
                <p className="text-xs text-slate-500 max-w-md">
                  Share this project with friends or neighbours to start seeing
                  recommendations from vetted tradespeople.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <ul
              className="space-y-3"
              aria-label="Top recommendations"
              data-testid="shortlist-list"
            >
              {groupsToShow.map((g, idx) => {
                const r: any = g.top;
                const votes = g.totalLikes;
                const hasVoted = r.myLike === 1;
                const hasPhotos =
                  recHasPhotos?.[r.id] === true ||
                  (Array.isArray(r.photos) && r.photos.length > 0);

                const ver = recVerification[r.id];

                // 🔑 Derive verification fields:
                const vStatus = (ver?.status ?? r.chStatus ?? undefined) as
                  | Verification["status"]
                  | undefined;

                const vCompanyName =
                  (ver?.companyName as string | undefined) ??
                  (r.chCompanyName as string | undefined) ??
                  undefined;

                const checkedAt =
                  (ver?.checkedAt as string | undefined) ??
                  (r.chCheckedAt as string | undefined) ??
                  undefined;

                const vLabel = chLabel(vStatus as any);

                const displayCompanyName =
                  vCompanyName &&
                  (vStatus === "verified" || vStatus === "ambiguous")
                    ? vCompanyName.trim()
                    : g.company;

                // 🔹 Decide which score to show:
                // 1) canonical agg from ratings endpoint (per company)
                // 2) fallback to local group aggScore
                // 3) fallback to top recommendation's raw score
                // Score comes directly from the recommendations endpoint
                // (already normalised 0-100 with full scoring data).
                // g.aggScore = max across recs for this company.
                const scoreToShow = typeof g.aggScore === "number" && g.aggScore > 0
                  ? g.aggScore
                  : typeof r.score === "number"
                    ? r.score
                    : undefined;

                // 🔹 Google rating only comes from the verification map (not from ratings)
                const verAny = ver as any;
                const googleRating =
                  typeof verAny?.googleRating === "number"
                    ? verAny.googleRating
                    : undefined;
                const googleReviewsCount =
                  typeof verAny?.googleReviewsCount === "number"
                    ? verAny.googleReviewsCount
                    : undefined;
                const googlePlaceId: string | undefined =
                  (verAny?.googlePlaceId as string | null) || undefined;

                // Recommender relation: generic text only
                let recommenderText = "";

                if (r.fromFriend) {
                  recommenderText = "Recommended via your friend.";
                } else {
                  const createdDate = r.createdAt
                    ? new Date(r.createdAt).toLocaleDateString()
                    : new Date().toLocaleDateString();

                  recommenderText = `Community recommendation made on ${createdDate}`;
                }

                return (
                  <li
                    key={g.key}
                    data-testid="shortlist-group"
                    className="relative bg-white rounded-xl border border-slate-100 shadow-sm p-4 animate-slide-in-left"
                    style={{ animationDelay: `${idx * 0.08}s` }}
                  >
                    {g.extraCount > 0 && (
                      <span
                        className="absolute -top-2 right-2 z-20 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold leading-none px-2 py-1"
                        title={`${g.extraCount} more recommendation${g.extraCount === 1 ? "" : "s"}`}
                        data-testid="shortlist-stack-count"
                      >
                        +{g.extraCount} more
                      </span>
                    )}

                    <div className="flex gap-3.5">
                      {/* Score circle */}
                      <div
                        className={`flex-shrink-0 h-12 w-12 rounded-full flex flex-col items-center justify-center text-white select-none shadow-md ${scoreColor(scoreToShow)}`}
                        aria-label={`Score: ${typeof scoreToShow === "number" ? scoreToShow : "—"}`}
                        data-testid="shortlist-score-circle"
                      >
                        <span className="text-base font-extrabold leading-none">
                          {typeof scoreToShow === "number" ? scoreToShow : "—"}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap" data-testid="shortlist-company">
                          <Link
                            href={
                              projectId
                                ? `/builders/${r.id}?projectId=${projectId}`
                                : `/builders/${r.id}`
                            }
                            className="font-bold text-base sm:text-sm text-slate-900 hover:underline decoration-slate-300"
                            title="Open builder profile"
                          >
                            <span data-testid="shortlist-company-name" aria-label="Company name">
                              {displayCompanyName}
                            </span>
                          </Link>
                        </div>

                        {/* Trust signals — inline, pipe-separated */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5" data-testid="shortlist-signals">
                          {googleRating !== undefined && (
                            <>
                              <GoogleRatingChip
                                rating={googleRating}
                                count={googleReviewsCount}
                                placeId={googlePlaceId}
                                className="text-sm sm:text-[11px]"
                              />
                              <span className="text-slate-300 text-sm sm:text-[11px]">&middot;</span>
                            </>
                          )}

                          {(vStatus === "verified" || vStatus === "ambiguous") ? (
                            <span
                              className="text-xs sm:text-[10px] font-semibold text-white bg-emerald-500 px-1.5 py-0.5 rounded"
                              data-testid="shortlist-badge-ch"
                              data-status={vStatus}
                            >
                              <span data-testid="shortlist-badge-ch-text">Verified</span>
                            </span>
                          ) : (
                            <span
                              className="text-xs sm:text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded"
                              data-testid="shortlist-badge-ch"
                              data-status={vStatus || "unknown"}
                            >
                              <span data-testid="shortlist-badge-ch-text">{vLabel}</span>
                            </span>
                          )}

                          {hasPhotos && (
                            <>
                              <span className="text-slate-300 text-sm sm:text-[11px]">&middot;</span>
                              <span className="text-xs sm:text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded" data-testid="shortlist-badge-photos">
                                Photos
                              </span>
                            </>
                          )}

                          {r.fromFriend ? (
                            <>
                              <span className="text-slate-300 text-sm sm:text-[11px]">&middot;</span>
                              <span className="text-xs sm:text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded" data-testid="shortlist-badge-friend">
                                Friend
                              </span>
                            </>
                          ) : null}
                        </div>

                        {r.comment && (
                          <p className="text-sm sm:text-xs text-slate-500 mt-2 leading-relaxed line-clamp-3" data-testid="shortlist-comment">
                            &ldquo;{r.comment}&rdquo;
                          </p>
                        )}

                        {recommenderText ? (
                          <p className="mt-2 text-xs sm:text-[10px] text-slate-400" aria-label="Recommender" data-testid="shortlist-recommender">
                            {recommenderText}
                          </p>
                        ) : null}

                        <div className="mt-2 flex items-center justify-between">
                          {isOwner && onHire && (() => {
                            const alreadyHired = hiredRecommendationIds?.has(r.id);
                            return (
                              <button
                                type="button"
                                onClick={() => onHire(r.id, displayCompanyName || "Tradesman")}
                                disabled={alreadyHired}
                                data-testid={`shortlist-hire-${r.id}`}
                                className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm sm:text-[11px] font-bold transition-colors ${
                                  alreadyHired
                                    ? "bg-emerald-100 text-emerald-700 cursor-default"
                                    : "bg-slate-900 text-white hover:bg-slate-800"
                                }`}
                              >
                                {alreadyHired ? "Hired" : "Hire"}
                              </button>
                            );
                          })()}

                          {!isOwner && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onVoteUp(r.id)}
                                disabled={!canVote || hasVoted || votingId === r.id}
                                className={`h-8 w-8 rounded-full grid place-items-center border transition
                                  ${hasVoted ? "bg-red-50 border-red-200 text-red-500 cursor-default" : "border-slate-200 hover:bg-slate-50"}
                                  ${!canVote ? "opacity-60" : ""}`}
                                title={!canVote ? "Sign in to vote" : hasVoted ? "You’ve voted" : "Vote up"}
                                aria-label={!canVote ? "Sign in to vote" : hasVoted ? "You have voted" : "Vote up"}
                                data-testid="shortlist-vote-button"
                              >
                                <ThumbsUpIcon className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-[11px] tabular-nums text-slate-500" data-testid="shortlist-vote-count">
                                {g.totalLikes}
                              </span>
                            </div>
                          )}

                        </div>

                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {shouldShowViewMore && (
              <div className="mt-4">
                <Link
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
                  href={viewMoreHref as string}
                  aria-label="View more recommendations"
                  data-testid="btn-shortlist-view-more"
                >
                  View all recommendations &rarr;
                </Link>
              </div>
            )}
          </>
        )}
      </div>

    </aside>
  );
}

/* ---- helpers ---- */

/** Score-based colour for the circle: green 55+, amber 30-54, red <30, grey if unknown */
function scoreColor(score: number | undefined): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "bg-slate-400";
  if (score >= 55) return "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25";
  if (score >= 30) return "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/25";
  return "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25";
}
