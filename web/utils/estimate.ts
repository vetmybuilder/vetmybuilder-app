// web/utils/estimate.ts

export type EstimateInput = {
  category: string | null;
  types: string[]; // list of work-type labels
  location: string;
  propertyType: string;
  bedrooms: number;
  description: string;
};

export type EstimateBreakdown = {
  baseLow: number;
  baseHigh: number;
  sizeFactor: number;
  regionalFactor: number;
  materialsFactor: number;
  urgencyFactor: number;
  accessFactor: number;
  skipLow: number;
  skipHigh: number;
  contingencyFactor: number;
};

export type EstimateResult = {
  low: number; // £
  high: number; // £
  breakdown: EstimateBreakdown;
};

type Range = { low: number; high: number };

// ---------------------------------------------------------------------------
// Config tables
// ---------------------------------------------------------------------------

/**
 * Base pricing per work-type label.
 *
 * IMPORTANT: keys must match the labels from PROJECT_TYPES / project.type,
 * e.g. "Bathroom Remodel (Full)" exactly as shown in your screenshot.
 *
 * These numbers are BASE build costs (labour + a typical share of materials)
 * before we apply:
 *   - regional factor (London uplift)
 *   - materialsFactor (depending on "Materials:" line)
 *   - contingency
 *
 * For Bathroom Remodel (Full) we calibrate so that in CENTRAL LONDON
 * with "Mixed materials" the final range lands roughly around
 * £6,500–£13,000 for a standard project.
 */
const WORK_TYPE_PRICING: Record<string, Range> = {
  // Carpentry / joinery examples
  "Kitchen Fitting (Carpentry)": { low: 1000, high: 3000 },
  "Shelving & Joinery Repairs": { low: 300, high: 800 },
  "Staircase Renovation": { low: 1500, high: 2500 },
  "Skirting & Architraves": { low: 400, high: 1200 },

  // Bathrooms – calibrated from current UK/London guides
  // For a full bathroom remodel in London, sources show ~£6.5k–£13k+
  // for standard → high-spec projects.
  // We store a UK-ish baseline here (includes typical materials),
  // and let London uplift + contingency push it into that band.
  "Bathroom Remodel (Full)": { low: 4300, high: 8600 },

  // You can add more bathroom types as you introduce them:
  // "Bathroom Refresh (Light)": { low: 2500, high: 5000 },
};

const CATEGORY_DEFAULTS: Record<string, Range> = {
  "Carpentry & Joinery": { low: 300, high: 1200 },
  Bathrooms: { low: 4000, high: 8000 }, // generic bathroom baseline
  // Add more categories when you wire category through to projects:
  // "Kitchens": { low: 4500, high: 9000 },
};

const GENERIC_FALLBACK: Range = { low: 500, high: 2000 };

/**
 * Postcode prefixes that are unambiguously London.
 * This will treat WC1A, EC1, SW11, etc. as London even if the word
 * "London" isn't typed into the location field.
 */
const LONDON_PREFIXES = ["E", "EC", "N", "NW", "SE", "SW", "W", "WC"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s.trim().toUpperCase();
}

function isLondon(location: string): boolean {
  if (!location) return false;
  const loc = normalise(location);

  // Explicit word
  if (loc.includes("LONDON")) return true;

  // Outward postcode, e.g. "WC1A" from "WC1A 1AB"
  const outward = loc.split(/\s+/)[0]; // first chunk before space
  return LONDON_PREFIXES.some((prefix) => outward.startsWith(prefix));
}

type ParsedMeta = {
  materials: "tradesman" | "homeowner" | "mixed" | "unknown";
  urgent: boolean;
  flexible: boolean;
  needsSkip: boolean;
  trickyAccess: boolean;
  budgetLow?: number;
  budgetHigh?: number;
};

function parseDescriptionMeta(desc: string): ParsedMeta {
  const text = desc || "";
  const lower = text.toLowerCase();

  // --- Materials line ---
  let materials: ParsedMeta["materials"] = "unknown";
  const materialsLineMatch = text.match(/materials:\s*([^\n\.]+)/i);
  const materialsChunk = materialsLineMatch?.[1]?.toLowerCase() || lower;

  if (/tradesman|builder.*supply|materials included/.test(materialsChunk)) {
    materials = "tradesman";
  } else if (/mixed|some provided|50\/50|50-50|half/.test(materialsChunk)) {
    materials = "mixed";
  } else if (
    /homeowner|i will provide|client to supply|materials provided/.test(
      materialsChunk
    )
  ) {
    materials = "homeowner";
  }

  // --- Timeframe / urgency ---
  const urgent =
    /urgent|asap|1-2 weeks|1–2 weeks|within 2 weeks|2 weeks or less/.test(
      lower
    );
  const flexible =
    /flexible|no rush|whenever|3\+ months|3 months\+|next 3 months/.test(lower);

  // --- Access / waste ---
  const needsSkip = /skip|skip hire|full rip[- ]?out|strip out/.test(lower);
  const trickyAccess =
    /parking permit needed|no parking|limited access|scaffold|scaffolding/.test(
      lower
    );

  // --- Budget (optional) e.g. "Budget: £15k–£30k" ---
  let budgetLow: number | undefined;
  let budgetHigh: number | undefined;
  const budgetMatch = text.match(
    /budget:\s*£?\s*([\d,\.kK]+)\s*[–-]\s*£?\s*([\d,\.kK]+)/i
  );
  if (budgetMatch) {
    budgetLow = parseMoneyLike(budgetMatch[1]);
    budgetHigh = parseMoneyLike(budgetMatch[2]);
  }

  return {
    materials,
    urgent,
    flexible,
    needsSkip,
    trickyAccess,
    budgetLow,
    budgetHigh,
  };
}

function parseMoneyLike(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, "");
  const isK = s.endsWith("k");
  const num = parseFloat(isK ? s.slice(0, -1) : s);
  if (Number.isNaN(num)) return 0;
  return isK ? num * 1000 : num;
}

function getBaseForType(typeLabel: string, category: string | null): Range {
  if (typeLabel && WORK_TYPE_PRICING[typeLabel]) {
    return WORK_TYPE_PRICING[typeLabel];
  }

  if (category && CATEGORY_DEFAULTS[category]) {
    return CATEGORY_DEFAULTS[category];
  }

  return GENERIC_FALLBACK;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Main estimator
// ---------------------------------------------------------------------------

export function estimateProjectCost(input: EstimateInput): EstimateResult {
  const { category, types, location, bedrooms, description } = input;

  // 1. Base per-type cost with bundle discount
  let baseLow = 0;
  let baseHigh = 0;

  const uniqTypes = Array.from(new Set(types.filter(Boolean)));

  uniqTypes.forEach((typeLabel, index) => {
    const bundleWeight = index === 0 ? 1.0 : 0.7; // discounted for extra types
    const { low, high } = getBaseForType(typeLabel, category);
    baseLow += low * bundleWeight;
    baseHigh += high * bundleWeight;
  });

  // No explicit type – fall back to category/generic
  if (uniqTypes.length === 0) {
    const { low, high } = getBaseForType("", category);
    baseLow = low;
    baseHigh = high;
  }

  // 2. Size factor from bedrooms (3 bed ≈ baseline 1.0)
  const b = typeof bedrooms === "number" ? bedrooms : Number(bedrooms) || 0;
  const sizeFactor = clamp(0.85, 1.25, 1 + 0.05 * (b - 3));

  // 3. Region factor
  const regionalFactor = isLondon(location) ? 1.2 : 1.0;

  // 4. Description-derived factors
  const meta = parseDescriptionMeta(description || "");

  let materialsFactor = 1.1; // mild uplift default
  if (meta.materials === "tradesman") materialsFactor = 1.3;
  else if (meta.materials === "mixed") materialsFactor = 1.15;
  else if (meta.materials === "homeowner") materialsFactor = 1.0;

  let urgencyFactor = 1.0;
  if (meta.urgent) urgencyFactor = 1.1;
  else if (meta.flexible) urgencyFactor = 0.97;

  let accessFactor = 1.0;
  if (meta.trickyAccess) accessFactor = 1.05;

  // 5. Skip costs (rough UK average, slightly higher in London)
  const london = isLondon(location);
  const skipLow = meta.needsSkip ? (london ? 220 : 200) : 0;
  const skipHigh = meta.needsSkip ? (london ? 320 : 300) : 0;

  // 6. Contingency (10%)
  const contingencyFactor = 1.1;

  // 7. Combine
  const subtotalLow =
    baseLow *
    sizeFactor *
    regionalFactor *
    materialsFactor *
    urgencyFactor *
    accessFactor;

  const subtotalHigh =
    baseHigh *
    sizeFactor *
    regionalFactor *
    materialsFactor *
    urgencyFactor *
    accessFactor;

  const totalLow = (subtotalLow + skipLow) * contingencyFactor;
  const totalHigh = (subtotalHigh + skipHigh) * contingencyFactor;

  return {
    low: Math.round(totalLow),
    high: Math.round(totalHigh),
    breakdown: {
      baseLow,
      baseHigh,
      sizeFactor,
      regionalFactor,
      materialsFactor,
      urgencyFactor,
      accessFactor,
      skipLow,
      skipHigh,
      contingencyFactor,
    },
  };
}
