import Chance from "chance";

const chance = new Chance();

export type ProjectCreateInput = {
  category: string;
  workTypes: string[];
  locationQuery: string; // e.g. "E4"
  locationPick: string; // e.g. "E4 0BQ"
  propertyType: string;
  bedrooms: number;

  timeframe: string; // must match UI options
  budget: string; // must match UI options
  materials: string; // must match UI options
  access: string; // must match chip label
  extraNotes?: string;
};

export type ApiProjectPayload = {
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
};

function normalize(s: string) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function ensureEndsWithPeriod(s: string) {
  const out = normalize(s);
  if (!out) return out;
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

function buildAutoNameSimple(
  primaryType: string,
  location: string,
  propertyType?: string,
) {
  const t = normalize(primaryType);
  const loc = normalize(location);
  const prop = normalize(propertyType || "");
  if (t && loc && prop) return `${t} in ${loc} (${prop})`;
  if (t && loc) return `${t} in ${loc}`;
  return t || "Project";
}

export default class Project {
  category!: string;
  workTypes!: string[];
  locationQuery!: string;
  locationPick!: string;
  propertyType!: string;
  bedrooms!: number;

  timeframe!: string;
  budget!: string;
  materials!: string;
  access!: string;
  extraNotes?: string;

  static aProject(): Project {
    return new Project();
  }

  withRandomDetails(overrides?: Partial<ProjectCreateInput>): Project {
    const base: ProjectCreateInput = {
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,

      // IMPORTANT: these default values must match the UI option strings
      timeframe: "Urgent (1-2 weeks)",
      budget: "£30k-£60k",
      materials: "Supplied by homeowner",
      access: "Parking available",
      extraNotes: chance.sentence({ words: 8 }).replace(/\.$/, "."),
    };

    const next = { ...base, ...(overrides || {}) };

    this.category = next.category;
    this.workTypes = next.workTypes;
    this.locationQuery = next.locationQuery;
    this.locationPick = next.locationPick;
    this.propertyType = next.propertyType;
    this.bedrooms = next.bedrooms;

    this.timeframe = next.timeframe;
    this.budget = next.budget;
    this.materials = next.materials;
    this.access = next.access;
    this.extraNotes = next.extraNotes;

    return this;
  }

  toCreateInput(): ProjectCreateInput {
    return {
      category: this.category,
      workTypes: this.workTypes,
      locationQuery: this.locationQuery,
      locationPick: this.locationPick,
      propertyType: this.propertyType,
      bedrooms: this.bedrooms,
      timeframe: this.timeframe,
      budget: this.budget,
      materials: this.materials,
      access: this.access,
      extraNotes: this.extraNotes,
    };
  }

  /**
   * Exact text that should appear in DescriptionBuilder preview.
   * (Matches DescriptionBuilder formatting: "Timeframe: X." etc)
   */
  expectedDescriptionPreview(): string {
    const input = this.toCreateInput();
    return [
      `Timeframe: ${ensureEndsWithPeriod(input.timeframe)}`,
      `Budget: ${ensureEndsWithPeriod(input.budget)}`,
      `Materials: ${ensureEndsWithPeriod(input.materials)}`,
      `Access: ${ensureEndsWithPeriod(input.access)}`,
      ensureEndsWithPeriod(input.extraNotes || ""),
    ]
      .filter((x) => normalize(x))
      .join("\n");
  }

  /**
   * API payload (kept for API tests)
   */
  toApiPayload(): ApiProjectPayload {
    const input = this.toCreateInput();
    const primaryType = normalize(input.workTypes?.[0] || input.category || "");

    return {
      name: buildAutoNameSimple(
        primaryType,
        input.locationPick,
        input.propertyType,
      ),
      type: primaryType,
      location: normalize(input.locationPick || input.locationQuery),
      description: this.expectedDescriptionPreview(),
      propertyType: normalize(input.propertyType),
      bedrooms: Number.isFinite(Number(input.bedrooms))
        ? Number(input.bedrooms)
        : 0,
    };
  }

  toPayload(): ApiProjectPayload {
    return this.toApiPayload();
  }
}
