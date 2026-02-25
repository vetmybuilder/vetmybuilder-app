import { expect } from "@playwright/test";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
  get: (path: string) => Promise<ApiResponse>;
};

export type AccountPayload = {
  firstName?: string;
  lastName?: string;
  username?: string;
  location?: string;
};

export class AccountApi {
  constructor(private readonly apiClient: ApiClient) {}

  async signUp(
    payload: Required<Pick<AccountPayload, "firstName" | "lastName">> &
      Pick<AccountPayload, "username" | "location">,
  ) {
    const res = await this.apiClient.post("/api/auth/signup", payload);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true });

    return body as { ok: true };
  }

  async createAccount(payload: AccountPayload) {
    const res = await this.apiClient.post("/api/account", payload);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    return body as { ok: true };
  }

  async getMe() {
    const res = await this.apiClient.get("/api/me");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toBeTruthy();

    return body;
  }
}

export default AccountApi;
