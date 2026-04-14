// web/config/jobFields.ts
//
// Single source of truth for work-type-specific structured questions.
// Mirror this file at server/lib/jobFields.js when you edit it.
// The _FILE_VERSION constant is checked at server startup and logs a
// warning if the two files have drifted.
//
// Specs match on WORK TYPE, not category — the same flooring questions
// apply whether the homeowner filed the job under "Flooring", "Bathroom"
// (Bathroom Flooring), "Kitchen" (Kitchen Flooring), etc.

export const _FILE_VERSION = 3;

export type FieldKind = "number" | "select" | "boolean" | "either";

export type NumberField = {
  key: string;
  kind: "number";
  label: string;
  unit?: "m2" | "count";
  required?: boolean;
  help?: string;
};

export type SelectField = {
  key: string;
  kind: "select";
  label: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  help?: string;
  showIf?: (answers: AnswersShape) => boolean;
};

export type BooleanField = {
  key: string;
  kind: "boolean";
  label: string;
  required?: boolean;
  help?: string;
};

export type EitherField = {
  key: string;
  kind: "either";
  branches: [NumberField, NumberField];
  required?: boolean;
  help?: string;
};

export type Field = NumberField | SelectField | BooleanField | EitherField;

export type FieldGroup = {
  id: string;
  title: string;
  fields: Field[];
};

/** Typical cost range in GBP produced by a spec's priceModel. */
export type PriceRange = { min: number; max: number };

/**
 * Optional deterministic price-range estimator per spec. Runs client-side
 * against the homeowner's own answers. Return `null` when we can't produce
 * a meaningful range (missing required inputs).
 *
 * Explicitly typed as `any` for answers because the authoritative shape is
 * the spec itself — implementations should narrow as they consume fields.
 */
export type PriceModel = (answers: AnswersShape) => PriceRange | null;

/** A set of structured questions triggered by one of a list of work types. */
export type Spec = {
  id: string;           // stable identifier, e.g. "flooring"
  label: string;        // human label for debugging / logs
  workTypes: string[];  // a project's primary work type must match one of these
  groups: FieldGroup[];
  /**
   * Returns a typical cost range from the homeowner's structured answers.
   * Deliberately a *range*, not a point estimate — we never want this to
   * read as a quote.
   */
  priceModel?: PriceModel;
};

// Answer shape is intentionally loose — the authoritative shape is the config.
// Structure: `{ _version: number, [groupId]: { [fieldKey]: value } }` where
// `either` fields serialise as `{ kind: "m2" | "rooms", value: number }`.
// Validation is handled by validateGroup / validateAnswers, not the TS type.
export type AnswersShape = Record<string, any>;

// Backward-compat alias — older code still imports CategorySpec.
export type CategorySpec = Spec;

// ──────────────────────────────────────────────────────────────────
// Flooring price model
// ──────────────────────────────────────────────────────────────────
// Rough UK retail ranges. Treat as ballpark — not a quote. Refine these
// as you gather real builder quotes / look at completed-project data.
const FLOORING_RATES: Record<
  string,
  { labour: [number, number]; material: [number, number] }
> = {
  carpet:           { labour: [8, 12],  material: [10, 30]  },
  laminate:         { labour: [15, 25], material: [15, 40]  },
  lvt:              { labour: [20, 35], material: [25, 60]  },
  engineered_wood:  { labour: [25, 40], material: [40, 90]  },
  solid_wood:       { labour: [30, 50], material: [50, 150] },
  tile:             { labour: [40, 60], material: [20, 80]  },
};

/** m² per room when the user picked "rooms" instead of m² — conservative UK avg. */
const AVG_ROOM_M2 = 16;

/** Round both ends of a range outwards to the nearest £50 so totals read cleanly. */
function roundToFifty(n: number, dir: "down" | "up"): number {
  const f = dir === "down" ? Math.floor : Math.ceil;
  return Math.max(0, f(n / 50) * 50);
}

const flooringPriceModel: PriceModel = (answers) => {
  const f = answers?.flooring;
  if (!f || typeof f !== "object") return null;

  // Resolve area in m². Either the user entered m² directly, or rooms → convert.
  let m2: number | null = null;
  if (f.size && typeof f.size === "object") {
    const v = Number(f.size.value);
    if (Number.isFinite(v) && v > 0) {
      m2 = f.size.kind === "rooms" ? v * AVG_ROOM_M2 : v;
    }
  }
  if (m2 == null || m2 <= 0) return null;

  const rates = FLOORING_RATES[String(f.floor_type || "")];
  if (!rates) return null;

  let minPerM2 = rates.labour[0] + rates.material[0];
  let maxPerM2 = rates.labour[1] + rates.material[1];

  // Removal surcharge
  if (f.removal_required === true) {
    minPerM2 += 5;
    maxPerM2 += 15;
  }

  // Subfloor levelling surcharge (only meaningful if removal required)
  if (f.subfloor_condition === "needs_levelling") {
    minPerM2 += 15;
    maxPerM2 += 30;
  }

  return {
    min: roundToFifty(minPerM2 * m2, "down"),
    max: roundToFifty(maxPerM2 * m2, "up"),
  };
};

const FLOORING_WORK_TYPES = [
  // Flooring category
  "Carpet Fitting",
  "Carpet Removal",
  "Cork Flooring",
  "Engineered Wood Installation",
  "Floor Levelling",
  "Floor Sanding & Refinishing",
  "Laminate Installation",
  "Parquet Installation",
  "Stone Flooring",
  "Subfloor Repair",
  "Tile Flooring",
  "Vinyl/LVT Installation",
  "Wood Floor Restoration",
  // Bathroom category
  "Bathroom Flooring",
  "Non-slip Flooring",
  "Floor Tiling",
  // Kitchen category
  "Kitchen Flooring",
  // Bedroom category
  "Bedroom Flooring Installation",
  "Bedroom Carpet Fitting",
  "Bedroom Laminate/LVT Installation",
  "Bedroom Wood Floor Sanding/Restoration",
];

export const JOB_FIELDS: Spec[] = [
  {
    id: "flooring",
    label: "Flooring",
    workTypes: FLOORING_WORK_TYPES,
    priceModel: flooringPriceModel,
    groups: [
      {
        id: "flooring",
        title: "About the floor",
        fields: [
          {
            key: "size",
            kind: "either",
            required: true,
            help: "Either is fine — m² gives better estimates if you have it.",
            branches: [
              {
                key: "m2",
                kind: "number",
                label: "Total floor area",
                unit: "m2",
              },
              {
                key: "rooms",
                kind: "number",
                label: "Number of rooms",
                unit: "count",
              },
            ],
          },
          {
            key: "floor_type",
            kind: "select",
            label: "Floor type",
            required: true,
            options: [
              { value: "carpet", label: "Carpet" },
              { value: "lvt", label: "Luxury vinyl tile" },
              { value: "engineered_wood", label: "Engineered wood" },
              { value: "laminate", label: "Laminate" },
              { value: "solid_wood", label: "Solid wood" },
              { value: "tile", label: "Tile" },
            ],
          },
          {
            key: "removal_required",
            kind: "boolean",
            label: "Need existing floor removed?",
          },
          {
            key: "subfloor_condition",
            kind: "select",
            label: "Subfloor condition",
            showIf: (a) => a.flooring?.removal_required === true,
            options: [
              { value: "unknown", label: "Not sure" },
              { value: "level", label: "Level and sound" },
              { value: "needs_levelling", label: "Needs levelling" },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Returns the spec that matches any of the provided work types, or null.
 * Matching is case-sensitive and exact — keep the spec's workTypes in sync
 * with the labels in web/types/projectTypes.ts.
 */
export function getSpecForSelection(
  selectedTypes?: string[] | null,
): Spec | null {
  if (!selectedTypes || selectedTypes.length === 0) return null;
  for (const spec of JOB_FIELDS) {
    for (const t of selectedTypes) {
      if (spec.workTypes.includes(t)) return spec;
    }
  }
  return null;
}

/**
 * @deprecated Use getSpecForSelection(selectedTypes) instead. Kept temporarily
 * for any external callers that already imported it.
 */
export function getCategorySpec(_category?: string | null): Spec | null {
  return null;
}
