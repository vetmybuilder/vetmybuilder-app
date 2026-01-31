import Chance from "chance";

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

export default class Account {
  firstName?: string;
  lastName?: string;
  username?: string;
  location?: string;

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
    this.firstName = chance.first();
    this.lastName = chance.last();
    this.username = chance.string({ length: 10, alpha: true, casing: "lower" });
    this.location = `${chance.postcode()} ${chance.city()}`;
    return this;
  }

  withRandomRegistration(opts?: {
    domain?: string;
    password?: string;
    location?: string;
  }): Account {
    const domain = opts?.domain ?? "example.test";

    this.withRandomDetails();

    this.email = `e2e+${Date.now()}-${chance.string({
      length: 5,
      alpha: true,
      casing: "lower",
    })}@${domain}`;

    this.password = opts?.password ?? "Passw0rd!";
    if (opts?.location) this.location = opts.location;

    return this;
  }

  get initials(): string {
    const a = (this.firstName || "").trim()[0] || "";
    const b = (this.lastName || "").trim()[0] || "";
    return (a + b).toUpperCase();
  }

  toPayload(): AccountInput {
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
