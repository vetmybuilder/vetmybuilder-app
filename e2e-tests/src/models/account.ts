import Chance from "chance";

const chance = new Chance();

export type AccountInput = {
  firstName?: string;
  lastName?: string;
  username?: string;
  location?: string;
};

export default class Account {
  firstName?: string;
  lastName?: string;
  username?: string;
  location?: string;

  static anAccount(): Account {
    return new Account();
  }

  withFirstName(firstName: string): Account {
    this.firstName = firstName;
    return this;
  }

  withLastName(lastName: string): Account {
    this.lastName = lastName;
    return this;
  }

  withUsername(username: string): Account {
    this.username = username;
    return this;
  }

  withLocation(location: string): Account {
    this.location = location;
    return this;
  }

  withRandomDetails(): Account {
    this.firstName = chance.first();
    this.lastName = chance.last();
    this.username = chance.string({ length: 10, alpha: true, casing: "lower" });
    this.location = `${chance.postcode()} ${chance.city()}`;
    return this;
  }

  toPayload(): AccountInput {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      username: this.username,
      location: this.location,
    };
  }
}
