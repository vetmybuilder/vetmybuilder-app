import { expect } from "@playwright/test";
import Account from "../../models/Account";

type ApiResponse = {
  status(): number;
  json(): Promise<any>;
};

type ApiClient = {
  post: (path: string, payload?: any) => Promise<ApiResponse>;
};

export class AuthApi {
  static async signup(apiClient: ApiClient, account: Account) {
    const res = await apiClient.post("/api/auth/signup", {
      firstName: account.firstName,
      lastName: account.lastName,
      username: account.username,
      location: account.location,
    });

    expect(res.status()).toBe(200);
    return res.json();
  }
}

export default AuthApi;
