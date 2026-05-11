// web/types/tradeTypes.ts
//
// Single source of truth for the trade catalog is `trades.data.json` in
// this directory. Both the frontend (this file, via TS import) and the
// Node-side seed/sim scripts (`scripts/seed-ghost-trades.js`, `scripts/
// dev-manual-sim.js`) read from that JSON. Adding a trade = edit the
// JSON file only; the drift-guard test in
// `tests/server/matching/tradeCatalog.spec.ts` will fail loudly if any
// place falls out of sync.

import rawTrades from "./trades.data.json";

export type TradeType = {
  label: string;
  synonyms?: string[];
  buckets?: string; // optional grouping (e.g., "Heating", "Structure")
  popularity?: number; // used for sorting if you like
  active?: boolean; // default true
};

export const TRADE_TYPES: TradeType[] = rawTrades as TradeType[];

// Convenience: flat list of active labels
export const ALL_TRADE_LABELS = TRADE_TYPES.filter(
  (t) => t.active !== false
).map((t) => t.label);

// Bucket → trade labels. Derived from TRADE_TYPES.buckets so callers don't
// have to maintain a parallel map. Used by the seed script's
// "secondary trades come from the same bucket" logic.
export const BUCKET_MAP: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const t of TRADE_TYPES) {
    if (t.active === false) continue;
    const b = t.buckets;
    if (!b) continue;
    (out[b] ||= []).push(t.label);
  }
  return out;
})();
