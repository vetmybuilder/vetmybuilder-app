// web/components/builder/BuilderHeader.tsx

import { useRouter } from "next/router";
import Badge from "./Badge";
import ScoreChip from "./ScoreChip";
import ThumbsUpIcon from "./ThumbsUpIcon";
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
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors mb-3"
        >
          <span aria-hidden>←</span>
          <span>Back to this project</span>
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
                    ✅ Companies House verified
                  </span>
                )}
                {friendCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 px-3 py-0.5 text-xs font-bold">
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
                    Updated {new Date(updatedDisplay).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
              </div>

              {/* stats */}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {user ? (
                  <>
                    <ScoreChip value={score ?? builder?.score} />
                    {verification?.googleRating != null && !Number.isNaN(Number(verification.googleRating)) && (
                      <GoogleRatingChip
                        rating={verification.googleRating}
                        count={verification.googleReviewsCount ?? null}
                        placeId={verification.googlePlaceId ?? null}
                      />
                    )}
                  </>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-zinc-200 text-zinc-400">
                    VMB —
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right (vote) */}
          <div className="flex sm:flex-col items-start sm:items-end gap-2">
            {canVote && (
              <button
                className={[
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-sm transition",
                  builder.myLike === 1
                    ? "bg-red-50 border border-red-200 text-red-500 cursor-default"
                    : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                  voting ? "opacity-70 cursor-wait" : "",
                ].join(" ")}
                disabled={!user || builder.myLike === 1 || voting || !canVote}
                onClick={onVote}
                data-testid="btn-vote-up"
                aria-pressed={builder.myLike === 1}
              >
                <ThumbsUpIcon className="h-4 w-4" />
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
