// src/helpers/AuthHelper.ts
import { loginInAsHomeowner } from "../apiHelper/setupHomeownerSession";
import { loginInAsTradesman } from "../apiHelper/tradesman/setupTradesmanSession";
import { uiLoginAsUid } from "../apiHelper/uiAuth";
import type Tradesman from "../models/tradesman";

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

  async loginAsTradesman(tradesman: Tradesman): Promise<string> {
    return await loginInAsTradesman({
      request: this.request,
      page: this.page,
      apiBaseUrl: this.runtime.apiBaseUrl,
      uiBaseUrl: this.runtime.webBaseUrl,
      tradesman,
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

  /**
   * Sign in as a fresh uid that has NO homeowner profile in MySQL.
   * Mirrors the state of a user who just signed in via Google for the first
   * time: authenticated, but missing first/last/username/postcode. Used to
   * exercise the post-OAuth /signup/complete flow.
   */
  async loginAsUidWithoutProfile(uid?: string): Promise<{ uid: string }> {
    const cleanUid = String(
      uid || `oauth-incomplete-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ).trim();

    await uiLoginAsUid({
      request: this.request,
      apiBaseUrl: this.runtime.apiBaseUrl,
      uiBaseUrl: this.runtime.webBaseUrl,
      uid: cleanUid,
      page: this.page,
    });

    return { uid: cleanUid };
  }

  /**
   * Force the page into a clean guest state so a GuestOnly route is reachable.
   * A bare logout after a previous Firebase registration can leave residual
   * auth state that bounces GuestOnly; logging in as a throwaway uid first
   * and then logging out clears it deterministically.
   */
  async ensureGuest() {
    const throwawayUid = `guest-cleanup-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;
    await this.loginAsUid(throwawayUid);
    await this.logout();
  }
}
