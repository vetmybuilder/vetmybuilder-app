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
  source?: "platform" | "magic";
};

type MultipartPhoto = {
  name: string;
  mimeType: string;
  filePath: string;
};

export default class Recommendation {
  name!: string;
  company!: string;
  comment!: string;
  rating?: number;
  email?: string;
  phone?: string;
  source?: "platform" | "magic";

  private photos: MultipartPhoto[] = [];

  static aRecommendation(): Recommendation {
    return new Recommendation();
  }

  withRandomDetails(): Recommendation {
    this.name = chance.name();
    this.company = chance.company();
    this.comment = chance.sentence();
    this.rating = 5;
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
  withSource(source: "platform" | "magic"): Recommendation {
    this.source = source;
    return this;
  }

  withPhotos(count: number): Recommendation {
    const fixturesDir = path.resolve(__dirname, "../files");

    for (let i = 0; i < count; i++) {
      const n = i + 1;
      this.photos.push({
        name: `photo${n}.jpg`,
        mimeType: "image/jpeg",
        filePath: path.join(fixturesDir, `photo${n}.jpg`),
      });
    }

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
