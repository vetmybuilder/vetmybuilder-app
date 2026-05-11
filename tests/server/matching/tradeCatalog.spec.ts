// Drift-guard for the trade catalog. The catalog
// (web/types/trades.data.json) is the single source of truth - the
// frontend, the ghost-seed script, and the dev-manual sim all derive
// from it. These tests fire when adding a trade to the JSON drops it
// into a state where it can never surface in matching, or when other
// machinery references buckets/labels that no longer exist.
import { describe, it, expect } from "vitest";
import rawTrades from "../../../web/types/trades.data.json";

const {
  CATEGORY_TRADES,
  TYPE_TRADES,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("../../../server/lib/matching/projectTradeMap.js");

type CatalogEntry = {
  label: string;
  synonyms?: string[];
  buckets?: string;
  popularity?: number;
  active?: boolean;
};

const CATALOG = rawTrades as CatalogEntry[];
const ACTIVE = CATALOG.filter((t) => t.active !== false);

// Trades that legitimately don't appear in any project-type category
// because they're not directly home-services bookable. Add new entries
// here only if intentional - the next test will fail loudly otherwise.
//
// Each whitelisted trade should have a one-line justification - "why is
// it in the catalog at all if no project type surfaces it?"
const ALLOWED_ORPHANS = new Set<string>([
  // Sub-trades / supporting services - homeowners book the main job and
  // the lead trade brings these in:
  "Scaffolder", // booked by roofer/extension builder, not direct
  "Asbestos Removal", // booked by demolition/extension lead
  "Party Wall Surveyor", // pulled in by extension builder
  "Building Control (Approved Inspector)", // statutory, attached to extension/loft
  // Niche specialist installs - kept in the trade catalog so existing
  // ghost trades + tradesperson signups can pick them, but no homeowner
  // project type currently maps to them:
  "Shutters / Blinds",
  "Curtains / Soft Furnishings",
  "Sprinklers",
  "Swimming Pools",
  "Sauna / Steam",
]);

// Mirrors the derivation in scripts/seed-ghost-trades.js. If this list
// goes empty, the secondary-pick logic falls back to nothing.
const SEED_BUCKETS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const t of ACTIVE) {
    if (!t.buckets) continue;
    (out[t.buckets] ||= []).push(t.label);
  }
  return out;
})();

describe("trades.data.json catalog", () => {
  it("has unique labels (no accidental duplicates)", () => {
    const seen = new Map<string, number>();
    for (const t of CATALOG) {
      seen.set(t.label, (seen.get(t.label) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([l]) => l);
    expect(dupes).toEqual([]);
  });

  it("every active trade has a bucket (else seed secondary-pick can't reach it)", () => {
    const missing = ACTIVE.filter((t) => !t.buckets).map((t) => t.label);
    expect(missing).toEqual([]);
  });

  it("derivation produces a non-trivial number of trades and buckets", () => {
    expect(ACTIVE.length).toBeGreaterThan(50);
    expect(Object.keys(SEED_BUCKETS).length).toBeGreaterThan(5);
  });
});

describe("trade reachability from project types", () => {
  it("every active trade is referenced by at least one CATEGORY_TRADES or TYPE_TRADES list", () => {
    const reachable = new Set<string>();
    for (const trades of Object.values(CATEGORY_TRADES)) {
      for (const t of trades as string[]) reachable.add(t);
    }
    for (const trades of Object.values(TYPE_TRADES)) {
      for (const t of trades as string[]) reachable.add(t);
    }
    const orphans = ACTIVE.map((t) => t.label).filter(
      (label) => !reachable.has(label) && !ALLOWED_ORPHANS.has(label),
    );
    // If you hit this: the new trade you added to trades.data.json isn't
    // wired into any CATEGORY_TRADES/TYPE_TRADES bucket in
    // server/lib/matching/projectTradeMap.js, so no project posting
    // surfaces it. Either add it there or whitelist via ALLOWED_ORPHANS.
    expect(orphans).toEqual([]);
  });
});
