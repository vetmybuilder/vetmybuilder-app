import type { Recommendation } from "@/types/vmb";

export function displayRecommender(r: Recommendation) {
  if (r.isAnonymous === 1) return "Recommended by an Anonymous user";
  const name = (r.name ?? "").trim();
  return name ? `Recommended by ${name}` : "Recommended by a Guest";
}

export function normalizeName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
