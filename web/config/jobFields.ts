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

export const _FILE_VERSION = 2;

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

/** A set of structured questions triggered by one of a list of work types. */
export type Spec = {
  id: string;           // stable identifier, e.g. "flooring"
  label: string;        // human label for debugging / logs
  workTypes: string[];  // a project's primary work type must match one of these
  groups: FieldGroup[];
};

// Answer shape is intentionally loose — the authoritative shape is the config.
// Structure: `{ _version: number, [groupId]: { [fieldKey]: value } }` where
// `either` fields serialise as `{ kind: "m2" | "rooms", value: number }`.
// Validation is handled by validateGroup / validateAnswers, not the TS type.
export type AnswersShape = Record<string, any>;

// Backward-compat alias — older code still imports CategorySpec.
export type CategorySpec = Spec;

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
