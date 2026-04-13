import Link from "next/link";
import * as React from "react";
import { ThumbsUpIcon, CameraIcon } from "@/components/ui/Icons";
import { ScoreChip, chLabel, chBadgeClass, chIcon } from "@/components/ui/vmb";
import type { Recommendation, Verification } from "@/types/vmb";
import { useApi } from "@/utils/api";
import {
  groupRecommendationsByCompany,
  type CompanyGroup,
  getAggregateVmbForCompany,
  normalizedCompanyKey,
  type FetchRecsFn,
} from "@/utils/vmb";
import { Link as LinkIcon } from "lucide-react";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";

/** Normalise raw score (0-~15) to 0-100. Mirrors server-side normaliseScore. */
function normaliseScore(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  // If already normalised (from ratings endpoint), pass through
  if (raw > 15) return Math.min(100, Math.round(raw));
  // Raw score: apply logarithmic curve
  return Math.min(100, Math.max(0, Math.round(100 * (1 - Math.exp(-raw / 6)))));
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
  const api = useApi();

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

  // 🔹 Canonical aggregate scores from /api/recommendations/ratings
  const [aggScores, setAggScores] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!projectId || items.length === 0) {
      setAggScores({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const ratingsFetcher: FetchRecsFn = async ({
          projectId,
          offset = 0,
          limit = 250,
        }) => {
          const { data } = await api.get(
            `/api/recommendations/ratings?projectId=${projectId}&offset=${offset}&limit=${limit}`,
          );

          const list =
            (data?.items || []).map((it: any) => ({
              id: it.id,
              company: it.company,
              score: it.score,
            })) ?? [];

          const total = Number.isFinite(data?.total)
            ? (data.total as number)
            : list.length;

          return { items: list, total };
        };

        const companyNames = Array.from(
          new Set(
            items
              .map((r) => (r.company || "").trim())
              .filter((s) => s.length > 0),
          ),
        );

        const scores: Record<string, number> = {};
        const seenKeys = new Set<string>();

        for (const name of companyNames) {
          const norm = normalizedCompanyKey(name);
          if (seenKeys.has(norm)) continue;
          seenKeys.add(norm);

          const agg = await getAggregateVmbForCompany(
            ratingsFetcher,
            projectId,
            name,
            undefined,
          );

          if (typeof agg === "number" && !Number.isNaN(agg)) {
            scores[norm] = agg;
          }
        }

        if (!cancelled) {
          setAggScores(scores);
        }
      } catch {
        if (!cancelled) {
          // If ratings endpoint fails for any reason, fall back to local scores
          setAggScores({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, projectId, items]);

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
                const key = normalizedCompanyKey(
                  displayCompanyName || g.company,
                );
                const overrideScore = aggScores[key];
                const baseScore =
                  typeof g.aggScore === "number"
                    ? g.aggScore
                    : typeof r.score === "number"
                      ? r.score
                      : undefined;
                const scoreToShow = normaliseScore(
                  typeof overrideScore === "number" &&
                  !Number.isNaN(overrideScore)
                    ? overrideScore
                    : baseScore
                );

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
                        className="absolute -top-2 right-2 z-20 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold leading-none px-2 py-1"
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
                            className="font-bold text-sm text-slate-900 hover:underline decoration-slate-300"
                            title="Open builder profile"
                          >
                            <span data-testid="shortlist-company-name" aria-label="Company name">
                              {displayCompanyName}
                            </span>
                          </Link>
                        </div>

                        {/* Trust signals — inline, pipe-separated */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1" data-testid="shortlist-signals">
                          {googleRating !== undefined && (
                            <>
                              <GoogleRatingChip
                                rating={googleRating}
                                count={googleReviewsCount}
                                placeId={googlePlaceId}
                                className="text-[11px]"
                              />
                              <span className="text-slate-300 text-[11px]">&middot;</span>
                            </>
                          )}

                          {(vStatus === "verified" || vStatus === "ambiguous") ? (
                            <span
                              className="text-[10px] font-semibold text-white bg-emerald-500 px-1.5 py-0.5 rounded"
                              data-testid="shortlist-badge-ch"
                              data-status={vStatus}
                            >
                              <span data-testid="shortlist-badge-ch-text">Verified</span>
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded"
                              data-testid="shortlist-badge-ch"
                              data-status={vStatus || "unknown"}
                            >
                              <span data-testid="shortlist-badge-ch-text">{vLabel}</span>
                            </span>
                          )}

                          {hasPhotos && (
                            <>
                              <span className="text-slate-300 text-[11px]">&middot;</span>
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded" data-testid="shortlist-badge-photos">
                                Photos
                              </span>
                            </>
                          )}

                          {r.fromFriend ? (
                            <>
                              <span className="text-slate-300 text-[11px]">&middot;</span>
                              <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded" data-testid="shortlist-badge-friend">
                                Friend
                              </span>
                            </>
                          ) : null}
                        </div>

                        {r.comment && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-3" data-testid="shortlist-comment">
                            &ldquo;{r.comment}&rdquo;
                          </p>
                        )}

                        <div className="mt-2 flex items-center justify-between">
                          {recommenderText && (
                            <p className="text-[10px] text-slate-400" aria-label="Recommender" data-testid="shortlist-recommender">
                              {recommenderText}
                            </p>
                          )}

                          {isOwner && onHire && (() => {
                            const alreadyHired = hiredRecommendationIds?.has(r.id);
                            return (
                              <button
                                type="button"
                                onClick={() => onHire(r.id, displayCompanyName || "Tradesman")}
                                disabled={alreadyHired}
                                data-testid={`shortlist-hire-${r.id}`}
                                className={`inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
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

/** Score-based colour for the circle: green 70+, amber 40-69, red <40, grey if unknown */
function scoreColor(score: number | undefined): string {
  if (typeof score !== "number" || Number.isNaN(score)) return "bg-slate-400";
  if (score >= 70) return "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25";
  if (score >= 40) return "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/25";
  return "bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25";
}
