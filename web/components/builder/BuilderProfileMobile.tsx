// web/components/builder/BuilderProfileMobile.tsx
//
// Mobile redesign of /builders/[id] (recommendation-based profile,
// distinct from the subscribed-tradesman profile at /tradesman/[id]).
// V1 hero portrait + sequential layout — sections only render when
// the underlying data is present, so empty placeholders never appear.
//
// Sections (in render order):
//   1. Top nav: back chevron
//   2. Hero portrait: avatar (first photo, otherwise initials disc),
//      company name (CH-verified when present), location pill
//   3. Verification + recommendation badges
//   4. Stats pill row (Google rating, friends, photos, trust, reviews)
//   5. Vote (thumbs-up) when canVote, plus Hire button
//   6. AI community summary (when builder.summary)
//   7. Reviews from the community (aggReviews)
//   8. Photos (taps open the carousel lightbox)
//   9. Contact details (phones / emails) — only when auth'd

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
} from "lucide-react";

import PhotoLightbox from "@/components/PhotoLightbox";
import { platformLabelFor } from "@/utils/reviewLinks";
import type { Builder, Verification, Review, Photo } from "@/types/builderTypes";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  hasAnyRating,
} from "@/utils/ratingSummary";

type Props = {
  builder: Builder;
  companyName: string;
  verification: Verification | null | undefined;
  user: any;
  score: number | null;
  friendCount: number;
  photos: Photo[];
  reviews: Review[];
  phones: string[];
  emails: string[];
  isOwner: boolean;
  canVote: boolean;
  voting: boolean;
  onVote: () => void;
  /**
   * Favourite toggle. When the recommendation has no linked tradesman
   * record (linkedTradesmanUid absent), the parent should not pass these
   * — the heart will hide itself.
   */
  isFavourite?: boolean;
  favBusy?: boolean;
  onToggleFavourite?: () => void;
};

export default function BuilderProfileMobile({
  builder,
  companyName,
  verification,
  user,
  score,
  friendCount,
  photos,
  reviews,
  phones,
  emails,
  isOwner,
  canVote,
  voting,
  onVote,
  isFavourite,
  favBusy,
  onToggleFavourite,
}: Props) {
  const router = useRouter();

  const photoUrls = useMemo(
    () =>
      photos
        .map((p) => p.url || p.thumb)
        .filter((u): u is string => !!u),
    [photos],
  );
  const heroUrl = photoUrls[0] || null;

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const initials = (companyName || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const ratingDisplay =
    typeof verification?.googleRating === "number" && verification.googleRating > 0
      ? verification.googleRating.toFixed(1)
      : null;
  const reviewsCount =
    typeof verification?.googleReviewsCount === "number" && verification.googleReviewsCount > 0
      ? verification.googleReviewsCount
      : null;
  const placeUrl = verification?.googlePlaceId
    ? `https://search.google.com/local/reviews?placeid=${encodeURIComponent(
        verification.googlePlaceId,
      )}`
    : null;

  const isVerified = verification?.status === "verified";
  const fromFriend = builder.fromFriend === 1;

  const trustScore =
    typeof score === "number" && score > 0 ? Math.round(score) : null;

  return (
    <main
      className="fixed inset-0 bg-gray-50 overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="builder-profile-mobile"
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Top nav: back + favourite heart */}
      <div className="px-3.5 pt-2 pb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="builder-mobile-back"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        {onToggleFavourite && builder.linkedTradesmanUid && (
          <button
            type="button"
            aria-label={
              isFavourite ? "Remove from favourites" : "Save to favourites"
            }
            aria-pressed={!!isFavourite}
            onClick={onToggleFavourite}
            disabled={favBusy}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isFavourite
                ? "bg-rose-50 text-rose-600"
                : "bg-gray-100 text-gray-500"
            } ${favBusy ? "opacity-60" : ""}`}
            data-testid="builder-mobile-favourite"
          >
            <Heart
              className={`w-[18px] h-[18px] ${
                isFavourite ? "fill-rose-500" : ""
              }`}
            />
          </button>
        )}
      </div>

      {/* Hero portrait */}
      <div className="px-5 pt-1 pb-4 text-center">
        <div className="w-[88px] h-[88px] mx-auto mt-1 mb-3 rounded-full overflow-hidden bg-gray-200 ring-[3px] ring-white shadow-md">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt={companyName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white font-extrabold text-[22px]"
              style={{ background: "linear-gradient(135deg, #6ee7b7, #10b981)" }}
            >
              {initials}
            </div>
          )}
        </div>
        <h1
          className="text-[22px] font-extrabold tracking-tight text-gray-900 leading-tight"
          data-testid="builder-name"
        >
          {companyName}
        </h1>
        {builder.project?.name && (
          <div className="mt-1 text-[12.5px] text-gray-500">
            Recommended for {builder.project.name}
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5 justify-center">
          {isVerified && (
            <Pill tone="emerald">
              <ShieldCheck className="w-3 h-3" /> Verified
            </Pill>
          )}
          {fromFriend && (
            <Pill tone="sky">
              <Star className="w-3 h-3 fill-sky-700" /> Friend
            </Pill>
          )}
          {friendCount > 0 && (
            <Pill tone="indigo">
              <Users className="w-3 h-3" /> {friendCount} friend
              {friendCount === 1 ? "" : "s"} recommended
            </Pill>
          )}
        </div>
      </div>

      {/* Stats pill row */}
      <section className="px-5">
        <div className="rounded-2xl bg-white border border-gray-200 p-3 flex flex-wrap gap-1.5">
          {ratingDisplay && (
            <StatChip
              tone="google"
              icon={<Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
              text={`${ratingDisplay}${reviewsCount ? ` · ${reviewsCount}` : ""} Google`}
              href={placeUrl ?? undefined}
            />
          )}
          {reviews.length > 0 && (
            <StatChip
              icon={<span className="text-emerald-500">✓</span>}
              text={`${reviews.length} Recommendation${reviews.length === 1 ? "" : "s"}`}
            />
          )}
          {photoUrls.length > 0 && (
            <StatChip
              icon={<span className="text-sky-400">📷</span>}
              text={`${photoUrls.length} Photo${photoUrls.length === 1 ? "" : "s"}`}
            />
          )}
          {trustScore !== null && (
            <StatChip
              tone="trust"
              icon={<Star className="w-3 h-3 fill-rose-400 text-rose-400" />}
              text={`${trustScore} Trust`}
            />
          )}
        </div>

        {/* Action stack: Endorse is the only profile-level action.
            Matching happens via the swipe deck — there is no separate
            Hire flow from this page. */}
        <div className="mt-3 flex flex-col gap-2">
          {canVote && (
            <button
              type="button"
              onClick={onVote}
              disabled={
                !user || builder.myLike === 1 || voting || !canVote
              }
              aria-pressed={builder.myLike === 1}
              data-testid="btn-vote-up"
              className={[
                "inline-flex items-center justify-center gap-2 rounded-2xl border-[1.5px] py-3 font-extrabold text-[14px] transition-colors",
                builder.myLike === 1
                  ? "bg-rose-50 border-rose-200 text-rose-600"
                  : "bg-white border-gray-200 text-gray-800",
                voting ? "opacity-70 cursor-wait" : "",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              <ThumbsUp
                className={`w-4 h-4 ${
                  builder.myLike === 1 ? "fill-rose-500 text-rose-500" : ""
                }`}
              />
              <span>{builder.myLike === 1 ? "Endorsed" : "Endorse"}</span>
            </button>
          )}
        </div>
      </section>

      {/* AI community summary */}
      {builder.summary && builder.summary.bullets?.length > 0 && (
        <>
          <SectionHeader>What the community says</SectionHeader>
          <section className="px-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <ul className="space-y-2">
                {builder.summary.bullets.map((bullet, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-gray-700 leading-relaxed"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10.5px] text-gray-400">
                Based on {builder.summary.recommendationCount} recommendation
                {builder.summary.recommendationCount === 1 ? "" : "s"}{" "}
                <span className="mx-1">·</span> AI-generated
              </p>
            </div>
          </section>
        </>
      )}

      {/* Reviews (recommendations) */}
      {reviews.length > 0 && (
        <>
          <SectionHeader>
            Recommendations · {reviews.length}
          </SectionHeader>
          <section className="px-5 space-y-2">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </section>
        </>
      )}

      {/* Photos */}
      {photoUrls.length > 0 && (
        <>
          <SectionHeader>Photos · {photoUrls.length}</SectionHeader>
          <section className="px-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-2">
              <div className="grid grid-cols-3 gap-1.5">
                {photoUrls.slice(0, 9).map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Open photo ${i + 1}`}
                    onClick={() => setLightboxIdx(i)}
                    className="aspect-square rounded-lg bg-cover bg-center bg-gray-100"
                    style={{ backgroundImage: `url(${src})` }}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* External review links (Trustpilot, Bark, Checkatrade, etc.) */}
      {Array.isArray(builder.reviewLinks) && builder.reviewLinks.length > 0 && (
        <>
          <SectionHeader>External reviews</SectionHeader>
          <section className="px-5">
            <ul className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
              {builder.reviewLinks.map((entry) => (
                <li
                  key={`${entry.platform}-${entry.url}`}
                  data-testid={`builder-review-link-${entry.platform}`}
                  className="px-3.5 py-3"
                >
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center justify-between text-[13px] font-extrabold text-rose-500"
                  >
                    <span>View on {platformLabelFor(entry)}</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Contact details — auth'd only */}
      {user && (phones.length > 0 || emails.length > 0) && (
        <>
          <SectionHeader>Contact details</SectionHeader>
          <section className="px-5">
            <dl className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
              {phones.map((p) => (
                <DetailRow key={p} label="Phone">
                  <a href={`tel:${p}`} className="text-rose-500 font-bold break-all">
                    {p}
                  </a>
                </DetailRow>
              ))}
              {emails.map((e) => (
                <DetailRow key={e} label="Email">
                  <a
                    href={`mailto:${e}`}
                    className="text-rose-500 font-bold break-all"
                  >
                    {e}
                  </a>
                </DetailRow>
              ))}
            </dl>
          </section>
        </>
      )}

      <div className="h-12" />

      {lightboxIdx !== null && photoUrls.length > 0 && (
        <PhotoLightbox
          open
          photos={photoUrls}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </main>
  );
}

/* ----- Subcomponents ----- */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 mt-5 mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500">
      {children}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "emerald" | "sky" | "indigo";
  children: React.ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    indigo: "bg-indigo-50 text-indigo-700",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function StatChip({
  tone,
  icon,
  text,
  href,
}: {
  tone?: "google" | "trust";
  icon: React.ReactNode;
  text: string;
  href?: string;
}) {
  const toneClass =
    tone === "google"
      ? "bg-white border-amber-200"
      : tone === "trust"
      ? "bg-white border-rose-200"
      : "bg-gray-50 border-gray-200";
  const inner = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border-[1.5px] text-[11px] font-bold text-gray-800 ${toneClass}`}
    >
      <span className="text-[12px] leading-none">{icon}</span>
      <span>{text}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <dt className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-[13px] text-right truncate max-w-[60%]">{children}</dd>
    </div>
  );
}

const REVIEW_PALETTE = [
  "linear-gradient(135deg, #c4b5fd, #8b5cf6)",
  "linear-gradient(135deg, #6ee7b7, #10b981)",
  "linear-gradient(135deg, #7dd3fc, #0284c7)",
  "linear-gradient(135deg, #fcd34d, #f59e0b)",
  "linear-gradient(135deg, #f9a8d4, #db2777)",
  "linear-gradient(135deg, #5eead4, #0d9488)",
  "linear-gradient(135deg, #fdba74, #ea580c)",
  "linear-gradient(135deg, #a5b4fc, #6366f1)",
];

function ReviewCard({ review }: { review: Review }) {
  const seed = (review.name || "?")
    .split("")
    .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  const initial = (review.name?.split(" ")[0]?.[0] || "?").toUpperCase();
  const color = REVIEW_PALETTE[seed % REVIEW_PALETTE.length];
  const date = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-extrabold"
          style={{ background: color }}
        >
          {initial}
        </span>
        <span className="text-[12.5px] font-extrabold text-gray-900">
          {review.name?.split(" ")[0] || review.name || "Recommender"}
        </span>
        {date && (
          <span className="ml-auto text-[10.5px] font-semibold text-gray-500">
            {date}
          </span>
        )}
      </div>
      {review.comment && (
        <div className="mt-2 text-[12.5px] text-gray-700 leading-relaxed">
          {review.comment}
        </div>
      )}
      {review.isAutoComment && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-indigo-700">
          <Sparkles className="h-2.5 w-2.5" />
          Auto from ratings
        </div>
      )}
      {hasAnyRating(review.ratings) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORY_ORDER.map((key) => {
            const value = review.ratings?.[key];
            if (typeof value !== "number") return null;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9.5px] font-bold text-gray-700"
              >
                <span>{CATEGORY_LABELS[key]}</span>
                <CompactStars value={value} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompactStars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} of 5`} className="leading-none">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= value ? "text-amber-500" : "text-gray-300"}
          style={{ fontSize: "8.5px", letterSpacing: "0.5px" }}
        >
          ★
        </span>
      ))}
    </span>
  );
}
