import path from "path";

export type RecommendationInput = {
  name: string;
  company: string;
  comment: string;
  rating?: number;
  email?: string;
  phone?: string;
  source?: "platform" | "magic";
};

type MultipartPhoto = {
  name: string;
  mimeType: string;
  filePath: string;
};

export default class Recommendation {
  name: string;
  company: string;
  comment: string;
  rating?: number;
  email?: string;
  phone?: string;
  source?: "platform" | "magic";

  private photos: MultipartPhoto[] = [];

  constructor() {
    const fixturesDir = path.resolve(__dirname, "../../tests/fixtures/files");

    this.name = "Chris Morris";
    this.company = "Elegant Building Services Limited";
    this.comment =
      "Elegant Building Services were reliable, tidy, and did a very good job. I would happily recommend them.";
    this.rating = 5;
    this.phone = "07900111222";

    this.photos = [
      {
        name: "photo1.jpg",
        mimeType: "image/jpeg",
        filePath: path.join(fixturesDir, "rec-image-1.jpg"),
      },
      {
        name: "photo2.jpg",
        mimeType: "image/jpeg",
        filePath: path.join(fixturesDir, "rec-image-2.jpg"),
      },
    ];
  }

  static aRecommendation(): Recommendation {
    return new Recommendation();
  }

  toPayload(): RecommendationInput {
    const out: RecommendationInput = {
      name: this.name,
      company: this.company,
      comment: this.comment,
      rating: this.rating,
    };

    if (this.email) out.email = this.email;
    if (this.phone) out.phone = this.phone;
    if (this.source) out.source = this.source;

    return out;
  }

  toMultipartPayload(): { fields: Record<string, any>; photos?: string[] } {
    return {
      fields: this.toPayload(),
      photos: this.photos.length
        ? this.photos.map((p) => p.filePath)
        : undefined,
    };
  }

  asMagicRecommendation(): Recommendation {
    this.source = "magic";
    return this;
  }
}
