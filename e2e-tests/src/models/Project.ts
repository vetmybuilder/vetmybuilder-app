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

  /** Only present when the work type triggers a dynamic-fields spec. */
  flooringAnswers?: FlooringAnswers;
  insulationAnswers?: InsulationAnswers;
};

export type ApiProjectPayload = {
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  answers?: AnswersPayload;
};

/** Structured homeowner answers — mirrors the shape written to projects.answers_json. */
export type AnswersPayload = {
  _version: 1;
  flooring?: FlooringAnswers;
  insulation?: InsulationAnswers;
};

export type FlooringAnswers = {
  size: { kind: "m2" | "rooms"; value: number };
  floor_type: "carpet" | "lvt" | "engineered_wood" | "laminate" | "solid_wood" | "tile";
  removal_required?: boolean;
  subfloor_condition?: "unknown" | "level" | "needs_levelling";
};

export type InsulationAnswers = {
  area_m2?: number;
  current_state?: "none" | "thin" | "unknown";
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

  /** Category-specific structured answers, if any. */
  flooringAnswers?: FlooringAnswers;
  insulationAnswers?: InsulationAnswers;

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
      budget: "5k - 15k",
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

  /**
   * Attach structured flooring answers. Only `size` and `floor_type` have
   * defaults because those are the two required fields. The optional
   * `removal_required` / `subfloor_condition` are omitted unless the caller
   * explicitly sets them — mirroring what the UI actually persists when the
   * user doesn't interact with the optional controls (a boolean the user
   * never touched is stored as absent, not as `false`).
   */
  withFlooringAnswers(overrides?: Partial<FlooringAnswers>): Project {
    const defaults: Pick<FlooringAnswers, "size" | "floor_type"> = {
      size: { kind: "m2", value: 50 },
      floor_type: "engineered_wood",
    };
    this.flooringAnswers = {
      ...defaults,
      ...(overrides || {}),
    } as FlooringAnswers;
    return this;
  }

  /**
   * Attach structured insulation answers. All fields are optional — the
   * insulation spec has no required fields because the work type already
   * identifies what's being insulated. Tests can pass partial overrides
   * or an empty object to signal "user filled no details".
   */
  withInsulationAnswers(overrides?: Partial<InsulationAnswers>): Project {
    this.insulationAnswers = { ...(overrides || {}) } as InsulationAnswers;
    return this;
  }

  withLocation(location: { query: string; pick: string } | string): Project {
    if (typeof location === "string") {
      const v = normalize(location);
      this.locationQuery = v;
      this.locationPick = v;
      return this;
    }

    this.locationQuery = normalize(location.query);
    this.locationPick = normalize(location.pick);
    return this;
  }

  withLocationQuery(query: string): Project {
    this.locationQuery = normalize(query);
    return this;
  }

  withLocationPick(pick: string): Project {
    this.locationPick = normalize(pick);
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
      flooringAnswers: this.flooringAnswers,
      insulationAnswers: this.insulationAnswers,
    };
  }

  /** Full structured answers payload, or undefined when none have been set. */
  toAnswersPayload(): AnswersPayload | undefined {
    if (!this.flooringAnswers && !this.insulationAnswers) return undefined;
    const out: AnswersPayload = { _version: 1 };
    if (this.flooringAnswers) out.flooring = this.flooringAnswers;
    if (this.insulationAnswers) out.insulation = this.insulationAnswers;
    return out;
  }

  expectedDescriptionPreview(): string {
    const input = this.toCreateInput();
    const lines: string[] = [];
    if (input.timeframe) lines.push(`Timeframe: ${ensureEndsWithPeriod(input.timeframe)}`);
    if (input.budget) lines.push(`Budget: ${ensureEndsWithPeriod(input.budget)}`);
    if (input.materials) lines.push(`Materials: ${ensureEndsWithPeriod(input.materials)}`);
    if (input.access) lines.push(`Access: ${ensureEndsWithPeriod(input.access)}`);
    if (input.extraNotes) lines.push(normalize(input.extraNotes));
    return lines.join("\n");
  }

  /**
   * API payload (kept for API tests). Includes `answers` only when structured
   * answers have been attached via withFlooringAnswers(); omitted otherwise so
   * non-Flooring tests exercise the no-answers path unchanged.
   */
  toApiPayload(): ApiProjectPayload {
    const input = this.toCreateInput();
    const primaryType = normalize(input.workTypes?.[0] || input.category || "");

    const payload: ApiProjectPayload = {
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

    const answers = this.toAnswersPayload();
    if (answers) payload.answers = answers;

    return payload;
  }

  toPayload(): ApiProjectPayload {
    return this.toApiPayload();
  }

  /**
   * Update-safe payload for PUT /api/projects/:id. Omits `location` because
   * the server rejects location changes with 400 and also strips full UK
   * postcodes on write, so re-sending the raw model location would look
   * like a change even when it isn't. The PUT endpoint supports partial
   * updates, so omitted fields just keep their stored values.
   */
  toApiUpdatePayload(): Omit<ApiProjectPayload, "location"> {
    const { location: _ignored, ...rest } = this.toApiPayload();
    return rest;
  }
}
