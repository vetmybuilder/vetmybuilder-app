// web/components/project/PreviewMatchesPanel.tsx
//
// Renders the "your local matches" preview that sits as the final step
// of the post-job wizard. Used by both the desktop wizard at
// /projects/new and the PostJobMobile counterpart so the cards stay
// identical across viewports.
//
// Cards are read-only previews - the message buttons are locked behind
// the auth wall on the next step. The "Sign up to message them" CTA
// lives in the wizard footer (NewProject's onCreate path), not in this
// component.

import { Search, Sparkles, Star } from "lucide-react";
import type { PreviewMatch } from "@/pages/projects/new";

type Props = {
  matches: PreviewMatch[] | null;
  loading: boolean;
  err: string | null;
  isGuest: boolean;
};

function MiniStars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={12}
          height={12}
          className={
            i <= Math.round(n)
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-slate-300"
          }
        />
      ))}
    </span>
  );
}

function MatchCard({ match, isGuest }: { match: PreviewMatch; isGuest: boolean }) {
  const initials = (match.company || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <article
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex sm:flex-col"
      data-testid={`preview-match-${match.id}`}
    >
      {/* Photo: square thumbnail on mobile (left side), 4:3 hero on desktop (top) */}
      <div className="relative shrink-0 w-28 sm:w-auto sm:aspect-[4/3] bg-slate-100">
        {match.photoUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${match.photoUrl})` }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-white text-[20px] sm:text-[28px] font-extrabold"
            style={{ background: "linear-gradient(135deg,#a5b4fc,#6366f1)" }}
          >
            {initials}
          </div>
        )}
        {!match.isLocal && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/95 text-[10px] font-extrabold text-slate-700">
            Nearby
          </span>
        )}
      </div>

      <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 flex-1 flex flex-col min-w-0">
        <h3 className="text-[14px] sm:text-[15px] font-extrabold text-slate-900 truncate">
          {match.company}
        </h3>
        {match.trade && (
          <p className="text-[11.5px] text-slate-500 truncate mt-0.5">
            {match.trade}
          </p>
        )}
        {match.location && (
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {match.location}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[11px] flex-wrap">
          {match.rating != null ? (
            <span className="inline-flex items-center gap-1">
              <MiniStars n={match.rating} />
              <span className="font-extrabold text-slate-900">
                {match.rating.toFixed(1)}
              </span>
              {match.reviewCount > 0 && (
                <span className="text-slate-400">({match.reviewCount})</span>
              )}
            </span>
          ) : (
            <span className="text-[11px] font-extrabold text-emerald-600">
              ✓ Verified
            </span>
          )}
        </div>
        {match.blurb && (
          <p className="hidden sm:block mt-2 text-[12px] text-slate-600 italic line-clamp-2">
            &ldquo;{match.blurb}&rdquo;
          </p>
        )}

        {/* Locked CTA - inline within the row on mobile, full-width
            footer on desktop */}
        <button
          type="button"
          disabled
          className="mt-2 sm:mt-auto sm:pt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:py-2.5 rounded-xl bg-slate-100 text-slate-400 text-[11px] sm:text-[12.5px] font-extrabold cursor-not-allowed"
        >
          <span className="text-[10px] sm:text-[11px]">🔒</span>
          {isGuest ? "Sign up to message" : "Post job to message"}
        </button>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex sm:flex-col">
      <div className="shrink-0 w-28 sm:w-auto sm:aspect-[4/3] bg-slate-100" />
      <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 flex-1 space-y-2">
        <div className="h-3.5 w-2/3 bg-slate-200 rounded" />
        <div className="h-3 w-1/2 bg-slate-100 rounded" />
        <div className="h-3 w-1/3 bg-slate-100 rounded" />
      </div>
    </div>
  );
}

export default function PreviewMatchesPanel({
  matches,
  loading,
  err,
  isGuest,
}: Props) {
  if (err) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-[13px] text-rose-700">
        Couldn&apos;t load your matches just now.
        {isGuest
          ? " You can still sign up and we'll match you once you're in."
          : " You can still post your job and we'll match you once it's live."}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-3">
          <Sparkles className="w-3 h-3" />
          Finding your local matches...
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 mb-3">
          <Search className="w-6 h-6 text-indigo-500" />
        </span>
        <div className="text-[14px] font-extrabold text-slate-900">
          No matches in your area yet
        </div>
        <p className="mt-1 text-[12.5px] text-slate-600 leading-relaxed max-w-sm mx-auto">
          {isGuest
            ? "Sign up and we'll keep looking - we'll notify you the moment a local tradesperson is a fit for your job."
            : "Post your job anyway - we'll keep looking and notify you the moment a local tradesperson is a fit."}
        </p>
      </div>
    );
  }

  const localCount = matches.filter((m) => m.isLocal).length;
  const eyebrow =
    localCount === matches.length
      ? `${matches.length} local match${matches.length === 1 ? "" : "es"}`
      : localCount > 0
        ? `${localCount} local · ${matches.length - localCount} nearby`
        : `${matches.length} nearby match${matches.length === 1 ? "" : "es"}`;

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-3">
        <Sparkles className="w-3 h-3" />
        {eyebrow}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} isGuest={isGuest} />
        ))}
      </div>
    </div>
  );
}
