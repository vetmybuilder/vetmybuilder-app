import Image from "next/image";

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

  return (
    <div
      className="relative rounded-[22px] overflow-hidden bg-white border border-gray-100 shadow-md flex flex-col h-full"
      style={{ boxShadow: "0 6px 22px rgba(15,23,42,0.08)" }}
    >
      {/* Photo — flex-1 so it fills any vertical space the card has */}
      <div className="relative flex-1 bg-gray-200 min-h-[200px]">
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            className="object-cover"
            unoptimized
          />
        ) : isRecCard ? (
          /* Rec card with no photo — amber gradient with company initial */
          <div
            className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white"
            style={{ background: "linear-gradient(135deg, #fdba74, #ea580c)" }}
          >
            {initial}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold text-white bg-gradient-to-br from-indigo-400 to-indigo-600">
            {initial}
          </div>
        )}

        {/* Badge — top-left */}
        {isRecCard ? (
          /* Amber "Recommendation" badge for rec cards */
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full"
            style={{
              background: "#fef3c7",
              color: "#92400e",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            ⭐ Recommendation
          </span>
        ) : isPaid ? (
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full text-white"
            style={{
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            Wants this job
          </span>
        ) : isRec ? (
          /* On-platform tradesperson surfaced because the homeowner's
             community recommended them. Same amber pill as off-platform
             rec cards (isRecCard) so all "this came from a recommendation"
             cards read consistently in the deck. */
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full"
            style={{
              background: "#fef3c7",
              color: "#92400e",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            ⭐ Recommendation
          </span>
        ) : (
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/85 text-indigo-700 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full backdrop-blur"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
          >
            ✨ AI match
          </span>
        )}

        {/* Heart button — top-right, only for rec cards */}
        {isRecCard && onUnfavouriteRec && (
          <button
            type="button"
            aria-label="Remove recommendation"
            onClick={(e) => {
              e.stopPropagation();
              onUnfavouriteRec();
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
            }}
          >
            <span className="text-[18px] leading-none">🤍</span>
          </button>
        )}

        {/* Bottom gradient + name. Stronger gradient + text shadow so the
            name stays legible over photos with bright/white content (logos,
            light backgrounds). */}
        <div
          className="absolute inset-x-0 bottom-0 p-4 text-white"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0) 100%)",
          }}
        >
          <div
            className="text-[20px] font-extrabold leading-tight tracking-tight"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
          >
            {title}
          </div>
        </div>
      </div>

      {/* Stat row — compact, below the photo, single horizontal line */}
      <div className="flex flex-wrap gap-1.5 px-3.5 py-2.5 border-t border-gray-100">
        {typeof builder.starRating === "number" && (
          <Pill>★ {builder.starRating.toFixed(1)}</Pill>
        )}
        {typeof builder.reviewCount === "number" && builder.reviewCount > 0 && (
          <Pill>{builder.reviewCount} reviews</Pill>
        )}
        {yrLabel && <Pill>{yrLabel}</Pill>}
        {builder.chVerified && (
          <Pill className="bg-emerald-50 text-emerald-700">✓ Verified</Pill>
        )}
      </div>

      {/* Attribution / why-match line */}
      {(isRecCard || isRec || isPaid || builder.whyMatch) && (
        <div className="px-3.5 pb-3 text-[12px] text-gray-600 leading-snug">
          {isRecCard ? (
            <span className="text-amber-700 font-bold">
              {builder.recommenderName
                ? `Recommended by ${builder.recommenderName}`
                : "Recommended by a friend"}
            </span>
          ) : isPaid ? (
            <>
              <span className="text-indigo-700 font-bold">Paid to pitch</span>
              {builder.introMessage ? ` - "${builder.introMessage}"` : ""}
            </>
          ) : isRec ? (
            // The orange "⭐ Recommendation" pill at the top of the card
            // already conveys the source - no need to repeat it down here.
            // Just surface the recommender's name if we have it.
            builder.recommenderName ? (
              <span className="text-amber-700 font-bold">
                By {builder.recommenderName}
              </span>
            ) : null
          ) : (
            builder.whyMatch
          )}
        </div>
      )}
    </div>
  );
}

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 ${
        className || "bg-gray-100 text-gray-800"
      }`}
    >
      {children}
    </span>
  );
}
