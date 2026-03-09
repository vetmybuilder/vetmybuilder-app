import { test, expect } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";
import {
  createAuthUser,
  deleteAuthUserByEmail,
} from "../../../src/helpers/FirebaseSeed";

test.describe("Homeowner registration", () => {
  test("can register a new homeowner and lands on projects with correct initials badge, safety and verification card visible and filters are present", async ({
    homePage,
    registerPage,
    siteHeader,
    homeownerProjectsPage,
  }) => {
    const account = Account.anAccount().withRandomRegistration({
      location: "E4",
    });

    await registerPage.signUp(account);
    await homeownerProjectsPage.waitUntilReady();
    await homeownerProjectsPage.assertSafetyVerificationCardVisible();
    await homeownerProjectsPage.assertFiltersVisible();
    await expect(siteHeader.initialsBadge(account.initials)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("shows validation errors when submitting blank registration form", async ({
    registerPage,
  }) => {
    await registerPage.goto();
    await registerPage.submit();
    await registerPage.hasFieldErrors({
      firstName: "First name is required.",
      lastName: "Last name is required.",
      username: "Username is required.",
      location: "Postcode or city is required.",
      email: "Email is required.",
      password: "Password is required.",
    });
  });

  test("shows an error when email is invalid", async ({ registerPage }) => {
    await registerPage.goto();
    await registerPage.email.fill("not-an-email");
    await registerPage.submit();
    await registerPage.hasFieldErrors({
      email: "Enter a valid email address.",
    });
  });

  test("shows an error when username is already taken", async ({
    homePage,
    registerPage,
    accountApi,
  }) => {
    const takenUsername = `taken_${Date.now()}`;
    const existing = Account.anAccount()
      .withRandomDetails()
      .withUsername(takenUsername);
    await accountApi.createAccount(existing.toApiPayload());

    const account = Account.anAccount().withRandomRegistration({
      location: "E4",
      username: takenUsername,
      email: `homeowner+${Date.now()}@test.com`,
      password: "password",
    });

    
    await registerPage.goto();

    await registerPage.page.context().clearCookies();
    await registerPage.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await registerPage.page.reload();
    await registerPage.goto();

    await registerPage.firstName.fill(account.firstName);
    await registerPage.lastName.fill(account.lastName);
    await registerPage.username.fill(account.username);
    await registerPage.location.fill(account.location);
    await registerPage.email.fill(account.requiredEmail);
    await registerPage.password.fill(account.requiredPassword);
    await registerPage.submitButton.click();
    await expect(registerPage.errorAlert.first()).toContainText(
      "That username is already taken.",
    );
  });

  test("shows an error when email is already taken", async ({
    registerPage,
  }) => {
    const takenEmail = `existing+${Date.now()}@test.com`;
    const password = "password123!";

    await createAuthUser(takenEmail, password);

    const account = Account.anAccount().withRandomRegistration({
      location: "E4",
      email: takenEmail,
      password,
    });

    await registerPage.goto();

    await registerPage.firstName.fill(account.firstName);
    await registerPage.lastName.fill(account.lastName);
    await registerPage.username.fill(account.username);
    await registerPage.location.fill(account.location);
    await registerPage.email.fill(account.email!);
    await registerPage.password.fill(account.password!);
    await registerPage.submitButton.click();
    await registerPage.hasAlert(
      "An account with this email already exists. Try signing in instead.",
    );
  });
});
