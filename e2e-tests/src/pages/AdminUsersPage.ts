import { expect, type Locator, type Page } from "@playwright/test";

export class AdminUsersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly roleFilter: Locator;
  readonly userTable: Locator;
  readonly forbiddenMessage: Locator;

  readonly modal: Locator;
  readonly modalEmail: Locator;
  readonly modalPassword: Locator;
  readonly modalFirstName: Locator;
  readonly modalLastName: Locator;
  readonly modalLocation: Locator;
  readonly modalCompanyName: Locator;
  readonly modalTradeTypes: Locator;
  readonly modalServiceAreas: Locator;
  readonly modalSubmit: Locator;
  readonly modalCancel: Locator;
  readonly modalError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "User Management" });
    this.createButton = page.getByTestId("btn-create-user");
    this.searchInput = page.getByTestId("users-search");
    this.roleFilter = page.getByTestId("users-role-filter");
    this.userTable = page.getByTestId("users-table");
    this.forbiddenMessage = page.getByText("Access restricted");

    this.modal = page.getByTestId("user-modal");
    this.modalEmail = page.getByTestId("user-modal-email");
    this.modalPassword = page.getByTestId("user-modal-password");
    this.modalFirstName = page.getByTestId("user-modal-firstname");
    this.modalLastName = page.getByTestId("user-modal-lastname");
    this.modalLocation = page.getByTestId("user-modal-location");
    this.modalCompanyName = page.getByTestId("user-modal-company");
    this.modalTradeTypes = page.getByTestId("user-modal-trades");
    this.modalServiceAreas = page.getByTestId("user-modal-areas");
    this.modalSubmit = page.getByTestId("user-modal-submit");
    this.modalCancel = page.getByTestId("user-modal-cancel");
    this.modalError = page.getByTestId("user-modal-error");
  }

  async visit() {
    await this.page.goto("/admin/users");
  }

  async waitUntilReady() {
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
  }

  async selectRole(role: "Homeowner" | "Tradesman" | "Admin") {
    await this.page.getByTestId(`role-toggle-${role.toLowerCase()}`).click();
  }

  async createUser(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    location?: string;
    role: "Homeowner" | "Tradesman" | "Admin";
    companyName?: string;
    tradeTypes?: string;
    serviceAreas?: string;
  }) {
    await this.createButton.click();
    await expect(this.modal).toBeVisible();
    await this.selectRole(input.role);
    await this.modalEmail.fill(input.email);
    await this.modalPassword.fill(input.password);
    await this.modalFirstName.fill(input.firstName);
    await this.modalLastName.fill(input.lastName);
    if (input.location) await this.modalLocation.fill(input.location);
    if (input.companyName) await this.modalCompanyName.fill(input.companyName);
    if (input.tradeTypes) await this.modalTradeTypes.fill(input.tradeTypes);
    if (input.serviceAreas) await this.modalServiceAreas.fill(input.serviceAreas);
    await this.modalSubmit.click();
    await expect(this.modal).not.toBeVisible({ timeout: 10_000 });
  }

  async submitAndExpectError(expectedMessage: string) {
    await this.modalSubmit.click();
    await expect(this.modalError).toBeVisible({ timeout: 10_000 });
    await expect(this.modalError).toContainText(expectedMessage);
  }

  async openCreateModal() {
    await this.createButton.click();
    await expect(this.modal).toBeVisible();
  }

  async assertUserInTable(email: string) {
    await expect(this.page.getByText(email)).toBeVisible({ timeout: 10_000 });
  }

  async assertUserNotInTable(email: string) {
    await expect(this.page.getByText(email)).not.toBeVisible({ timeout: 5_000 });
  }

  async deleteUser(email: string) {
    const row = this.page.locator("tr", { has: this.page.getByText(email) });
    await row.getByTestId("btn-delete-user").click();
    await this.page.getByTestId("btn-confirm-delete").click();
  }
}

export default AdminUsersPage;
