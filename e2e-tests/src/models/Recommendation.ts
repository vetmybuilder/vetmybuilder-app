// e2e-tests/src/models/Recommendation.ts
import Chance from "chance";

const chance = new Chance();

export type RecommendationPhotoInput = {
  /** filename (e.g. "after.jpg") */
  name: string;
  /** MIME type (e.g. "image/jpeg") */
  mimeType: string;
  /** Raw bytes */
  buffer: Buffer;
};

export type RecommendationInput = {
  /** Recommender’s name (can be "Anonymous" for magic) */
  name: string;
  email?: string | null;
  phone?: string | null;
  /** Company being recommended */
  company: string;
  /** 1..5 (server clamps); optional for magic (can be derived from hireAgain) */
  rating?: number | null;
  /** Free text */
  comment: string;
  /** "platform" | "magic" (or custom string) */
  source?: string | null;
  /** Optional UX hint (magic only); server may map to rating */
  hireAgain?:
    | boolean
    | 0
    | 1
    | "0"
    | "1"
    | "true"
    | "false"
    | "yes"
    | "no"
    | null;
  /** Photos; Playwright form helper will send only the FIRST item reliably */
  photos?: RecommendationPhotoInput[] | null;
};

export default class Recommendation implements RecommendationInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company: string;
  rating?: number | null;
  comment: string;
  source?: string | null;
  hireAgain?:
    | boolean
    | 0
    | 1
    | "0"
    | "1"
    | "true"
    | "false"
    | "yes"
    | "no"
    | null;
  photos?: RecommendationPhotoInput[] | null;

  // optional persisted-ish fields if you want to hydrate later
  id?: number;

  constructor(init?: Partial<RecommendationInput & { id?: number }>) {
    this.name = init?.name ?? chance.name();
    this.email = init?.email ?? `${chance.first().toLowerCase()}@example.com`;
    this.phone = init?.phone ?? "+447700900123";
    this.company =
      init?.company ?? `${chance.capitalize(chance.word())} Builders`;
    this.rating = init?.rating ?? 5;
    this.comment =
      init?.comment ??
      chance.sentence({ words: 12 }) + " " + chance.sentence({ words: 10 });
    this.source = init?.source ?? "platform";
    this.hireAgain = init?.hireAgain ?? undefined;
    this.photos = init?.photos ?? null;
    this.id = init?.id;
  }

  /* ---------------- Factories ---------------- */

  /** Random but sensible defaults */
  static aRecommendation(
    overrides?: Partial<RecommendationInput & { id?: number }>
  ) {
    return new Recommendation(overrides);
  }

  /** Create many at once */
  static many(
    count: number,
    factory?: (i: number) => Partial<RecommendationInput>
  ) {
    const arr: Recommendation[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(Recommendation.aRecommendation(factory?.(i)));
    }
    return arr;
  }

  /* ---------------- Fluent builders ---------------- */

  withId(v: number) {
    this.id = v;
    return this;
  }

  withName(v: string) {
    this.name = v;
    return this;
  }

  withEmail(v?: string | null) {
    this.email = v ?? null;
    return this;
  }

  withPhone(v?: string | null) {
    this.phone = v ?? null;
    return this;
  }

  /** Alias to set the company (the tradesperson) */
  withTradesman(companyName: string) {
    this.company = companyName;
    return this;
  }

  withRecommenderName(name: string) {
    this.name = name;
    return this;
  }

  withCompany(v: string) {
    this.company = v;
    return this;
  }

  withRating(v?: number | null) {
    this.rating = v ?? null;
    return this;
  }

  withComment(v: string) {
    this.comment = v;
    return this;
  }

  withSource(v: "platform" | "magic" | string | null) {
    this.source = v;
    return this;
  }

  withHireAgain(v: RecommendationInput["hireAgain"]) {
    this.hireAgain = v;
    return this;
  }

  /** Replace all pictures */
  withPictures(photos: RecommendationPhotoInput[]) {
    this.photos = photos;
    return this;
  }

  /** Append picture(s) */
  addPictures(...photos: RecommendationPhotoInput[]) {
    this.photos = [...(this.photos ?? []), ...photos];
    return this;
  }

  /** Convenience for a single picture */
  withPicture(photo: RecommendationPhotoInput) {
    return this.addPictures(photo);
  }

  /* ---------------- API adapters ---------------- */

  /** JSON body for RecommendationsApi.create (no photos) */
  toJSON(): RecommendationInput {
    return {
      name: this.name,
      email: this.email ?? undefined,
      phone: this.phone ?? undefined,
      company: this.company,
      rating: this.rating ?? undefined,
      comment: this.comment,
      source: this.source ?? undefined,
      // hireAgain is ignored for platform JSON (server doesn’t use it there)
    };
  }

  /** What your `RecommendationsApi` expects (works for JSON or multipart-first-photo). */
  toInput(): RecommendationInput {
    return {
      name: this.name,
      email: this.email ?? undefined,
      phone: this.phone ?? undefined,
      company: this.company,
      rating: this.rating ?? undefined,
      comment: this.comment,
      source: this.source ?? undefined,
      hireAgain: this.hireAgain ?? undefined,
      photos: this.photos && this.photos.length ? this.photos : undefined,
    };
  }
}
