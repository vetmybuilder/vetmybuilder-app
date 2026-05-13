// web/components/ratings/StarRatingList.tsx
//
// Shared 5-category star-rating UI used by:
//   - /projects/:id/recommend (homeowner recommends a tradesperson)
//   - the close-job modal "No, I wasn't satisfied" branch (CR3)
//
// Categories + state shape live here so both surfaces stay in lockstep.
// Submitting code reads the same fields (quality / reliability /
// communication / trust / value) regardless of which form the user
// filled in.
import * as React from "react";
import { Star } from "lucide-react";

export type RatingKey =
  | "quality"
  | "reliability"
  | "communication"
  | "trust"
  | "value";

export type RatingsState = Record<RatingKey, number>;

export const RATING_CATEGORIES: Array<{ key: RatingKey; label: string }> = [
  { key: "quality", label: "Quality of work" },
  { key: "reliability", label: "Reliability" },
  { key: "communication", label: "Communication" },
  { key: "trust", label: "Trust" },
  { key: "value", label: "Value for money" },
];

export const EMPTY_RATINGS: RatingsState = {
  quality: 0,
  reliability: 0,
  communication: 0,
  trust: 0,
  value: 0,
};

type StarRowProps = {
  label: string;
  value: number;
  onChange: (n: number) => void;
  /** Override the row's outer styling. Default mirrors the desktop
   *  /recommend layout (amber-tinted card). */
  rowClassName?: string;
  /** Prefix for each star button's data-testid. The mobile /recommend
   *  page expects "recommend-star"; new callers can use the default. */
  testIdPrefix?: string;
};

export function StarRow({
  label,
  value,
  onChange,
  rowClassName,
  testIdPrefix = "rating-star",
}: StarRowProps) {
  const cls =
    rowClassName ??
    "flex items-center justify-between gap-3 bg-white border border-amber-100 rounded-2xl px-4 py-3";
  return (
    <div className={cls}>
      <div className="text-[13px] font-extrabold tracking-tight text-zinc-900">
        {label}
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value >= n;
          return (
            <button
              key={n}
              type="button"
              aria-label={`${label}: ${n} of 5 stars`}
              aria-pressed={value === n}
              onClick={() => onChange(value === n ? 0 : n)}
              className="p-0.5"
              data-testid={`${testIdPrefix}-${label.replace(/\s+/g, "-").toLowerCase()}-${n}`}
            >
              <Star
                className={`w-5 h-5 ${
                  on
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-zinc-300"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

type StarRatingListProps = {
  value: RatingsState;
  onChange: (next: RatingsState) => void;
  /** Override the list of categories. Defaults to the 5 standard ones. */
  categories?: typeof RATING_CATEGORIES;
  /** Forwarded to each StarRow. */
  rowClassName?: string;
  testIdPrefix?: string;
  /** Outer wrapper className. Defaults to vertical stack with gap-2. */
  className?: string;
};

export function StarRatingList({
  value,
  onChange,
  categories = RATING_CATEGORIES,
  rowClassName,
  testIdPrefix,
  className,
}: StarRatingListProps) {
  return (
    <div className={className ?? "space-y-2"}>
      {categories.map((cat) => (
        <StarRow
          key={cat.key}
          label={cat.label}
          value={value[cat.key] ?? 0}
          onChange={(n) =>
            onChange({ ...value, [cat.key]: n })
          }
          rowClassName={rowClassName}
          testIdPrefix={testIdPrefix}
        />
      ))}
    </div>
  );
}
