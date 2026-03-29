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
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          <span aria-hidden>←</span>
          <span>Back to this project</span>
        </button>
      )}

      {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur px-4 py-4 sm:px-6 sm:py-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left */}
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-2xl bg-slate-200 grid place-items-center text-lg font-semibold text-white">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={companyName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{avatarInitials}</span>
              )}
            </div>

            <div className="min-w-0">
              <h2
                className="truncate text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900"
                title={companyName}
                data-testid="builder-company"
              >
                {companyName}
              </h2>

              {/* badges */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                {verification?.status === "verified" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                    <span aria-hidden>✅</span>
                    Companies House verified
                  </span>
                )}

                {friendCount > 0 && (
                  <Badge color="indigo">
                    {friendCount === 1
                      ? "Shared by a friend"
                      : "Shared by friends"}
                  </Badge>
                )}

                {builder.fromCommunity ? (
                  <Badge color="green">Community recommendation</Badge>
                ) : null}

                {updatedDisplay && (
                  <span className="text-xs text-slate-500">
                    Updated{" "}
                    {new Date(updatedDisplay).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>

              {/* stats */}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs sm:text-sm text-neutral-700">
                {user ? (
                  <>
                    <span>
                      <ScoreChip value={score ?? builder?.score} />
                    </span>

                    {verification?.googleRating != null &&
                      !Number.isNaN(Number(verification.googleRating)) && (
                        <GoogleRatingChip
                          rating={verification.googleRating}
                          count={verification.googleReviewsCount ?? null}
                          placeId={verification.googlePlaceId ?? null}
                        />
                      )}
                  </>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium border border-slate-200 text-slate-500">
                    VMB —
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right (vote) */}
          <div className="flex sm:flex-col items-start sm:items-end">
            {canVote && (
              <button
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium shadow-sm border",
                  builder.myLike === 1
                    ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-default"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50",
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

            {scoreErr && (
              <div className="mt-2 text-xs text-rose-600">{scoreErr}</div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
