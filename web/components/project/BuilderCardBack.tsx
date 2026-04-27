// web/components/project/BuilderCardBack.tsx
//
// Back face of a swipe-deck card. Shown when the homeowner taps the (i)
// info button — the card flips on the Y axis to reveal a quick details
// panel without leaving the deck.

import type { BuilderCardBuilder } from "./BuilderCard";
import { ChevronRight } from "lucide-react";

export interface BuilderCardBackBuilder extends BuilderCardBuilder {
  primaryTrade?: string | null;
  secondaryTrades?: string[];
  serviceAreas?: string[];
}

export default function BuilderCardBack({
  builder,
  onViewFull,
}: {
  builder: BuilderCardBackBuilder;
  /** Called when the homeowner taps "View full profile". Optional; if absent
   *  the link is hidden (e.g. for rec cards we may want to prefer the flip
   *  view as the canonical surface). */
  onViewFull?: () => void;
}) {
  const isRecCard = !!builder.isRecommendation;
  const title = builder.companyName || builder.displayName || "Builder";
  const trades = [builder.primaryTrade, ...(builder.secondaryTrades || [])]
    .filter(Boolean)
    .map((t) => String(t));
  const areas = (builder.serviceAreas || []).filter(Boolean);

  return (
    <div
      className="relative rounded-[22px] overflow-hidden bg-white border border-gray-100 shadow-md flex flex-col h-full"
      style={{ boxShadow: "0 6px 22px rgba(15,23,42,0.08)" }}
    >
      {/* Header band */}
      <div
        className="px-4 py-3 text-white"
        style={{
          background: isRecCard
            ? "linear-gradient(135deg, #fdba74, #ea580c)"
            : "linear-gradient(135deg, #6366f1, #4338ca)",
        }}
      >
        <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-90">
          {isRecCard ? "⭐ Recommendation" : "Profile"}
        </div>
        <div className="mt-0.5 text-[18px] font-extrabold leading-tight">
          {title}
        </div>
        {builder.recommenderName && (
          <div className="mt-1 text-[12px] opacity-90">
            By {builder.recommenderName}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {trades.length > 0 && (
          <Section label="Trades">
            <div className="flex flex-wrap gap-1.5">
              {trades.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11.5px] font-bold text-gray-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </Section>
        )}

        {areas.length > 0 && (
          <Section label="Service areas">
            <div className="flex flex-wrap gap-1.5">
              {areas.slice(0, 8).map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11.5px] font-bold text-gray-700"
                >
                  {a}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section label="At a glance">
          <div className="flex flex-wrap gap-1.5">
            {typeof builder.starRating === "number" && (
              <Stat>★ {builder.starRating.toFixed(1)}</Stat>
            )}
            {typeof builder.reviewCount === "number" && builder.reviewCount > 0 && (
              <Stat>{builder.reviewCount} reviews</Stat>
            )}
            {typeof builder.yearsTrading === "number" && builder.yearsTrading > 0 && (
              <Stat>
                {builder.yearsTrading} yr{builder.yearsTrading === 1 ? "" : "s"}
              </Stat>
            )}
            {builder.chVerified && (
              <Stat className="bg-emerald-50 text-emerald-700 border-emerald-100">
                ✓ Verified
              </Stat>
            )}
          </div>
        </Section>

        {builder.whyMatch && (
          <Section label="Why we matched">
            <p className="text-[12.5px] text-gray-600 leading-relaxed">
              {builder.whyMatch}
            </p>
          </Section>
        )}
      </div>

      {/* Footer CTA */}
      {onViewFull && (
        <button
          type="button"
          onClick={onViewFull}
          className="border-t border-gray-100 px-4 py-3.5 flex items-center justify-between text-[13px] font-extrabold text-indigo-700"
          data-testid="builder-card-view-full"
        >
          <span>View full profile</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function Stat({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11.5px] font-bold text-gray-700 ${className}`}
    >
      {children}
    </span>
  );
}
