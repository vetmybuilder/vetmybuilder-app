import Chance from "chance";
import path from "path";

const chance = new Chance();

export type RecommendationInput = {
  name: string;
  company: string;
  comment: string;
  rating?: number;
  email?: string;
  phone?: string;
  companyEmail?: string;
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
  companyEmail?: string;
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

  withRandomDetails(): Recommendation {
    this.name = chance.name();
    this.company = `${chance.company()} Ltd`;
    this.comment = chance.sentence({ words: 12 });
    this.rating = 5;
    this.phone = "07900111222";
    return this;
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
    if (this.companyEmail !== undefined) out.companyEmail = this.companyEmail;
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

  withSource(source: "platform" | "magic"): Recommendation {
    this.source = source;
    return this;
  }

  withCompany(company: string): Recommendation {
    this.company = company;
    return this;
  }

  withEmail(email: string): Recommendation {
    this.email = email;
    return this;
  }

  withPhone(phone: string): Recommendation {
    this.phone = phone;
    return this;
  }

  withCompanyEmail(companyEmail: string): Recommendation {
    this.companyEmail = companyEmail;
    return this;
  }

  withPhotos(count: number): Recommendation {
    const fixturesDir = path.resolve(__dirname, "../../tests/fixtures/files");
    this.photos = [];
    for (let i = 0; i < count; i++) {
      const n = i + 1;
      this.photos.push({
        name: `photo${n}.jpg`,
        mimeType: "image/jpeg",
        filePath: path.join(fixturesDir, `rec-image-${n}.jpg`),
      });
    }
    return this;
  }

  asMagicRecommendation(): Recommendation {
    this.source = "magic";
    return this;
  }
}
