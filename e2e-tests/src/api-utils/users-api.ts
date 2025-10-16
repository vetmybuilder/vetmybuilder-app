import type { APIRequestContext, APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";
import { ApiBase } from "./api-base";
import User, { type UserCreatePayload } from "../models/User";

type CreateUserResponse = {
  ok: boolean;
  uid?: string;
};

type BuilderLike = { toCreatePayload: () => UserCreatePayload };
type CreateInput = User | BuilderLike | UserCreatePayload;

function isUserInstance(x: unknown): x is User {
  return (
    !!x && typeof x === "object" && typeof (x as any).toJSON === "function"
  );
}

function isBuilderLike(x: unknown): x is BuilderLike {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as any).toCreatePayload === "function"
  );
}

function isPlainPayload(x: unknown): x is UserCreatePayload {
  return (
    !!x &&
    typeof x === "object" &&
    !("toJSON" in (x as any)) &&
    !("toCreatePayload" in (x as any))
  );
}

function toPayload(input: CreateInput): UserCreatePayload {
  if (isUserInstance(input)) return input.toJSON() as UserCreatePayload;
  if (isBuilderLike(input)) return input.toCreatePayload();
  if (isPlainPayload(input)) return input;
  return input as any as UserCreatePayload;
}

export class UsersApi extends ApiBase {
  constructor(request: APIRequestContext) {
    super(request);
  }

  async createUser(input: CreateInput): Promise<CreateUserResponse>;
  async createUser(input: CreateInput[]): Promise<CreateUserResponse[]>;
  async createUser(
    input: CreateInput | CreateInput[]
  ): Promise<CreateUserResponse | CreateUserResponse[]> {
    if (Array.isArray(input)) {
      return this.createUsers(input);
    }
    const payload = toPayload(input);
    const res = await this.postJSON("__test__/users", payload);
    expect(res.ok()).toBeTruthy();
    return (await res.json()) as CreateUserResponse;
  }

  async createUsers(inputs: CreateInput[]): Promise<CreateUserResponse[]> {
    const out: CreateUserResponse[] = [];
    for (const item of inputs) {
      const payload = toPayload(item);
      const res: APIResponse = await this.postJSON("__test__/users", payload);
      expect(
        res.ok(),
        `Create user failed: ${await safeText(res)}`
      ).toBeTruthy();
      out.push((await res.json()) as CreateUserResponse);
    }
    return out;
  }

  async clearDb(): Promise<void> {
    const res = await this.postJSON("__test__/db/clear");
    expect(res.ok()).toBeTruthy();
  }
}

async function safeText(res: APIResponse): Promise<string> {
  try {
    return await res.text();
  } catch {
    return `${res.status()} ${res.statusText()}`;
  }
}
