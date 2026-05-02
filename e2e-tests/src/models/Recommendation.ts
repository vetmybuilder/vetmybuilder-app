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
  qualityRating?: number;
  reliabilityRating?: number;
  communicationRating?: number;
  trustRating?: number;
  valueRating?: number;
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
  qualityRating?: number;
  reliabilityRating?: number;
  communicationRating?: number;
  trustRating?: number;
  valueRating?: number;

  private photos: MultipartPhoto[] = [];

  constructor() {
    const fixturesDir = path.resolve(__dirname, "../../tests/fixtures/files");

    this.name = "Chris Morris";
    this.company = "Elegant Building Services Limited";
    this.comment =
      "Elegant Building Services were reliable, tidy, and did a very good job. I would happily recommend them.";
    this.rating = 5;
    this.phone = "07900111222";
    this.qualityRating = 5;
    this.reliabilityRating = 5;
    this.communicationRating = 5;
    this.trustRating = 5;
    this.valueRating = 5;

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
    this.qualityRating = 5;
    this.reliabilityRating = 5;
    this.communicationRating = 5;
    this.trustRating = 5;
    this.valueRating = 5;
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
    if (this.qualityRating !== undefined) out.qualityRating = this.qualityRating;
    if (this.reliabilityRating !== undefined)
      out.reliabilityRating = this.reliabilityRating;
    if (this.communicationRating !== undefined)
      out.communicationRating = this.communicationRating;
    if (this.trustRating !== undefined) out.trustRating = this.trustRating;
    if (this.valueRating !== undefined) out.valueRating = this.valueRating;

    return out;
  }

  toMultipartPayload(): { fields: RecommendationInput; photos?: string[] } {
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

  withQualityRating(n: number): Recommendation {
    this.qualityRating = n;
    return this;
  }

  withReliabilityRating(n: number): Recommendation {
    this.reliabilityRating = n;
    return this;
  }

  withCommunicationRating(n: number): Recommendation {
    this.communicationRating = n;
    return this;
  }

  withTrustRating(n: number): Recommendation {
    this.trustRating = n;
    return this;
  }

  withValueRating(n: number): Recommendation {
    this.valueRating = n;
    return this;
  }

  withAllRatings(n: number): Recommendation {
    this.qualityRating = n;
    this.reliabilityRating = n;
    this.communicationRating = n;
    this.trustRating = n;
    this.valueRating = n;
    return this;
  }

  withNoRatings(): Recommendation {
    this.qualityRating = undefined;
    this.reliabilityRating = undefined;
    this.communicationRating = undefined;
    this.trustRating = undefined;
    this.valueRating = undefined;
    return this;
  }
}
