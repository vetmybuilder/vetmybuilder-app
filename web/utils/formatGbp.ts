// web/utils/formatGbp.ts
// Shared GBP formatter used by PriceRangeBadge and JobCard.
export function formatGbp(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
