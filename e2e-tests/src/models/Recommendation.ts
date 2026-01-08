import Chance from "chance";

const chance = new Chance();

export type RecommendationInput = {
  name: string;
  company: string;
  comment: string;
  rating?: number;
  email?: string;
  phone?: string;
  source?: "platform" | "magic";
  locationHint?: string;
  companyPostcode?: string;
  companyCity?: string;
};

export default class Recommendation {
  name!: string;
  company!: string;
  comment!: string;
  rating?: number;
  email?: string;
  phone?: string;
  source?: "platform" | "magic";
  locationHint?: string;
  companyPostcode?: string;
  companyCity?: string;

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

  withName(name: string): Recommendation {
    this.name = name;
    return this;
  }

  withCompany(company: string): Recommendation {
    this.company = company;
    return this;
  }

  withComment(comment: string): Recommendation {
    this.comment = comment;
    return this;
  }

  withRating(rating: number): Recommendation {
    this.rating = rating;
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

  withLocationHint(hint: string): Recommendation {
    this.locationHint = hint;
    return this;
  }

  withCompanyPostcode(postcode: string): Recommendation {
    this.companyPostcode = postcode;
    return this;
  }

  withCompanyCity(city: string): Recommendation {
    this.companyCity = city;
    return this;
  }

  toPayload(): RecommendationInput {
    return {
      name: this.name,
      company: this.company,
      comment: this.comment,
      rating: this.rating,
      email: this.email,
      phone: this.phone,
      source: this.source,
      locationHint: this.locationHint,
      companyPostcode: this.companyPostcode,
      companyCity: this.companyCity,
    };
  }
}
