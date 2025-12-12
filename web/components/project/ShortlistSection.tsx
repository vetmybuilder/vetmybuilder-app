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
            `/api/recommendations/ratings?projectId=${projectId}&offset=${offset}&limit=${limit}`
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
              .filter((s) => s.length > 0)
          )
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
            undefined
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
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
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
              className="space-y-6"
              aria-label="Top recommendations"
              data-testid="shortlist-list"
            >
              {groupsToShow.map((g) => {
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
                  displayCompanyName || g.company
                );
                const overrideScore = aggScores[key];
                const baseScore =
                  typeof g.aggScore === "number"
                    ? g.aggScore
                    : typeof r.score === "number"
                    ? r.score
                    : undefined;
                const scoreToShow =
                  typeof overrideScore === "number" &&
                  !Number.isNaN(overrideScore)
                    ? overrideScore
                    : baseScore;

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
                } else if (r.fromCommunity) {
                  recommenderText = `Community recommendation made on ${new Date(
                    r.createdAt
                  ).toLocaleDateString()}`;
                }

                return (
                  <li
                    key={g.key}
                    data-testid="shortlist-group"
                    className="relative"
                  >
                    <DeckLayers count={g.items.length} />

                    {g.extraCount > 0 && (
                      <span
                        className="absolute -top-2 -right-2 z-20 rounded-full bg-indigo-600 text-white text-[11px] leading-none px-2 py-1 shadow-md"
                        title={`${g.extraCount} more recommendation${
                          g.extraCount === 1 ? "" : "s"
                        } in this stack`}
                        data-testid="shortlist-stack-count"
                      >
                        +{g.extraCount} more
                      </span>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white/90 hover:bg-white shadow-sm hover:shadow-md transition p-3 relative z-10">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          {/* top row: name + VMB + votes */}
                          <div className="flex items-center gap-3">
                            <div
                              className="font-medium truncate flex-1 min-w-0"
                              data-testid="shortlist-company"
                            >
                              <Link
                                href={`/builders/${r.id}`}
                                className="hover:underline decoration-indigo-400/60"
                                title="Open builder profile"
                              >
                                <span
                                  data-testid="shortlist-company-name"
                                  aria-label="Company name"
                                >
                                  {displayCompanyName}
                                </span>
                              </Link>
                            </div>

                            <div className="shrink-0 flex items-center gap-3 whitespace-nowrap">
                              {false && <ScoreChip value={scoreToShow} />}
                              {/* <div
                                className="text-xs text-slate-500 tabular-nums flex items-center gap-1"
                                aria-label={`${votes} votes`}
                                data-testid="shortlist-votes"
                                title={`${votes} vote${votes === 1 ? "" : "s"}`}
                              >
                                <ThumbsUpIcon className="h-3.5 w-3.5 -mt-px" />{" "}
                                {votes}
                              </div> */}
                            </div>
                          </div>

                          {r.comment && (
                            <p
                              className="text-sm text-slate-700 mt-1 line-clamp-3"
                              data-testid="shortlist-comment"
                            >
                              {r.comment}
                            </p>
                          )}

                          {/* badges row + bottom-right meta (Google + date) */}
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chBadgeClass(
                                  vStatus as any
                                )}`}
                                title={`Companies House status${
                                  checkedAt
                                    ? ` · checked ${new Date(
                                        checkedAt
                                      ).toLocaleString()}`
                                    : ""
                                }${
                                  g.companyNumber ? ` · ${g.companyNumber}` : ""
                                }`}
                                aria-label={`Companies House status: ${vLabel}`}
                                data-testid="shortlist-badge-ch"
                                data-status={vStatus || "unknown"}
                              >
                                {chIcon(vStatus as any)}
                                <span data-testid="shortlist-badge-ch-text">
                                  {vLabel}
                                </span>
                              </span>

                              {r.fromFriend ? (
                                <span
                                  className="badge blue"
                                  data-testid="shortlist-badge-friend"
                                >
                                  Friend
                                </span>
                              ) : null}
                              {hasPhotos && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs"
                                  title="Includes photos"
                                  data-testid="shortlist-badge-photos"
                                >
                                  <CameraIcon className="h-3.5 w-3.5" />
                                  Photos
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-1 text-right">
                              {googleRating !== undefined && (
                                <GoogleRatingChip
                                  rating={googleRating}
                                  count={googleReviewsCount}
                                  placeId={googlePlaceId}
                                  className="text-xs sm:text-sm"
                                />
                              )}
                            </div>
                          </div>

                          {recommenderText && (
                            <div className="mt-2 flex items-center justify-between">
                              <div
                                className="text-xs text-slate-500"
                                aria-label="Recommender"
                                data-testid="shortlist-recommender"
                              >
                                {recommenderText}
                              </div>
                            </div>
                          )}
                        </div>

                        {!isOwner && (
                          <div className="ml-3 shrink-0 flex flex-col items-center">
                            <button
                              onClick={() => onVoteUp(r.id)}
                              disabled={
                                !canVote || hasVoted || votingId === r.id
                              }
                              className={`h-9 w-9 rounded-full grid place-items-center border transition
                                ${
                                  hasVoted
                                    ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                                    : "border-slate-200 hover:bg-slate-50"
                                }
                                ${!canVote ? "opacity-60" : ""}`}
                              title={
                                !canVote
                                  ? "Sign in to vote"
                                  : hasVoted
                                  ? "You’ve voted"
                                  : "Vote up"
                              }
                              aria-label={
                                !canVote
                                  ? "Sign in to vote"
                                  : hasVoted
                                  ? "You have voted"
                                  : "Vote up"
                              }
                              data-testid="shortlist-vote-button"
                            >
                              <ThumbsUpIcon className="h-4 w-4" />
                            </button>
                            <div
                              className="mt-1 text-xs tabular-nums text-slate-600"
                              aria-live="polite"
                              data-testid="shortlist-vote-count"
                              title={`${g.totalLikes} vote${
                                g.totalLikes === 1 ? "" : "s"
                              }`}
                            >
                              {g.totalLikes}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {shouldShowViewMore && (
              <div className="mt-3">
                <Link
                  className="btn"
                  href={viewMoreHref as string}
                  aria-label="View more recommendations"
                  data-testid="btn-shortlist-view-more"
                >
                  View more
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
