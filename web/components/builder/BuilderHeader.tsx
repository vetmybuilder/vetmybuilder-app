// web/components/builder/BuilderHeader.tsx

import { useRouter } from "next/router";
import { ShieldCheck, ThumbsUp } from "lucide-react";
import StatPill from "@/components/StatPill";
import { GoogleRatingChip } from "@/components/GoogleRatingChip";
import {
  Builder,
  Verification,
  resolveCompanyNameForBuilder,
} from "@/types/builderTypes";

type Props = {
  builder: Builder;
  verification: Verification | null;
  user: any;
  score?: number;
  scoreErr?: string | null;
  friendCount: number;
  isOwner: boolean;
  canVote: boolean;
  voting: boolean;
  onVote: () => void;
  avatarUrl?: string | null;
  avatarInitials: string;
  updatedDisplay?: string | null;
  reviewCount?: number;
  photoCount?: number;
  hireButton?: React.ReactNode;
};

export default function BuilderHeader({
  builder,
  verification,
  user,
  score,
  scoreErr,
  friendCount,
  isOwner,
  canVote,
  voting,
  onVote,
  avatarUrl,
  avatarInitials,
  updatedDisplay,
  reviewCount,
  photoCount,
  hireButton,
}: Props) {
  const router = useRouter();

  const companyName = user
    ? resolveCompanyNameForBuilder(builder, verification)
    : "Create a free account to view company details";

  return (
    <>
      {/* Back to project */}
      {builder.project?.id && (
        <button
          type="button"
          onClick={() => router.push(`/projects/${builder.project!.id}`)}
          className="inline-flex items-center gap-2 mb-3 rounded-xl bg-slate-800/90 backdrop-blur-sm px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
        >
          <span aria-hidden>←</span>
          <span>Back to project</span>
        </button>
      )}

      {/* Header */}
      <header className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-6 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left */}
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-zinc-200 grid place-items-center text-xl font-black text-white">
              {avatarUrl ? (
                <img src={avatarUrl} alt={companyName} className="h-full w-full object-cover" />
              ) : (
                <span>{avatarInitials}</span>
              )}
            </div>

            <div className="min-w-0">
              <h2
                className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900"
                title={companyName}
                data-testid="builder-company"
              >
                {companyName}
              </h2>

              {/* badges */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {verification?.status === "verified" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-3 py-0.5 text-xs font-bold">
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </span>
                )}
                {friendCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 px-3 py-0.5 text-xs font-bold">
                    <ShieldCheck className="h-3 w-3" />
                    {friendCount === 1 ? "Shared by a friend" : "Shared by friends"}
                  </span>
                )}
                {builder.fromCommunity ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 text-zinc-700 px-3 py-0.5 text-xs font-bold">
                    Community recommendation
                  </span>
                ) : null}
                {updatedDisplay && (
                  <span className="text-xs text-zinc-400">
                    Member since {new Date(updatedDisplay).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>

              {/* stats */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {user ? (
                  <>
                    {verification?.googleRating != null && !Number.isNaN(Number(verification.googleRating)) && (
                      <GoogleRatingChip
                        rating={verification.googleRating}
                        count={verification.googleReviewsCount ?? null}
                        placeId={verification.googlePlaceId ?? null}
                      />
                    )}
                    {reviewCount != null && (
                      <StatPill
                        testId="builder-reviews"
                        icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-rose-400"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd"/></svg>}
                        label="Reviews"
                        value={reviewCount}
                      />
                    )}
                    {photoCount != null && (
                      <StatPill
                        testId="builder-photos"
                        icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-sky-400"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>}
                        label="Photos"
                        value={photoCount}
                      />
                    )}
                    {(score ?? builder?.score) != null && (
                      <StatPill
                        testId="builder-score"
                        icon={<svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-red-500"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>}
                        label="Trust score"
                        value={Math.round(Number((score ?? builder?.score) ?? 0))}
                      />
                    )}
                  </>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-zinc-200 text-zinc-400">
                    Trust score —
                  </span>
                )}
              </div>

              {/* Hire button — below stats, left-aligned */}
              {hireButton && (
                <div className="mt-3">{hireButton}</div>
              )}
            </div>
          </div>

          {/* Right (vote) */}
          <div className="flex sm:flex-col items-start sm:items-end gap-2">
            {canVote && (
              <button
                type="button"
                className={[
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-sm border transition",
                  builder.myLike === 1
                    ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
                    : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                  voting ? "opacity-70 cursor-wait" : "",
                ].join(" ")}
                disabled={!user || builder.myLike === 1 || voting || !canVote}
                onClick={onVote}
                data-testid="btn-vote-up"
                aria-pressed={builder.myLike === 1}
              >
                <ThumbsUp className={`h-4 w-4 ${builder.myLike === 1 ? "fill-rose-500 text-rose-500" : ""}`} />
                <span>{builder.myLike === 1 ? "You’ve voted" : "Vote up"}</span>
              </button>
            )}
            {scoreErr && <div className="text-xs text-red-500">{scoreErr}</div>}
          </div>
        </div>
      </header>
    </>
  );
}
