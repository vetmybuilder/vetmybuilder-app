import { test } from "../../../src/ui.fixtures";
import { NotificationPreference } from "../../../src/pages/NotificationSettingsPage";

const { HireUpdates, Recommendations, BuilderInterest, LocalActivity, ProjectMatches } =
  NotificationPreference;

test.describe("Notification settings page", () => {
  test("shows correct defaults — most on, local activity off", async ({
    notificationSettingsPage,
  }) => {
    await notificationSettingsPage.visit();
    await notificationSettingsPage.expectToggleOn(HireUpdates);
    await notificationSettingsPage.expectToggleOn(Recommendations);
    await notificationSettingsPage.expectToggleOn(BuilderInterest);
    await notificationSettingsPage.expectToggleOff(LocalActivity);
    await notificationSettingsPage.expectToggleOn(ProjectMatches);
  });

  test("toggling a preference off persists after reload", async ({
    notificationSettingsPage,
  }) => {
    await notificationSettingsPage.visit();
    await notificationSettingsPage.expectToggleOn(HireUpdates);

    await notificationSettingsPage.togglePreference(HireUpdates);
    await notificationSettingsPage.expectToggleOff(HireUpdates);

    await notificationSettingsPage.visit();
    await notificationSettingsPage.expectToggleOff(HireUpdates);
  });

  test("toggling a preference on persists after reload", async ({
    notificationSettingsPage,
  }) => {
    await notificationSettingsPage.visit();
    await notificationSettingsPage.expectToggleOff(LocalActivity);

    await notificationSettingsPage.togglePreference(LocalActivity);
    await notificationSettingsPage.expectToggleOn(LocalActivity);

    await notificationSettingsPage.visit();
    await notificationSettingsPage.expectToggleOn(LocalActivity);
  });
});
