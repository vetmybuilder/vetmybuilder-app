import Link from "next/link";
import * as React from "react";
import { groupRecommendationsByCompany } from "@/utils/vmb";

/* ===== Types (mirror your page types) ===== */
export type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  phone?: string | null;
  company: string;
  rating?: number | null;
  comment: string | null;
  isAnonymous: 0 | 1;
  createdAt: string;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  likes?: number; // votes
  myLike?: 0 | 1; // I’ve voted
  score?: number; // VMB score
};

export type VerificationStatus =
  | "queued"
  | "running"
  | "verified"
  | "ambiguous"
  | "no_match"
  | "error";

export type Verification = {
  recommendationId: number;
  status: VerificationStatus;
  companyNumber?: string | null;
  companyName?: string | null; // <-- we will prefer this when present
  score?: number | null;
  sicCodes?: string[];
  checkedAt?: string;
  errorMessage?: string | null;
};

/* ===== Props ===== */
type Props = {
  title?: string;
  subtitle?: string;
  items: Recommendation[];
  total: number;
  /** Link to full shortlist page (shown when there are 3+ cards visible) */
  viewMoreHref?: string;
  /** Current user is the project owner? Hide vote button if true. */
  isOwner: boolean;
  /** Can the current user vote (non-owner + signed-in + project visible)? */
  canVote: boolean;
  /** Id of the recommendation currently being voted (to show loading/disabled) */
  votingId: number | null;
  /** Callback to vote up a specific recommendation id */
  onVoteUp: (recommendationId: number) => void;
  /** Optional flags: recommendationId -> has photos */
  recHasPhotos?: Record<number, boolean>;
  /** Optional CH verification map */
  recVerification?: Record<number, Verification>;
  /** Test id for the wrapping card */
  "data-testid"?: string;
};

/* ===== Small UI bits used inside ===== */
const ThumbsUpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M2 10h4v12H2V10zm7.5 12h6.27c1.02 0 1.94-.64 2.29-1.6l2.41-6.52a2 2 0 0 0-1.24-2.55c-.2-.07-.42-.11-.64-.11h-4.6l.62-3.02.02-.23a2 2 0 0 0-.59-1.42L13.2 4 8.9 8.29A3 3 0 0 0 8 10.4V20a2 2 0 0 0 1.5 2z" />
  </svg>
);

const CameraIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M9 3a1 1 0 0 0-.9.56L7.38 5H5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2.38l-.72-1.44A1 1 0 0 0 14 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
  </svg>
);

/** VMB score chip (shows exact value like 2.5; drops .0) */
function ScoreChip({ value }: { value?: number }) {
  if (value == null || Number.isNaN(Number(value))) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-600">
        VMB —
      </span>
    );
  }
  const n = Number(value);
  const label =
    n <= 5 ? n.toFixed(1).replace(/\.0$/, "") : String(Math.round(n));
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
      title={`VMB score: ${label}`}
      aria-label={`VMB score ${label}`}
      data-testid="shortlist-vmb-score"
    >
      VMB {label}
    </span>
  );
}

/* Companies House badge helpers */
function chLabel(status?: VerificationStatus) {
  switch (status) {
    case "verified":
      return "Verified";
    case "running":
    case "queued":
      return "Checking";
    case "ambiguous":
      return "Needs review";
    case "no_match":
      return "No match";
    case "error":
      return "Error";
    default:
      return "Checking";
  }
}
function chBadgeClass(status?: VerificationStatus) {
  switch (status) {
    case "verified":
      return "bg-green-300 text-orange-700 border-green-200 font-bold";
    case "ambiguous":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "no_match":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "error":
      return "bg-red-100 text-red-700 border-red-200";
    case "queued":
    case "running":
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}
function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm-1.2 13.3-3.1-3.1 1.4-1.4 1.7 1.7 4-4 1.4 1.4-5.4 5.4z" />
    </svg>
  );
}
function ExclamationTriangleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z" />
    </svg>
  );
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm1 11h5v-2h-2V6h-2v7z" />
    </svg>
  );
}
function chIcon(status?: VerificationStatus) {
  switch (status) {
    case "verified":
      return <CheckCircleIcon className="h-3.5 w-3.5" />;
    case "queued":
    case "running":
      return <ClockIcon className="h-3.5 w-3.5" />;
    case "ambiguous":
    case "no_match":
    case "error":
      return <ExclamationTriangleIcon className="h-3.5 w-3.5" />;
    default:
      return <ClockIcon className="h-3.5 w-3.5" />;
  }
}

/* ===== helpers ===== */
function displayRecommender(r: Recommendation) {
  if (r.isAnonymous === 1) return "Recommended by an Anonymous user";
  const name = (r.name ?? "").trim();
  return name ? `Recommended by ${name}` : "Recommended by a Guest";
}

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
  "data-testid": dataTestId = "project-shortlist",
}: Props) {
  // Use the shared utility so aggregation is consistent everywhere
  const groups = groupRecommendationsByCompany(items);

  // Show the button if there are 3 or more cards visible in this section.
  const SHOW_THRESHOLD = 3;
  const shouldShowViewMore =
    Boolean(viewMoreHref) && groups.length >= SHOW_THRESHOLD;

  // Only render up to 3 cards here; the rest go to the dedicated page
  const groupsToShow = groups.slice(0, SHOW_THRESHOLD);

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
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4" />

        {items.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="shortlist-empty">
            No builders have yet been recommended.
          </p>
        ) : (
          <>
            <ul
              className="space-y-4"
              aria-label="Top recommendations"
              data-testid="shortlist-list"
            >
              {groupsToShow.map((g) => {
                const r = g.top; // lead card in the group
                const votes = g.totalLikes; // aggregated votes
                const hasVoted = r.myLike === 1; // based on lead card
                const hasPhotos = !!recHasPhotos[r.id];
                const ver = recVerification[r.id];
                const vStatus = ver?.status;
                const vLabel = chLabel(vStatus);

                // Prefer Companies House name when present (verified/ambiguous),
                // otherwise fall back to the entered name.
                const displayCompanyName =
                  ver?.companyName &&
                  (vStatus === "verified" || vStatus === "ambiguous")
                    ? ver.companyName.trim()
                    : g.company;

                return (
                  <li key={g.key} data-testid="shortlist-group">
                    {/* “deck of cards” effect */}
                    <div className="relative">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border border-slate-200 bg-white/50 shadow-sm -z-10" />
                      <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border border-slate-200 bg-white/40 shadow -z-20" />

                      <div className="rounded-xl border border-slate-200 bg-white/80 hover:bg-white shadow-sm hover:shadow-md transition p-3">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
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
                                <ScoreChip value={g.aggScore} />
                                <div
                                  className="text-xs text-slate-500 tabular-nums flex items-center gap-1"
                                  aria-label={`${votes} votes`}
                                  data-testid="shortlist-votes"
                                  title={`${votes} vote${
                                    votes === 1 ? "" : "s"
                                  }`}
                                >
                                  <ThumbsUpIcon className="h-3.5 w-3.5 -mt-px" />{" "}
                                  {votes}
                                </div>
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

                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {/* Companies House status badge (top rec) */}
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chBadgeClass(
                                    vStatus
                                  )}`}
                                  title={`Companies House status${
                                    ver?.checkedAt
                                      ? ` · checked ${new Date(
                                          ver.checkedAt
                                        ).toLocaleString()}`
                                      : ""
                                  }${
                                    ver?.companyNumber
                                      ? ` · ${ver.companyNumber}`
                                      : ""
                                  }`}
                                  aria-label={`Companies House status: ${vLabel}`}
                                  data-testid="shortlist-badge-ch"
                                  data-status={vStatus || "unknown"}
                                >
                                  {chIcon(vStatus)}
                                  <span data-testid="shortlist-badge-ch-text">
                                    {vLabel}
                                  </span>
                                </span>

                                {r.fromFriend ? (
                                  <span
                                    className="badge blue"
                                    aria-label="From a friend"
                                    data-testid="shortlist-badge-friend"
                                  >
                                    Friend
                                  </span>
                                ) : null}
                                {r.fromCommunity ? (
                                  <span
                                    className="badge green"
                                    aria-label="From the community"
                                    data-testid="shortlist-badge-community"
                                  >
                                    Community
                                  </span>
                                ) : null}
                                {hasPhotos && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs"
                                    title="Includes photos"
                                    aria-label="Includes photos"
                                    data-testid="shortlist-badge-photos"
                                  >
                                    <CameraIcon className="h-3.5 w-3.5" />
                                    Gallery
                                  </span>
                                )}
                              </div>

                              <div
                                className="text-xs text-slate-500"
                                data-testid="shortlist-date"
                              >
                                {new Date(r.createdAt).toLocaleDateString()}
                              </div>
                            </div>

                            {/* Recommenders row + “+N more” */}
                            <div className="mt-2 flex items-center justify-between">
                              <div
                                className="text-xs text-slate-500"
                                aria-label="Recommender"
                                data-testid="shortlist-recommender"
                              >
                                {displayRecommender(r)}
                              </div>

                              {g.extraCount > 0 && (
                                <div
                                  className="text-xs text-slate-500"
                                  data-testid="shortlist-extra-count"
                                  title={`${g.extraCount} more recommendation${
                                    g.extraCount === 1 ? "" : "s"
                                  } for this builder`}
                                >
                                  +{g.extraCount} more
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Vote button — hidden for owner */}
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
                                title={`${votes} vote${votes === 1 ? "" : "s"}`}
                              >
                                {votes}
                              </div>
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
