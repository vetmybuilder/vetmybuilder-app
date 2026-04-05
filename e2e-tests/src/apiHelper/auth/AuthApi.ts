import { expect, type APIRequestContext } from "@playwright/test";
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

  /**
   * Ensures a Firebase user exists in the Auth emulator with the given credentials.
   * Routes through the server's test endpoint (guaranteed to target the emulator)
   * rather than calling the Admin SDK directly from the test runner.
   */
  static async ensureEmulatorUser(
    request: APIRequestContext,
    apiBaseUrl: string,
    uid: string,
    email: string,
    password: string,
  ): Promise<void> {
    const res = await request.post(
      `${apiBaseUrl}/api/__test__/auth/custom-token`,
      {
        headers: { "X-Test-Secret": process.env.E2E_TEST_SECRET! },
        data: { uid, email, password },
      },
    );
    expect(res.status()).toBe(200);
  }
}

export default AuthApi;
