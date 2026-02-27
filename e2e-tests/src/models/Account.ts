import Chance from "chance";
import { randomUUID } from "crypto";

const chance = new Chance();

export type AccountInput = {
  firstName?: string;
  lastName?: string;
  username?: string;
  location?: string;
};

export type RegisterInput = {
  firstName: string;
  lastName: string;
  username: string;
  location: string;
  email: string;
  password: string;
};

function uniqueSuffix(): string {
  // Stable uniqueness across parallel workers + repeated runs
  // Example: "a1b2c3d4e5f6"
  return randomUUID().replace(/-/g, "").slice(0, 12).toLowerCase();
}

export default class Account {
  firstName: string = "";
  lastName: string = "";
  username: string = "";
  location: string = "";

  email?: string;
  password?: string;

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

  withEmail(email: string): Account {
    this.email = email;
    return this;
  }

  withPassword(password: string): Account {
    this.password = password;
    return this;
  }

  withRandomDetails(): Account {
    const u = uniqueSuffix();

    this.firstName = chance.first();
    this.lastName = chance.last();

    // Make username deterministic-unique to avoid 409s in parallel runs
    // (keep it simple + lowercase + reasonable length)
    this.username = `e2e_${u}`;

    this.location = `${chance.postcode()}`;
    return this;
  }

  withRandomRegistration(opts?: {
    domain?: string;
    password?: string;
    location?: string;
  }): Account {
    const domain = opts?.domain ?? "example.test";

    this.withRandomDetails();

    const u = uniqueSuffix();
    this.email = `e2e+${u}@${domain}`;

    this.password = opts?.password ?? "Passw0rd!";
    if (opts?.location) this.location = opts.location;

    return this;
  }

  get initials(): string {
    const a = (this.firstName || "").trim()[0] || "";
    const b = (this.lastName || "").trim()[0] || "";
    return (a + b).toUpperCase();
  }

  toApiPayload(): AccountInput {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      username: this.username,
      location: this.location,
    };
  }

  toRegisterInput(): RegisterInput {
    if (!this.email)
      throw new Error("Account.email is required for registration");
    if (!this.password)
      throw new Error("Account.password is required for registration");

    return {
      firstName: this.firstName || "",
      lastName: this.lastName || "",
      username: this.username || "",
      location: this.location || "",
      email: this.email,
      password: this.password,
    };
  }
}
