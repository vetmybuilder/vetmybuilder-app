// web/components/project/PriceRangeBadge.tsx
//
// Renders a deterministic "typical cost range" derived from a project's
// structured answers (see web/config/jobFields.ts). This is a *ballpark*,
// not a quote — copy and styling both reinforce that.

import * as React from "react";
import { computeProjectPriceRange } from "@/utils/projectPricing";
import { isProjectPriceRangeEnabled } from "@/utils/featureFlags";

type Props = {
  /** The project's primary work type (matches against a spec). */
  workType?: string | null;
  /** The project's answers_json (already parsed to an object, or JSON string). */
  answers?: Record<string, any> | string | null;
};

function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

export default function PriceRangeBadge({ workType, answers }: Props) {
  if (!isProjectPriceRangeEnabled()) return null;

  const range = computeProjectPriceRange(workType, answers);
  if (!range) return null;

  return (
    <div
      data-testid="price-range-badge"
      className="mt-4 flex flex-col gap-1 rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-violet-900"
    >
      <span className="text-xs font-bold uppercase tracking-wider text-violet-700">
        Typical cost range
      </span>
      <span className="text-lg font-semibold" data-testid="price-range-value">
        {formatGbp(range.min)}–{formatGbp(range.max)}
      </span>
      <span className="text-xs text-violet-700/80">
        Based on your job details. This is a ballpark, not a quote.
      </span>
    </div>
  );
}
