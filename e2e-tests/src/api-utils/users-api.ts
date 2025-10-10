// e2e-tests/src/api-utils/users-api.ts
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";
import { ApiBase } from "./api-base";
import User, { UserBuilder, type UserCreatePayload } from "../models/User";

type CreateUserResponse = {
  ok: boolean;
  uid?: string;
};

// Accept any of these as input to createUser/createUsers
type CreateInput = User | UserBuilder | UserCreatePayload;

function isUserBuilder(x: any): x is UserBuilder {
  return x && typeof x === "object" && typeof x.toCreatePayload === "function";
}

function isPlainPayload(x: any): x is UserCreatePayload {
  return (
    x && typeof x === "object" && !("toJSON" in x) && !("toCreatePayload" in x)
  );
}

/** Normalize any accepted input into the payload the test route expects */
function toPayload(input: CreateInput): UserCreatePayload {
  if (input instanceof User) {
    // Your existing model; send its JSON (no location unless caller set it elsewhere)
    return input.toJSON() as UserCreatePayload;
  }
  if (isUserBuilder(input)) {
    // Our fluent builder
    return input.toCreatePayload();
  }
  if (isPlainPayload(input)) {
    return input;
  }
  // Fallback – should never happen, but keeps types happy
  return input as any as UserCreatePayload;
}

export class UsersApi extends ApiBase {
  constructor(request: APIRequestContext) {
    super(request);
  }

  /** Create one or many users. Works with User, UserBuilder, or plain payloads. */
  async createUser(input: CreateInput): Promise<CreateUserResponse>;
  async createUser(input: CreateInput[]): Promise<CreateUserResponse[]>;
  async createUser(
    input: CreateInput | CreateInput[]
  ): Promise<CreateUserResponse | CreateUserResponse[]> {
    if (Array.isArray(input)) {
      return this.createUsers(input);
    }
    const payload = toPayload(input);
    const res = await this.postJSON("/api/__test__/users", payload);
    expect(res.ok()).toBeTruthy();
    return (await res.json()) as CreateUserResponse;
  }

  /** Explicit bulk helper (sequential to keep logs deterministic). */
  async createUsers(inputs: CreateInput[]): Promise<CreateUserResponse[]> {
    const out: CreateUserResponse[] = [];
    for (const item of inputs) {
      const payload = toPayload(item);
      const res: APIResponse = await this.postJSON(
        "/api/__test__/users",
        payload
      );
      expect(
        res.ok(),
        `Create user failed: ${await safeText(res)}`
      ).toBeTruthy();
      out.push((await res.json()) as CreateUserResponse);
    }
    return out;
  }

  /** Convenience: clear DB via the test route */
  async clearDb(): Promise<void> {
    const res = await this.postJSON("/api/__test__/db/clear");
    expect(res.ok()).toBeTruthy();
  }
}

/* Small helper to avoid throwing when reading body text for error messages */
async function safeText(res: APIResponse): Promise<string> {
  try {
    return await res.text();
  } catch {
    return `${res.status()} ${res.statusText()}`;
  }
}
