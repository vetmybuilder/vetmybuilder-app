// web/components/project/PriceRangeBadge.tsx
//
// Renders a unified "Typical cost range" badge on the project page. The
// value comes from one of two sources, in priority order:
//
//   1. Deterministic range derived from the homeowner's structured answers
//      via the matching spec's priceModel (see web/config/jobFields.ts).
//   2. The AI classifier's freeform `price_band_estimate` string — our
//      fallback when no spec or no answers are available.
//
// Whichever source we use, the user sees a single consistent block. The
// caveat copy reflects the source so we're honest about what produced
// the number.

import * as React from "react";
import { computeProjectPriceRange } from "@/utils/projectPricing";
import { isProjectPriceRangeEnabled } from "@/utils/featureFlags";

type Props = {
  /** The project's primary work type (matches against a spec). */
  workType?: string | null;
  /** The project's answers_json (already parsed to an object, or JSON string). */
  answers?: Record<string, any> | string | null;
  /**
   * Optional freeform cost string from the AI classifier
   * (classification.price_band_estimate). Used when no deterministic
   * range can be computed.
   */
  fallback?: string | null;
};

function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export default function PriceRangeBadge({
  workType,
  answers,
  fallback,
}: Props) {
  if (!isProjectPriceRangeEnabled()) return null;

  const range = computeProjectPriceRange(workType, answers);

  let valueText: string | null = null;
  let caveat: string | null = null;

  if (range) {
    valueText = `${formatGbp(range.min)}–${formatGbp(range.max)}`;
    caveat = "Based on your job details. This is a ballpark, not a quote.";
  } else if (fallback && String(fallback).trim()) {
    valueText = String(fallback).trim();
    caveat =
      "Based on our AI reading of your description. This is a ballpark, not a quote.";
  }

  if (!valueText) return null;

  return (
    <div
      data-testid="price-range-badge"
      className="mt-4 flex flex-col gap-1 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-violet-900"
    >
      <span className="text-xs font-bold uppercase tracking-wider text-violet-700">
        Typical cost range
      </span>
      <span className="text-lg font-semibold" data-testid="price-range-value">
        {valueText}
      </span>
      <span className="text-xs text-violet-700/80">{caveat}</span>
    </div>
  );
}
