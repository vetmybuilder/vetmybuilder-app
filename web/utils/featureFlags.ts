// web/utils/featureFlags.ts
//
// Tiny client-side feature-flag helper driven by Next's NEXT_PUBLIC_*
// environment variables. Each flag is read at module evaluation time;
// changes require a web rebuild. Deliberately minimal — if we later need
// per-user or remote-config flags we can swap this out.

function readBoolFlag(envVar: string, fallback: boolean): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (process.env as any)[envVar];
  if (raw == null) return fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === "" ) return fallback;
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/**
 * Typical cost-range badge on the project page. Default: off in prod, on in dev.
 * Override with NEXT_PUBLIC_FLAG_PROJECT_PRICE_RANGE=0 or 1.
 */
export function isProjectPriceRangeEnabled(): boolean {
  const defaultOn = process.env.NODE_ENV !== "production";
  return readBoolFlag("NEXT_PUBLIC_FLAG_PROJECT_PRICE_RANGE", defaultOn);
}
