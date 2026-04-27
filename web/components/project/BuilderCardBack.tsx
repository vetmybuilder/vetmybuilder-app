// web/components/project/BuilderCardBack.tsx
//
// Back face of a swipe-deck card. Shown when the homeowner taps the (i)
// info button — the card flips on the Y axis to reveal a quick details
// panel without leaving the deck.
//
// Variant A layout: hero band → 3-cell stat strip → sectioned body →
// verified callout → "View full profile" footer.

import type { BuilderCardBuilder } from "./BuilderCard";
import { ChevronRight, ShieldCheck } from "lucide-react";

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
  /** Called when the homeowner taps "View full profile". */
  onViewFull?: () => void;
}) {
  const isRecCard = !!builder.isRecommendation;
  const title = builder.companyName || builder.displayName || "Builder";
  const trades = [builder.primaryTrade, ...(builder.secondaryTrades || [])]
    .filter(Boolean)
    .map((t) => String(t));
  const areas = (builder.serviceAreas || []).filter(Boolean);

  const heroBg = isRecCard
    ? "linear-gradient(135deg, #fdba74, #ea580c)"
    : "linear-gradient(135deg, #6366f1, #4338ca)";
  const heroLabel = isRecCard ? "⭐ Recommendation" : "Profile";
  const whyText = isRecCard
    ? builder.recommenderName
      ? `By ${builder.recommenderName}`
      : null
    : builder.whyMatch || null;

  // Stat strip values — only render slots when we genuinely have a value.
  const starVal =
    typeof builder.starRating === "number" && builder.starRating > 0
      ? builder.starRating.toFixed(1)
      : null;
  const reviewsVal =
    typeof builder.reviewCount === "number" && builder.reviewCount > 0
      ? builder.reviewCount.toLocaleString()
      : null;
  const trustVal =
    typeof builder.baseScore === "number" && builder.baseScore > 0
      ? Math.round(builder.baseScore).toString()
      : null;
  const statSlots: Array<{ value: string; label: string; tone: "amber" | "default" | "rose" }> = [];
  if (starVal) statSlots.push({ value: `★ ${starVal}`, label: "Rating", tone: "amber" });
  if (reviewsVal) statSlots.push({ value: reviewsVal, label: "Reviews", tone: "default" });
  if (trustVal) statSlots.push({ value: trustVal, label: "Trust", tone: "rose" });

  return (
    <div
      className="relative rounded-[22px] overflow-hidden bg-white border border-gray-100 shadow-md flex flex-col h-full"
      style={{ boxShadow: "0 6px 22px rgba(15,23,42,0.08)" }}
    >
      {/* Hero band */}
      <div className="px-4 py-4 text-white" style={{ background: heroBg }}>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-90">
          {heroLabel}
        </div>
        <div className="mt-0.5 text-[18px] font-extrabold leading-tight">{title}</div>
        {whyText && (
          <span className="mt-2 inline-block bg-white/20 text-white px-2.5 py-1 rounded-full text-[10px] font-bold">
            {whyText}
          </span>
        )}
      </div>

      {/* Stat strip — only shown when we have at least one stat */}
      {statSlots.length > 0 && (
        <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: `repeat(${statSlots.length}, 1fr)` }}>
          {statSlots.map((s, i) => (
            <div
              key={i}
              className={
                "text-center py-3 px-2 " +
                (i < statSlots.length - 1 ? "border-r border-gray-100" : "")
              }
            >
              <div
                className={
                  "text-[18px] font-extrabold leading-none " +
                  (s.tone === "amber" ? "text-amber-500" : s.tone === "rose" ? "text-rose-500" : "text-gray-900")
                }
              >
                {s.value}
              </div>
              <div className="mt-1 text-[9.5px] font-bold uppercase tracking-wider text-gray-500">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {trades.length > 0 && (
          <Section colorDot="#4338ca" label="Trades">
            <div className="flex flex-wrap gap-1">
              {trades.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </Section>
        )}

        {areas.length > 0 && (
          <Section colorDot="#10b981" label="Service areas">
            <div className="flex flex-wrap gap-1">
              {areas.slice(0, 8).map((a) => (
                <Chip key={a} tone="indigo">
                  📍 {a}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {builder.chVerified && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
            <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <span className="text-[12px] font-bold text-emerald-800">Verified</span>
          </div>
        )}
      </div>

      {/* Footer */}
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
  colorDot,
  label,
  children,
}: {
  colorDot: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-1.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: colorDot }}
        />
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "indigo";
}) {
  const cls =
    tone === "indigo"
      ? "bg-indigo-50 border-indigo-100 text-indigo-700"
      : "bg-gray-50 border-gray-200 text-gray-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cls}`}
    >
      {children}
    </span>
  );
}
