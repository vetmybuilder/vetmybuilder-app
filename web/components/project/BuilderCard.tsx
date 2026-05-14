// web/components/project/BuilderCard.tsx
//
// Tinder-style fullscreen card. The card is 100% photo with all metadata
// rendered as a glass / gradient overlay along the bottom edge — no
// separate "stat row" beneath the photo. Same props as before so callers
// don't need to change.
import Image from "next/image";
import { Star } from "lucide-react";
import { useRecentCompleted } from "@/hooks/useRecentCompleted";

export type BuilderTier = "recommended" | "ai-matched" | "paid_unlock";

export interface BuilderCardBuilder {
  uid: string;
  displayName: string;
  companyName: string;
  photoUrl: string | null;
  starRating: number | null;
  reviewCount: number | null;
  yearsTrading: number | null;
  chVerified: boolean;
  whyMatch: string | null;
  tier: BuilderTier;
  recommenderName?: string | null;
  /** Free-text intro the trade wrote at paid_unlock checkout. Surfaced
   *  on the back of the card / in the Info modal for paid_unlock tier. */
  introMessage?: string | null;
  /** VMB trust score (vmb_score from tradesmen). Used on the back of the card. */
  baseScore?: number | null;
  // Rec-card fields (populated when isRecommendation is true):
  isRecommendation?: boolean;
  coverPhotoUrl?: string | null;
}

export default function BuilderCard({
  builder,
  onUnfavouriteRec,
}: {
  builder: BuilderCardBuilder;
  onUnfavouriteRec?: () => void;
}) {
  const isRecCard = !!builder.isRecommendation;
  const isRec = builder.tier === "recommended";
  const isPaid = builder.tier === "paid_unlock";

  // CR3: surface a "Top tradesperson" chip when this builder has at
  // least one boosted closure. Rec cards don't have a uid we can query,
  // so the hook short-circuits with topTradesperson=false there.
  const { topTradesperson } = useRecentCompleted(
    !isRecCard ? builder.uid : null,
  );

  const title = builder.companyName || builder.displayName || "Builder";
  const initial = (title || "?").trim().charAt(0).toUpperCase();
  const yrLabel =
    typeof builder.yearsTrading === "number" && builder.yearsTrading > 0
      ? `${builder.yearsTrading} yr${builder.yearsTrading === 1 ? "" : "s"}`
      : null;

  // Rec cards use coverPhotoUrl as their photo source; fall back to photoUrl
  // for regular cards.
  const photoSrc = isRecCard
    ? (builder.coverPhotoUrl || builder.photoUrl)
    : builder.photoUrl;

  const attribution =
    isRecCard
      ? builder.recommenderName
        ? `Recommended by ${builder.recommenderName}`
        : "Recommended by a friend"
      : isPaid
        ? builder.introMessage
          ? `Paid to pitch — "${builder.introMessage}"`
          : "Paid to pitch"
        : isRec
          ? builder.recommenderName
            ? `Recommended by ${builder.recommenderName}`
            : null
          : builder.whyMatch || null;

  return (
    <div
      className="relative overflow-hidden bg-gray-200 h-full w-full md:shadow-md"
    >
      {photoSrc ? (
        <Image
          src={photoSrc}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 600px"
          // iOS Safari long-press on a draggable image triggers the native
          // image preview, which steals our drag. Mark non-draggable.
          draggable={false}
          // Eager-load: peek cards in the swipe deck sit z-stacked behind
          // the top card, so the default lazy loader never fires (zero
          // intersection). Loading eagerly preloads the next 1-2 photos
          // so swipes are smooth instead of flashing the next card in.
          loading="eager"
          className="object-cover select-none pointer-events-none"
          style={{ WebkitTouchCallout: "none" }}
          unoptimized
        />
      ) : isRecCard ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white"
          style={{ background: "linear-gradient(135deg, #fdba74, #ea580c)" }}
        >
          {initial}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white bg-gradient-to-br from-indigo-400 to-indigo-600">
          {initial}
        </div>
      )}

      {/* Source badge — top-right */}
      <div className="absolute top-3 right-3 z-10">
        <BadgePill isRecCard={isRecCard} isPaid={isPaid} isRec={isRec} />
      </div>

      {/* Heart "remove" — top-left, rec cards only */}
      {isRecCard && onUnfavouriteRec && (
        <button
          type="button"
          aria-label="Remove recommendation"
          onClick={(e) => {
            e.stopPropagation();
            onUnfavouriteRec();
          }}
          className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.92)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
          }}
        >
          <span className="text-[18px] leading-none">🤍</span>
        </button>
      )}

      {/* Bottom gradient + content — title, chip row, attribution. pb
          leaves room for the floating action bar so the buttons never
          sit on top of the title. */}
      <div
        className="absolute inset-x-0 bottom-0 px-5 pt-24 pb-28 text-white"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div className="flex items-end justify-between gap-3">
          <h2
            className="text-[24px] font-black tracking-tight leading-[1.1] min-w-0"
            style={{
              fontFamily: "'Sora', sans-serif",
              textShadow: "0 1px 3px rgba(0,0,0,0.55)",
            }}
          >
            {title}
          </h2>
          {typeof builder.starRating === "number" && (
            <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur px-2 py-1 rounded-full text-[12px] font-extrabold shrink-0">
              ★ {builder.starRating.toFixed(1)}
            </span>
          )}
        </div>

        {/* Chip row */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11.5px] font-bold">
          {typeof builder.reviewCount === "number" && builder.reviewCount > 0 && (
            <Chip>{builder.reviewCount} reviews</Chip>
          )}
          {yrLabel && <Chip>{yrLabel}</Chip>}
          {builder.chVerified && (
            <Chip className="bg-emerald-500/85 text-white">✓ Verified</Chip>
          )}
          {/* CR3: top tradesperson chip - boosted by at least one
              homeowner who closed a job with them. */}
          {topTradesperson && (
            <Chip
              className="bg-amber-100 text-amber-800 border border-amber-300"
              testId="card-top-tradesperson"
            >
              <Star className="h-3 w-3 fill-amber-700 inline-block mr-1" />
              Top tradesperson
            </Chip>
          )}
        </div>

        {/* Attribution / why-match */}
        {attribution && (
          <p className="mt-2.5 text-[12px] opacity-90 leading-snug line-clamp-2">
            {attribution}
          </p>
        )}
      </div>
    </div>
  );
}

function BadgePill({
  isRecCard,
  isPaid,
  isRec,
}: {
  isRecCard: boolean;
  isPaid: boolean;
  isRec: boolean;
}) {
  if (isRecCard || isRec) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full"
        style={{
          background: "#fef3c7",
          color: "#92400e",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        ⭐ Recommendation
      </span>
    );
  }
  if (isPaid) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full text-white"
        style={{
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        Wants this job
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 bg-white/85 text-indigo-700 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full backdrop-blur"
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
    >
      ✨ AI match
    </span>
  );
}

function Chip({
  children,
  className = "",
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur ${
        className || "bg-white/15 text-white"
      }`}
    >
      {children}
    </span>
  );
}
