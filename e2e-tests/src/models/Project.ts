// e2e-tests/src/models/Project.ts
import Chance from "chance";
const chance = new Chance();

export type ProjectInput = {
  name: string;
  type: string;
  /** Stored as a single string in DB; can be postcode like "E4" or "E4 6JH" */
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
};

type PersistedFields = {
  id?: number;
  status?: string;
  createdAt?: string; // ISO datetime from server
  ownerUserId?: string; // set by server
};

const PROPERTY_TYPES = [
  "Detached",
  "Semi-Detached",
  "Terraced",
  "End of Terrace",
  "Flat",
  "Bungalow",
  "Cottage",
  "Maisonette",
  "Townhouse",
  "Other",
] as const;

const AREAS = [
  "Kitchen",
  "Bathroom",
  "Loft",
  "Roof",
  "Garden",
  "Garage",
  "Office",
  "Basement",
  "Bedroom",
  "Living room",
] as const;

const ACTIONS = [
  "Refit",
  "Extension",
  "Conversion",
  "Remodel",
  "Makeover",
  "Upgrade",
] as const;

const TYPES = [
  "Kitchen remodel",
  "Bathroom refit",
  "Loft conversion",
  "Extension",
  "Garage conversion",
  "Full renovation",
  "Painting & decorating",
  "Boiler install",
  "Roof replacement",
] as const;

// Examples include both place names and postcodes; server treats `location` as a free string.
const LOCATIONS = ["Walthamstow", "E4", "E4 6JH", "Chingford"] as const;

export default class Project implements ProjectInput, PersistedFields {
  // input fields
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;

  // persisted (optional) fields
  id?: number;
  status?: string;
  createdAt?: string;
  ownerUserId?: string;

  constructor(init?: Partial<ProjectInput & PersistedFields>) {
    const pt =
      PROPERTY_TYPES[
        chance.integer({ min: 0, max: PROPERTY_TYPES.length - 1 })
      ];

    this.name =
      init?.name ?? `${chance.pickone(AREAS)} ${chance.pickone(ACTIONS)}`;
    this.type = init?.type ?? chance.pickone(TYPES);
    this.location = init?.location ?? chance.pickone(LOCATIONS);
    this.description = init?.description ?? chance.sentence({ words: 12 });
    this.propertyType = init?.propertyType ?? pt;
    this.bedrooms = init?.bedrooms ?? chance.integer({ min: 1, max: 6 });

    // carry through optional persisted fields if provided
    this.id = init?.id;
    this.status = init?.status;
    this.createdAt = init?.createdAt;
    this.ownerUserId = init?.ownerUserId;
  }

  static aProject(overrides?: Partial<ProjectInput & PersistedFields>) {
    return new Project(overrides);
  }

  withName(v: string) {
    this.name = v;
    return this;
  }
  withType(v: string) {
    this.type = v;
    return this;
  }
  /** Keep for backward-compat; sets the same underlying field used by the API. */
  withLocation(v: string) {
    this.location = v;
    return this;
  }
  /** New convenience: same as withLocation, aligns with signup terminology. */
  withPostcode(v: string) {
    this.location = v;
    return this;
  }
  withDescription(v: string) {
    this.description = v;
    return this;
  }
  withPropertyType(v: string) {
    this.propertyType = v;
    return this;
  }
  withBedrooms(v: number) {
    this.bedrooms = v;
    return this;
  }

  // optional convenience setters for persisted fields
  withId(v: number) {
    this.id = v;
    return this;
  }
  withStatus(v: string) {
    this.status = v;
    return this;
  }
  withCreatedAt(v: string) {
    this.createdAt = v;
    return this;
  }
  withOwnerUserId(v: string) {
    this.ownerUserId = v;
    return this;
  }

  toJSON(): ProjectInput {
    return {
      name: this.name,
      type: this.type,
      location: this.location,
      description: this.description,
      propertyType: this.propertyType,
      bedrooms: Number(this.bedrooms) || 0,
    };
  }
}
