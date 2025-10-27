import Link from "next/link";
import * as React from "react";

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
  companyName?: string | null; // preferred display name when present
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
  viewMoreHref?: string;
  isOwner: boolean;
  canVote: boolean;
  votingId: number | null;
  onVoteUp: (recommendationId: number) => void;
  recHasPhotos?: Record<number, boolean>;
  recVerification?: Record<number, Verification>;
  "data-testid"?: string;
};

/* ===== Small UI bits ===== */
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
function normalizeName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  // Group by CH number (unique) else normalized name
  const groups = React.useMemo(() => {
    type Builder = {
      key: string;
      company: string;
      companyNumber?: string | null;
      items: Recommendation[];
    };
    const map = new Map<string, Builder>();
    for (const r of items) {
      const ver = recVerification[r.id];
      const num = (ver?.companyNumber || "").trim() || null;
      const candidateName = (ver?.companyName || r.company || "").trim();
      const nameKey = normalizeName(candidateName);
      const key = num ? `#${num}` : `n:${nameKey}`;
      const g =
        map.get(key) ||
        ({
          key,
          company: candidateName,
          companyNumber: num,
          items: [],
        } as Builder);
      if (!map.has(key)) map.set(key, g);
      // prefer canonical name/number when we later discover them
      if (ver?.companyName) g.company = ver.companyName;
      if (!g.companyNumber && num) g.companyNumber = num;
      g.items.push(r);
    }
    const out = Array.from(map.values()).map((g) => {
      const top = [...g.items].sort((a, b) => {
        const as = a.score ?? -Infinity;
        const bs = b.score ?? -Infinity;
        if (as !== bs) return bs - as;
        const al = a.likes ?? 0;
        const bl = b.likes ?? 0;
        if (al !== bl) return bl - al;
        return +new Date(b.createdAt) - +new Date(a.createdAt);
      })[0];
      const totalLikes = g.items.reduce((s, it) => s + (it.likes ?? 0), 0);
      const scores = g.items
        .map((x) => x.score)
        .filter((x): x is number => x != null);
      const aggScore =
        scores.length > 0
          ? Number(
              (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
            )
          : undefined;
      return {
        key: g.key,
        company: g.company,
        companyNumber: g.companyNumber,
        top,
        totalLikes,
        aggScore,
        extraCount: g.items.length - 1,
        items: g.items,
      };
    });
    out.sort((a, b) => {
      const as = a.aggScore ?? -Infinity;
      const bs = b.aggScore ?? -Infinity;
      if (as !== bs) return bs - as;
      if (a.totalLikes !== b.totalLikes) return b.totalLikes - a.totalLikes;
      return +new Date(b.top.createdAt) - +new Date(a.top.createdAt);
    });
    return out;
  }, [items, recVerification]);

  const SHOW_THRESHOLD = 3;
  const shouldShowViewMore =
    Boolean(viewMoreHref) && groups.length >= SHOW_THRESHOLD;
  const groupsToShow = groups.slice(0, SHOW_THRESHOLD);

  /* Little helper to render decorative stacked “tabs” behind the main card */
  function DeckLayers({ count }: { count: number }) {
    // show up to 3 decorative layers behind the main card
    const layers = Math.min(Math.max(count - 1, 0), 3);
    if (layers === 0) return null;

    // back-to-front colors (subtle, on-brand-ish)
    const palette = ["bg-emerald-100", "bg-lime-100", "bg-slate-100"];

    return (
      <>
        {Array.from({ length: layers }).map((_, idx) => {
          // farthest layer first
          const i = layers - idx; // 1..layers
          const dx = i * 10; // px right
          const dy = i * 8; // px up (negative)
          const rot = i % 2 === 0 ? -2 : 2; // a tiny tilt
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
              {/* top “tab” strip for extra card feel */}
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
              className="space-y-6"
              aria-label="Top recommendations"
              data-testid="shortlist-list"
            >
              {groupsToShow.map((g) => {
                const r = g.top;
                const votes = g.totalLikes;
                const hasVoted = r.myLike === 1;
                const hasPhotos = !!recHasPhotos[r.id];
                const ver = recVerification[r.id];
                const vStatus = ver?.status;
                const vLabel = chLabel(vStatus);
                const displayCompanyName =
                  ver?.companyName &&
                  (vStatus === "verified" || vStatus === "ambiguous")
                    ? ver.companyName.trim()
                    : g.company;

                return (
                  <li
                    key={g.key}
                    data-testid="shortlist-group"
                    className="relative"
                  >
                    {/* Decorative stacked deck behind the main card */}
                    <DeckLayers count={g.items.length} />

                    {/* +N pill */}
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
                    {/* Main card */}
                    <div className="rounded-xl border border-slate-200 bg-white/90 hover:bg-white shadow-sm hover:shadow-md transition p-3 relative z-10">
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
                                title={`${votes} vote${votes === 1 ? "" : "s"}`}
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
                              {/* CH badge */}
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
                                  g.companyNumber ? ` · ${g.companyNumber}` : ""
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
                                  data-testid="shortlist-badge-friend"
                                >
                                  Friend
                                </span>
                              ) : null}
                              {r.fromCommunity ? (
                                <span
                                  className="badge green"
                                  data-testid="shortlist-badge-community"
                                >
                                  Community
                                </span>
                              ) : null}
                              {hasPhotos && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs"
                                  title="Includes photos"
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

                          {/* Recommender + “+N more” */}
                          <div className="mt-2 flex items-center justify-between">
                            <div
                              className="text-xs text-slate-500"
                              aria-label="Recommender"
                              data-testid="shortlist-recommender"
                            >
                              {displayRecommender(r)}
                            </div>
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
