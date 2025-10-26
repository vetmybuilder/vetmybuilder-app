// e2e-tests/src/pages/BasePage.ts
import { Page, Locator, expect } from "@playwright/test";

// const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
// const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
// const TEST_SECRET = process.env.E2E_TEST_SECRET || "";
// const TEST_UID = process.env.E2E_TEST_UID || "BpSvMxVVpnQeG211hiY8cNPbDCW2";

export class BasePage {
  readonly page: Page;
  readonly notificationMessage: Locator;
  readonly PAGE_URL: string = "";

  // Header avatar initials bubble (Layout.tsx -> data-testid="account-initials")
  readonly accountInitials: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.accountInitials = page.getByTestId("account-initials");
    this.notificationMessage = page
      .getByTestId("project-details")
      .getByRole("alert");
    this.signInLink = page.getByRole("link", { name: "Sign in" });
  }

  async waitIdle() {
    await this.page.waitForLoadState("networkidle");
  }

  async expectInitials(text: string) {
    await expect(this.accountInitials).toHaveText(text);
  }

  /** Read the current header initials text (trimmed). */
  async getHeaderInitials(): Promise<string> {
    const t = await this.accountInitials.textContent();
    return (t || "").trim();
  }

  async hasHeaderInitials(expected: string): Promise<void> {
    await expect
      .poll(async () => this.getHeaderInitials(), {
        message: `Header initials should be "${expected}"`,
      })
      .toBe(expected);
  }

  async visit({
    url = this.PAGE_URL,
    qs,
  }: { url?: string; qs?: string } = {}): Promise<void> {
    if (qs) url += qs;
    await this.page.goto(url);
  }

  async reload(): Promise<void> {
    await this.page.reload();
  }

  async logoutAndWait(): Promise<void> {
    // Hit logout page
    await this.page.goto("/logout");

    // Locally clear Firebase + storage ONCE right now,
    // and immediately set the cookie so the init-script won’t clear again later.
    await this.page.evaluate(() => {
      try {
        indexedDB.deleteDatabase("firebaseLocalStorageDb");
      } catch {}
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
      document.cookie = "__e2e_cleared=1; path=/; max-age=31536000";
    });

    // Server says we’re logged out
    await expect
      .poll(async () => (await this.page.request.get("/api/me")).status())
      .toBe(401);

    // No firebase user on the page (best effort)
    await this.page.waitForFunction(() => {
      const w: any = window;
      const fbUser =
        w?.firebaseAuth?.currentUser ||
        w?.auth?.currentUser ||
        w?.__auth_user ||
        null;
      return !fbUser;
    });

    // Header shows signed-out state (adjust selector to your app)
    await this.page.waitForSelector(
      '[data-testid="nav-sign-in"], [aria-label="Sign in"]',
      { state: "visible" }
    );
  }

  async ensureServerSession(): Promise<void> {
    const PATH = process.env.E2E_SESSION_CHECK_PATH || "/api/__test__/auth/me";
    try {
      const res = await this.page.request.get(PATH);
      // If your check endpoint doesn't exist in some envs, just skip quietly
      if (!res.ok() && res.status() !== 404) {
        throw new Error(
          `ensureServerSession(${PATH}) failed: ${res.status()} ${await res.text()}`
        );
      }
    } catch {}
  }
}
