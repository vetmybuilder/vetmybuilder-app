import Image from "next/image";

export type BuilderTier = "recommended" | "ai-matched";

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
  recommenderName?: string;
}

export default function BuilderCard({ builder }: { builder: BuilderCardBuilder }) {
  const isRec = builder.tier === "recommended";
  const title = builder.companyName || builder.displayName || "Builder";
  const initial = (title || "?").trim().charAt(0).toUpperCase();
  const yrLabel =
    typeof builder.yearsTrading === "number" && builder.yearsTrading > 0
      ? `${builder.yearsTrading} yr${builder.yearsTrading === 1 ? "" : "s"}`
      : null;

  return (
    <div
      className="relative rounded-[22px] overflow-hidden bg-white border border-gray-100 shadow-md flex flex-col h-full"
      style={{ boxShadow: "0 6px 22px rgba(15,23,42,0.08)" }}
    >
      {/* Photo — flex-1 so it fills any vertical space the card has */}
      <div className="relative flex-1 bg-gray-200 min-h-[200px]">
        {builder.photoUrl ? (
          <Image
            src={builder.photoUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold text-white bg-gradient-to-br from-indigo-400 to-indigo-600">
            {initial}
          </div>
        )}

        {/* Tier pill — top-left, matches desktop ShortlistSection convention */}
        {isRec ? (
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
          >
            ★ Friend
          </span>
        ) : (
          <span
            className="absolute top-3 left-3 inline-flex items-center gap-1 bg-white/85 text-indigo-700 text-[11px] font-extrabold tracking-tight px-2.5 py-1 rounded-full backdrop-blur"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
          >
            ✨ AI match
          </span>
        )}

        {/* Bottom gradient + name */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 to-transparent text-white">
          <div className="text-[20px] font-extrabold leading-tight tracking-tight">{title}</div>
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

      {/* Why-match line — single line, compact */}
      {(isRec || builder.whyMatch) && (
        <div className="px-3.5 pb-3 text-[12px] text-gray-600 leading-snug">
          {isRec ? (
            <>
              <span className="text-sky-700 font-bold">Recommended</span>
              {builder.recommenderName ? ` — by ${builder.recommenderName}` : ""}
              {builder.whyMatch?.includes("Free") ? " · Free to contact" : ""}
            </>
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
