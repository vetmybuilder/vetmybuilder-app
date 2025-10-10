// src/models/User.ts
// Simple, fluent test user model (no external deps)

export type UserJSON = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  /** Required for RegisterPage */
  postcode: string;
  /** Kept for interop with any legacy consumer that still reads `location` */
  location?: string | null;
};

export type UserCreatePayload = {
  uid?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  /** Test route expects `location`; we map from postcode */
  location?: string | null;
  /** Included for future flexibility */
  postcode?: string | null;
  /** Optional for Firebase creation in tests */
  password?: string | null;
};

function rand(n = 6) {
  return Math.random()
    .toString(36)
    .slice(2, 2 + n);
}

function makeUsername(first: string, last: string) {
  const a = (first || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const b = (last || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const core = [a, b].filter(Boolean).join(".") || `user.${rand(4)}`;
  return `${core}.${rand(4)}`
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
}

export default class User {
  private _firstName: string;
  private _lastName: string;
  private _username: string;
  private _email: string;
  private _password: string;

  /** Canonical registration field */
  private _postcode: string | null = null;

  private _uid?: string;

  private constructor() {
    this._firstName = "Test";
    this._lastName = "User";
    this._username = makeUsername(this._firstName, this._lastName);
    this._email = `e2e+${Date.now()}-${rand(4)}@example.test`;
    this._password = "Passw0rd!";
  }

  static aUser() {
    return new User();
  }

  static withUniqueEmail(domain = "example.test") {
    return new User().withEmail(`e2e+${Date.now()}-${rand(4)}@${domain}`);
  }

  get firstName() {
    return this._firstName;
  }
  get lastName() {
    return this._lastName;
  }
  get username() {
    return this._username;
  }
  get email() {
    return this._email;
  }
  get password() {
    return this._password;
  }
  get postcode() {
    return this._postcode;
  }
  get uid() {
    return this._uid;
  }
  get initials() {
    const a = (this._firstName || "").trim()[0] || "";
    const b = (this._lastName || "").trim()[0] || "";
    return (a + b).toUpperCase();
  }

  withFirstName(v: string) {
    this._firstName = v;
    this._username = makeUsername(this._firstName, this._lastName);
    return this;
  }
  withLastName(v: string) {
    this._lastName = v;
    this._username = makeUsername(this._firstName, this._lastName);
    return this;
  }
  withUsername(v: string) {
    this._username = v;
    return this;
  }
  withEmail(v: string) {
    this._email = v;
    return this;
  }
  withPassword(v: string) {
    this._password = v;
    return this;
  }
  /** Set postcode (E4, E4 7AA, etc.). This is the canonical field. */
  withPostcode(v: string | number | null) {
    this._postcode = v == null ? null : String(v);
    return this;
  }
  withUid(v: string) {
    this._uid = v;
    return this;
  }

  /** Payload your RegisterPage.signUp expects */
  toJSON(): UserJSON {
    const loc = this._postcode ?? "";
    return {
      firstName: this._firstName,
      lastName: this._lastName,
      username: this._username,
      email: this._email,
      password: this._password,
      postcode: loc, // <-- always a string
      location: loc, // legacy compatibility
    };
  }

  /** If you fill forms by label */
  toForm(): Record<string, string> {
    const loc = this._postcode ?? "";
    return {
      "First name": this._firstName,
      "Last name": this._lastName,
      Username: this._username,
      Email: this._email,
      Password: this._password,
      Postcode: loc,
    };
  }

  /** Payload for /api/__test__/users */
  toCreatePayload(): UserCreatePayload {
    const loc = this._postcode ?? null;
    return {
      uid: this._uid,
      email: this._email,
      password: this._password,
      firstName: this._firstName,
      lastName: this._lastName,
      username: this._username,
      location: loc, // server test route still expects `location`
      postcode: loc,
    };
  }
}

/** quick helper for two users in the same postcode/area */
export function twoUsersIn(postcode: string) {
  const now = Date.now();
  const u1 = User.aUser()
    .withEmail(`e2e+${now}-${rand(4)}@example.test`)
    .withPostcode(postcode);
  const u2 = User.aUser()
    .withEmail(`e2e+${now}-${rand(4)}@example.test`)
    .withPostcode(postcode);
  return [u1, u2] as const;
}
