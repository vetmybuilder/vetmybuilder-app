import type { CategoryRatings } from "@/types/builderTypes";

export const CATEGORY_LABELS: Record<keyof CategoryRatings, string> = {
  quality: "Quality",
  reliability: "Reliability",
  communication: "Communication",
  trust: "Trust",
  value: "Value",
};

export const CATEGORY_ORDER: Array<keyof CategoryRatings> = [
  "quality",
  "reliability",
  "communication",
  "trust",
  "value",
];

export function hasAnyRating(ratings: CategoryRatings | null | undefined) {
  if (!ratings) return false;
  return CATEGORY_ORDER.some((k) => typeof ratings[k] === "number");
}

export function ratingAverage(ratings: CategoryRatings | null | undefined) {
  if (!ratings) return null;
  const values = CATEGORY_ORDER.map((k) => ratings[k]).filter(
    (v): v is number => typeof v === "number",
  );
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function deterministicSummary(
  ratings: CategoryRatings | null | undefined,
): string | null {
  if (!ratings) return null;

  const entries = CATEGORY_ORDER.map((k) => ({
    key: k,
    label: CATEGORY_LABELS[k].toLowerCase(),
    value: ratings[k],
  })).filter((e): e is { key: keyof CategoryRatings; label: string; value: number } =>
    typeof e.value === "number",
  );

  if (entries.length === 0) return null;

  const avg = entries.reduce((a, b) => a + b.value, 0) / entries.length;
  const fives = entries.filter((e) => e.value === 5);
  const lows = entries.filter((e) => e.value <= 3);

  if (entries.every((e) => e.value === 5)) {
    return "Outstanding all round - top marks across every category.";
  }

  if (fives.length >= 3 && lows.length === 0) {
    return `Strong all round - top marks for ${joinList(fives.map((e) => e.label))}.`;
  }

  if (avg >= 4 && fives.length >= 1) {
    const standout = fives[0];
    return `Solid recommendation - ${standout.label} stood out at 5 stars.`;
  }

  if (avg >= 4) {
    return `Solid recommendation - average ${avg.toFixed(1)} across categories.`;
  }

  return `Mixed - average ${avg.toFixed(1)} across categories.`;
}
