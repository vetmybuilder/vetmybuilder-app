// src/helpers/AuthHelper.ts
import { loginInAsHomeowner } from "../apiHelper/setupHomeownerSession";

export class AuthHelper {
  constructor(
    private request: any,
    private page: any,
    private runtime: any,
  ) {}

  async loginAsHomeowner(args: {
    firstName: string;
    lastName: string;
    location: string;
  }) {
    await loginInAsHomeowner({
      request: this.request,
      page: this.page,
      apiBaseUrl: this.runtime.apiBaseUrl,
      uiBaseUrl: this.runtime.webBaseUrl,
      ...args,
    });
  }

  async logout() {
    await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
    await this.page
      .waitForURL(/signedOut=1/, { timeout: 15_000 })
      .catch(() => {});
  }

  async loginAsUid(uid: string) {
    const cleanUid = String(uid ?? "").trim();
    if (!cleanUid) throw new Error("Missing uid");

    await loginInAsHomeowner({
      request: this.request,
      page: this.page,
      apiBaseUrl: this.runtime.apiBaseUrl,
      uiBaseUrl: this.runtime.webBaseUrl,
      uid: cleanUid,
      firstName: "Test",
      lastName: "Homeowner",
      location: "SW1A",
    });
  }
}
