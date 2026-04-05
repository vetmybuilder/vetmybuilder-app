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
  return randomUUID().replace(/-/g, "").slice(0, 12).toLowerCase();
}

export default class Account {
  firstName: string = "";
  lastName: string = "";
  username: string = "";
  location: string = "";

  email?: string;
  password?: string;

  static readonly STRONG_PASSWORD = "Str0ng!Pass#99";

  static readonly WEAK_PASSWORDS: { value: string; label: string }[] = [
    { value: "Short1!",          label: "too short (< 8 chars)" },
    { value: "alllowercase1!",   label: "no uppercase letter" },
    { value: "ALLUPPERCASE1!",   label: "no lowercase letter" },
    { value: "NoNumbers!ABC",    label: "no number" },
    { value: "NoSpecialChars1A", label: "no special character" },
  ];

  static anAccount(): Account {
    return new Account();
  }

  static aGuestAccount(): Account {
    return new Account()
      .withRandomDetails()
      .withEmail(`guest+${uniqueSuffix()}@example.test`);
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

  withStrongPassword(): Account {
    this.password = Account.STRONG_PASSWORD;
    return this;
  }

  withRandomDetails(): Account {
    const u = uniqueSuffix();

    this.firstName = chance.first();
    this.lastName = chance.last();
    this.username = `e2e_${u}`;
    this.location = `${chance.postcode()}`;

    return this;
  }

  withRandomRegistration(opts?: {
    domain?: string;
    password?: string;
    location?: string;
    username?: string;
    email?: string;
  }): Account {
    const domain = opts?.domain ?? "example.test";

    this.withRandomDetails();

    if (opts?.username) this.username = opts.username;
    if (opts?.location) this.location = opts.location;

    const u = uniqueSuffix();
    this.email = opts?.email ?? `e2e+${u}@${domain}`;
    this.password = opts?.password ?? "Passw0rd!";

    return this;
  }

  get requiredEmail(): string {
    if (!this.email) throw new Error("Account.email is required");
    return this.email;
  }

  get requiredPassword(): string {
    if (!this.password) throw new Error("Account.password is required");
    return this.password;
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
    return {
      firstName: this.firstName || "",
      lastName: this.lastName || "",
      username: this.username || "",
      location: this.location || "",
      email: this.requiredEmail,
      password: this.requiredPassword,
    };
  }
}
