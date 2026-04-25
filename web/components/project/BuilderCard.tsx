// Unlock entry: not found at T1 time — Task 10 will re-discover.
import Image from "next/image";

export type BuilderTier = "recommended" | "ai-matched";

export interface BuilderCardBuilder {
  uid: string;
  displayName: string;
  companyName: string;
  photoUrl: string | null;
  starRating: number;
  reviewCount: number;
  yearsTrading: number;
  chVerified: boolean;
  whyMatch: string;
  tier: BuilderTier;
  recommenderName?: string;
}

export default function BuilderCard({ builder }: { builder: BuilderCardBuilder }) {
  const tierBadge =
    builder.tier === "recommended"
      ? `Recommended by ${builder.recommenderName ?? "your network"}`
      : "AI match";
  const tierStyle =
    builder.tier === "recommended"
      ? "bg-indigo-50 text-indigo-700"
      : "bg-gray-100 text-gray-700";

  return (
    <div className="relative rounded-2xl overflow-hidden bg-white shadow-md border border-gray-100">
      <div className="relative aspect-square bg-gray-200">
        {builder.photoUrl ? (
          <Image src={builder.photoUrl} alt={builder.displayName} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-white bg-gradient-to-br from-indigo-400 to-indigo-600">
            {builder.displayName.charAt(0)}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 to-transparent text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{builder.displayName}</div>
              <div className="text-sm opacity-90">{builder.companyName}</div>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${tierStyle}`}>
              {tierBadge}
            </span>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Pill>★ {builder.starRating.toFixed(1)}</Pill>
          <Pill>{builder.reviewCount} reviews</Pill>
          <Pill>{builder.yearsTrading} yrs</Pill>
          {builder.chVerified && <Pill>CH ✓</Pill>}
        </div>
        <p className="text-sm text-gray-700 leading-snug">{builder.whyMatch}</p>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800 bg-gray-100 rounded-full px-3 py-1">
      {children}
    </span>
  );
}
