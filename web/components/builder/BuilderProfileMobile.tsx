// web/components/builder/BuilderProfileMobile.tsx
//
// Mobile profile for /builders/[id] — recommendation-based builder profile
// (distinct from the subscribed-tradesman profile at /tradesman/[id]).
// Flat white page with hairline section dividers, no card chrome.
//
// Sections (in render order, conditional on data):
//   1. Top nav: back chevron + favourite heart + report button
//   2. Hero portrait: avatar (first photo, otherwise initials disc),
//      company name (Sora), trade types, verified + location pill
//   3. Stats strip: rating, reviews, friends, photos (4-col grid)
//   4. Primary Endorse CTA (full-width indigo pill)
//   5. AI community summary
//   6. Reviews from the community
//   7. Photos (taps open the carousel lightbox)
//   8. External review links (Trustpilot, Bark, etc.)
//   9. Contact details (phones / emails) — only when auth'd
//  10. Report this profile (low-contrast footer button)

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
} from "lucide-react";

import PhotoLightbox from "@/components/PhotoLightbox";
import ReportModal from "@/components/ReportModal";
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
  const [reportOpen, setReportOpen] = useState(false);

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

  const isVerified = verification?.status === "verified";
  const trustScore =
    typeof score === "number" && score > 0 ? Math.round(score) : null;
  const location =
    (builder as any)?.project?.location ||
    (builder as any)?.location ||
    null;
  const trade = (builder as any)?.tradesman?.tradeTypes || (builder as any)?.tradeTypes || null;
  const tradeLine = typeof trade === "string" ? trade : Array.isArray(trade) ? trade.join(" · ") : null;

  return (
    <main
      className="min-h-screen bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="builder-profile-mobile"
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Top nav */}
      <div className="px-3.5 pt-1.5 pb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
          data-testid="builder-mobile-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-2">
          {onToggleFavourite && builder.linkedTradesmanUid && (
            <button
              type="button"
              aria-label={isFavourite ? "Remove from favourites" : "Save to favourites"}
              aria-pressed={!!isFavourite}
              onClick={onToggleFavourite}
              disabled={favBusy}
              className={`w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center transition-colors ${favBusy ? "opacity-60" : ""}`}
              style={{ color: isFavourite ? "#e11d48" : "#475569" }}
              data-testid="builder-mobile-favourite"
            >
              <Heart className={`w-[18px] h-[18px] ${isFavourite ? "fill-rose-500" : "fill-transparent"}`} />
            </button>
          )}
          <button
            type="button"
            aria-label="Report this profile"
            onClick={() => setReportOpen(true)}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
            data-testid="btn-report-profile"
          >
            <Flag className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* Hero portrait */}
      <div className="px-4 pt-3 pb-4 text-center">
        <div className="mx-auto w-[112px] h-[112px] rounded-full overflow-hidden bg-gray-200 ring-[4px] ring-white shadow-md">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroUrl} alt={companyName} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-white font-extrabold text-[26px]"
              style={{ background: "linear-gradient(135deg, #a5b4fc, #6366f1)" }}
            >
              {initials}
            </div>
          )}
        </div>
        <h1
          className="mt-4 text-[24px] font-black tracking-tight text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
          data-testid="builder-name"
        >
          {companyName}
        </h1>
        {tradeLine && (
          <div className="mt-1 text-[12.5px] text-slate-500">{tradeLine}</div>
        )}
        {(isVerified || location) && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-indigo-700">
            {isVerified && (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified</span>
              </>
            )}
            {isVerified && location && <span className="text-slate-300">·</span>}
            {location && <span className="text-slate-700">{location}</span>}
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-1 px-4 py-3 border-y border-slate-200/70">
        <Stat label="Rating" value={ratingDisplay ?? "—"} />
        <Stat label="Reviews" value={String(reviewsCount ?? reviews.length)} />
        <Stat label="Friends" value={String(friendCount)} />
        <Stat label="Photos" value={String(photoUrls.length)} />
      </div>

      {/* Primary CTA - Endorse */}
      {canVote && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={onVote}
            disabled={!user || builder.myLike === 1 || voting}
            aria-pressed={builder.myLike === 1}
            data-testid="btn-vote-up"
            className="w-full py-3.5 rounded-2xl text-white font-extrabold text-[14px] shadow-lg inline-flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background:
                builder.myLike === 1
                  ? "linear-gradient(135deg, #fb7185, #e11d48)"
                  : "linear-gradient(135deg, #6366f1, #4f46e5)",
              boxShadow:
                builder.myLike === 1
                  ? "0 8px 22px rgba(225,29,72,0.3)"
                  : "0 8px 22px rgba(99,102,241,0.3)",
            }}
          >
            <ThumbsUp
              className={`w-4 h-4 ${builder.myLike === 1 ? "fill-white" : ""}`}
            />
            {builder.myLike === 1 ? "Endorsed" : "Endorse"}
          </button>
        </div>
      )}

      {/* AI community summary */}
      {builder.summary && builder.summary.bullets?.length > 0 && (
        <>
          <SectionHeader eyebrow="What homeowners say">In short</SectionHeader>
          <ul className="px-4 space-y-2 text-[13px] text-slate-700 leading-snug">
            {builder.summary.bullets.map((bullet, i) => (
              <li key={i} className="flex gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 mt-3 text-[10.5px] text-slate-400">
            Based on {builder.summary.recommendationCount} recommendation
            {builder.summary.recommendationCount === 1 ? "" : "s"}
            <span className="mx-1">·</span> Smart-generated
          </p>
        </>
      )}

      {/* Reviews */}
      {reviews.length > 0 && (
        <>
          <SectionHeader eyebrow={`${reviews.length} from your community`}>
            Reviews
          </SectionHeader>
          <div className="border-t border-slate-200/70">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </div>
        </>
      )}

      {/* Photos */}
      {photoUrls.length > 0 && (
        <>
          <SectionHeader eyebrow={`${photoUrls.length} from past jobs`}>
            Photos
          </SectionHeader>
          <div className="px-4">
            <div className="grid grid-cols-3 gap-1.5">
              {photoUrls.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Open photo ${i + 1}`}
                  onClick={() => setLightboxIdx(i)}
                  className="aspect-square rounded-lg bg-cover bg-center bg-slate-100 active:opacity-80 transition-opacity"
                  style={{ backgroundImage: `url(${src})` }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* External review links */}
      {Array.isArray(builder.reviewLinks) && builder.reviewLinks.length > 0 && (
        <>
          <SectionHeader>External reviews</SectionHeader>
          <div className="border-t border-slate-200/70">
            {builder.reviewLinks.map((entry) => (
              <a
                key={`${entry.platform}-${entry.url}`}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                data-testid={`builder-review-link-${entry.platform}`}
                className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 text-[13.5px] font-extrabold text-indigo-700 active:bg-indigo-50/40"
              >
                <span>View on {platformLabelFor(entry)}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </a>
            ))}
          </div>
        </>
      )}

      {/* Contact details — auth'd only */}
      {user && (phones.length > 0 || emails.length > 0) && (
        <>
          <SectionHeader>Contact details</SectionHeader>
          <div className="border-t border-slate-200/70">
            {phones.map((p) => (
              <ContactRow key={p} label="Phone">
                <a href={`tel:${p}`} className="font-extrabold text-indigo-700 break-all">
                  {p}
                </a>
              </ContactRow>
            ))}
            {emails.map((e) => (
              <ContactRow key={e} label="Email">
                <a href={`mailto:${e}`} className="font-extrabold text-indigo-700 break-all">
                  {e}
                </a>
              </ContactRow>
            ))}
          </div>
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

      {reportOpen && builder?.id && (
        <ReportModal
          targetType="profile"
          targetId={builder.id}
          onClose={() => setReportOpen(false)}
        />
      )}
    </main>
  );
}

/* ----- Subcomponents ----- */

function SectionHeader({
  children,
  eyebrow,
}: {
  children: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="px-4 pt-6 pb-3">
      {eyebrow && (
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-1">
          {eyebrow}
        </div>
      )}
      <h2
        className="text-[18px] font-black tracking-tight text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {children}
      </h2>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div
        className="text-[16px] font-black text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {value}
      </div>
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

function ContactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-200/70">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="text-[13.5px] text-right truncate max-w-[60%]">{children}</div>
    </div>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const initial = (review.name?.split(" ")[0]?.[0] || "?").toUpperCase();
  const date = review.createdAt
    ? new Date(review.createdAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  return (
    <div className="px-4 py-4 border-b border-slate-200/70">
      <div className="flex items-center gap-2.5">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-extrabold"
          style={{ background: "linear-gradient(135deg, #a5b4fc, #6366f1)" }}
        >
          {initial}
        </span>
        <span className="text-[13px] font-extrabold text-slate-900">
          {review.name?.split(" ")[0] || review.name || "Recommender"}
        </span>
        {date && (
          <span className="ml-auto text-[10.5px] font-semibold text-slate-400">
            {date}
          </span>
        )}
      </div>
      {review.comment && (
        <p className="mt-2 text-[13px] italic text-slate-700 leading-snug">
          &ldquo;{review.comment}&rdquo;
        </p>
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
                className="inline-flex items-center gap-0.5 rounded-full bg-slate-50 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-700"
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
          className={i <= value ? "text-amber-500" : "text-slate-300"}
          style={{ fontSize: "8.5px", letterSpacing: "0.5px" }}
        >
          ★
        </span>
      ))}
    </span>
  );
}
