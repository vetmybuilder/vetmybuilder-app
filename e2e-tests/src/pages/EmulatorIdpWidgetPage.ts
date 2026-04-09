import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for the Firebase Auth emulator's IDP login widget.
 *
 * When the app calls signInWithPopup against the emulator, a new browser
 * window opens at http://127.0.0.1:9099/emulator/auth/handler with the
 * provider widget. This page object encapsulates the click sequence to
 * create a fresh fake account and submit it — the same UX a developer
 * sees manually when testing OAuth flows against `dev:manual`.
 *
 * The widget is identical across providers (Google, Facebook, Apple),
 * only the provider name changes. Note: the emulator uses a hyphen in
 * the heading ("Sign-in with Google.com") but no hyphen on the submit
 * button ("Sign in with Google.com") — they're rendered separately and
 * differ by one character.
 */
export class EmulatorIdpWidgetPage {
  readonly popup: Page;

  readonly heading: Locator;
  readonly addNewAccountButton: Locator;
  readonly emailInput: Locator;
  readonly displayNameInput: Locator;
  readonly signInButton: Locator;

  /**
   * @param popup the popup Page Playwright handed back from `waitForEvent("page")`
   * @param providerName the human provider label ("Google.com" or "Facebook.com")
   */
  constructor(popup: Page, providerName: string) {
    this.popup = popup;
    this.heading = popup.getByText(`Sign-in with ${providerName}`, {
      exact: true,
    });
    this.addNewAccountButton = popup.getByRole("button", {
      name: "Add new account",
    });
    this.emailInput = popup.getByLabel("Email");
    this.displayNameInput = popup.getByLabel("Display name");
    // Note the missing hyphen — the submit button label is "Sign in with"
    // not "Sign-in with".
    this.signInButton = popup.getByRole("button", {
      name: `Sign in with ${providerName}`,
    });
  }

  async expectVisible(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Sign in by creating a brand-new account in the emulator widget. Returns
   * the email used so the caller can correlate it with the resulting profile.
   */
  async signInAsNewAccount(input: {
    email: string;
    displayName: string;
  }): Promise<{ email: string }> {
    await this.expectVisible();
    await this.addNewAccountButton.click();
    await this.emailInput.fill(input.email);
    await this.displayNameInput.fill(input.displayName);

    // Register the close listener BEFORE the click — the emulator can
    // close the popup so quickly after submit that registering it
    // afterwards misses the event entirely.
    const closePromise = this.popup.waitForEvent("close", { timeout: 10_000 });
    await this.signInButton.click();
    await closePromise;

    return { email: input.email };
  }
}

export default EmulatorIdpWidgetPage;
