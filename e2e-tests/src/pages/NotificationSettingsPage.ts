import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export enum NotificationPreference {
  HireUpdates = "hire_updates",
  Recommendations = "recommendations",
  Matches = "matches",
  Messages = "messages",
  LocalActivity = "local_activity",
  ProjectMatches = "project_matches",
}

type PreferenceKey = NotificationPreference;

export class NotificationSettingsPage extends BasePage {
  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    // Notifications now lives as a drill-in on /account?tab=notifications;
    // the TopBar title carries account-page-title across views.
    this.heading = page.getByTestId("account-page-title");
  }

  async visit() {
    await this.page.goto("/account?tab=notifications");
    await expect(this.heading).toHaveText("Notifications", { timeout: 15_000 });
  }

  private toggle(key: PreferenceKey): Locator {
    return this.page.locator(`#toggle-${key}`);
  }

  async expectToggleOn(key: PreferenceKey) {
    await expect(this.toggle(key)).toHaveAttribute("aria-checked", "true");
  }

  async expectToggleOff(key: PreferenceKey) {
    await expect(this.toggle(key)).toHaveAttribute("aria-checked", "false");
  }

  async togglePreference(key: PreferenceKey) {
    await this.toggle(key).click();
    // Wait for the save to complete (saving state clears)
    await expect(this.toggle(key)).toBeEnabled({ timeout: 5_000 });
  }
}

export default NotificationSettingsPage;
