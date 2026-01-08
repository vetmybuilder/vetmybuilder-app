import Chance from "chance";

const chance = new Chance();

export type ProjectInput = {
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
};

export default class Project {
  name!: string;
  type!: string;
  location!: string;
  description!: string;
  propertyType!: string;
  bedrooms!: number;

  static aProject(): Project {
    return new Project();
  }

  withRandomDetails(): Project {
    this.name = chance.sentence({ words: 3 }).replace(/\.$/, "");
    this.type = "Bathroom";
    this.location = "E4 6JH";
    this.description = chance.paragraph();
    this.propertyType = "House";
    this.bedrooms = chance.integer({ min: 0, max: 6 });
    return this;
  }

  withName(name: string): Project {
    this.name = name;
    return this;
  }

  withType(type: string): Project {
    this.type = type;
    return this;
  }

  withLocation(location: string): Project {
    this.location = location;
    return this;
  }

  withDescription(description: string): Project {
    this.description = description;
    return this;
  }

  withPropertyType(propertyType: string): Project {
    this.propertyType = propertyType;
    return this;
  }

  withBedrooms(bedrooms: number): Project {
    this.bedrooms = bedrooms;
    return this;
  }

  toPayload(): ProjectInput {
    return {
      name: this.name,
      type: this.type,
      location: this.location,
      description: this.description,
      propertyType: this.propertyType,
      bedrooms: this.bedrooms,
    };
  }
}
