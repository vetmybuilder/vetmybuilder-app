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
