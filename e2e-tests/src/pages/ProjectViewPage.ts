// e2e-tests/src/pages/ProjectViewPage.ts
import { Page, Locator } from "@playwright/test";
import { BasePage } from "./BasePage";
import Project from "../models/Project";
import { expect } from "../fixtures/expect-extend";

type ShortlistExpectation = {
  company: string;
  rating?: number;
  likes?: number;
  comment?: string;
  recommenderName?: string;
  anonymous?: boolean;
  email?: string;
  phone?: string;
  hasGallery?: boolean;
  label?: "friend" | "community";
  labels?: Array<"friend" | "community">;
};

export class ProjectViewPage extends BasePage {
  readonly title: Locator;
  readonly createdAt: Locator;

  readonly projectDetailsCard: Locator;
  readonly badgeType: Locator;
  readonly badgeLocation: Locator;
  readonly badgeProperty: Locator;
  readonly badgeBedrooms: Locator;
  readonly badgeStatus: Locator;

  readonly fieldType: Locator;
  readonly fieldLocation: Locator;
  readonly fieldProperty: Locator;
  readonly fieldBedrooms: Locator;
  readonly fieldStatus: Locator;
  readonly fieldDescription: Locator;
  readonly backToMyProjectsButton: Locator;
  readonly archiveBtn: Locator;
  readonly unarchiveBtn: Locator;
  readonly copyInviteLinkBtn: Locator;
  readonly publishBtn: Locator;
  readonly addRecommendationBtn: Locator;
  readonly viewMoreBtn: Locator;
  readonly shortlistSection: Locator;

  constructor(page: Page) {
    super(page);

    this.title = page.getByTestId("project-title");
    this.createdAt = page.getByTestId("project-created");

    this.projectDetailsCard = page.getByTestId("project-details");
    this.badgeType = page.getByTestId("badge-type");
    this.badgeLocation = page.getByTestId("badge-location");
    this.badgeProperty = page.getByTestId("badge-property");
    this.badgeBedrooms = page.getByTestId("badge-bedrooms");
    this.badgeStatus = page.getByTestId("badge-status");

    this.fieldType = page.getByTestId("field-type");
    this.fieldLocation = page.getByTestId("field-location");
    this.fieldProperty = page.getByTestId("field-property");
    this.fieldBedrooms = page.getByTestId("field-bedrooms");
    this.fieldStatus = page.getByTestId("field-status");
    this.fieldDescription = page.getByTestId("field-description");

    this.backToMyProjectsButton = page.getByLabel("Back to my projects");
    this.archiveBtn = page.getByTestId("project-details").getByLabel("Archive");
    this.unarchiveBtn = page
      .getByTestId("project-details")
      .getByLabel("Unarchive");
    this.badgeStatus = page.getByTestId("badge-status").getByRole("status");
    this.copyInviteLinkBtn = page
      .getByTestId("project-details")
      .getByLabel("Copy invite link");
    this.publishBtn = page.getByTestId("project-details").getByLabel("Publish");
    this.addRecommendationBtn = page.getByLabel("Add recommendation");
    this.viewMoreBtn = page.getByLabel("View more recommendations");
    this.shortlistSection = page.getByTestId("shortlist-item");
  }

  async goto(id: number | string) {
    await this.page.goto(`/projects/${id}`);
  }

  async expectLoaded() {
    await expect(this.title).toBeVisible();
  }

  async hasProjectData(project: Project) {
    const p = project.toJSON();

    await expect(this.title).toHaveText(p.name);

    await expect(this.badgeType).toHaveText(p.type);
    await expect(this.badgeLocation).toHaveText(p.location);
    await expect(this.badgeProperty).toHaveText(p.propertyType);
    await expect(this.badgeBedrooms).toContainText(String(p.bedrooms));

    await expect(this.fieldType).toHaveText(p.type);
    await expect(this.fieldLocation).toHaveText(p.location);
    await expect(this.fieldProperty).toHaveText(p.propertyType);
    await expect(this.fieldBedrooms).toHaveText(p.bedrooms.toString());
    await expect(this.fieldDescription).toHaveText(p.description);

    const expected = (project as any).status ?? "Pending";
    await expect(this.badgeStatus).toContainText(expected);
    await expect(this.fieldStatus).toContainText(expected);

    await expect(this.createdAt).toBeVisible();
  }

  async editProject(project: Project): Promise<void> {
    await this.projectDetailsCard.getByLabel("Edit").click();
    await expect(this.page).toHaveURL(/\/projects\/\d+\/edit$/);
    await expect(this.page.getByTestId("project-edit-form")).toBeVisible();

    await this.page.getByLabel("Name").fill(project.name);
    await this.page.getByLabel("Type", { exact: true }).fill(project.type);
    await this.page.getByLabel("Location").fill(project.location);
    await this.page
      .getByLabel("Property type", { exact: true })
      .selectOption({ label: project.propertyType });
    await this.page.getByLabel("Bedrooms").fill(String(project.bedrooms ?? 0));
    await this.page.getByLabel("Description").fill(project.description ?? "");
    await this.page.getByRole("button", { name: /^save changes$/i }).click();
  }

  async hasShortlist(
    exp: ShortlistExpectation | ShortlistExpectation[],
    opts: { strictCount?: boolean } = { strictCount: true }
  ) {
    const section = this.page.getByTestId("project-shortlist");
    await this.page.waitForLoadState("networkidle");
    await expect(section.getByTestId("shortlist-list")).toBeVisible();

    if (Array.isArray(exp)) {
      const items = section.getByTestId("shortlist-item");
      if (opts.strictCount !== false) {
        await expect(items).toHaveCount(exp.length);
      }
      for (const e of exp) {
        await this.assertShortlistItem(e);
      }
      return;
    }

    await this.assertShortlistItem(exp);
  }

  // ---------- private helpers ----------

  private async assertShortlistItem(exp: ShortlistExpectation) {
    const item = this.shortlistSection.filter({ hasText: exp.company }).first();

    await expect(item).toBeVisible();
    await expect(item.getByTestId("shortlist-company")).toHaveText(exp.company);

    if (typeof exp.rating === "number") {
      await expect(
        item.getByLabel(`Rating: ${exp.rating} out of 5`)
      ).toBeVisible();
    }

    if (typeof exp.likes === "number") {
      await expect(item.getByTestId("shortlist-likes")).toContainText(
        String(exp.likes)
      );
    }

    if (exp.comment) {
      await expect(item.getByTestId("shortlist-comment")).toContainText(
        exp.comment
      );
    }

    // Recommender line (name/email/phone)
    const recLine = item.getByTestId("shortlist-recommender");
    if (exp.anonymous) {
      await expect(recLine).toContainText(/anonymous/i);
    }
    if (exp.recommenderName) {
      await expect(recLine).toContainText(exp.recommenderName);
    }
    if (exp.email) {
      await expect(recLine).toContainText(exp.email);
    }
    if (exp.phone) {
      await expect(recLine).toContainText(exp.phone);
    }

    if (exp.hasGallery) {
      await expect(item.getByTestId("shortlist-badge-photos")).toBeVisible();
    } else {
      // ok if not present at all or hidden
      await expect(
        item.getByTestId("shortlist-badge-photos")
      ).not.toBeVisible();
    }

    // Labels (friend/community)
    const labels = exp.labels ?? (exp.label ? [exp.label] : []);
    for (const lab of labels) {
      await this.assertLabel(item, lab);
    }
  }

  private async assertLabel(item: Locator, lab: "friend" | "community") {
    if (lab === "friend") {
      const byId = item.getByTestId("shortlist-badge-friend");
      if ((await byId.count()) > 0) {
        await expect(byId).toBeVisible();
        return;
      }
      await expect(item).toContainText(/friend/i);
      return;
    }

    // community
    const byId = item.getByTestId("shortlist-badge-community");
    if ((await byId.count()) > 0) {
      await expect(byId).toBeVisible();
      return;
    }
    await expect(item).toContainText(/(community|local resident)/i);
  }

  async copyMagicLinkToClipboard(): Promise<{
    url: string;
    path: string;
    token: string;
  }> {
    await this.page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);

    await this.copyInviteLinkBtn.waitFor({ state: "visible" });
    await this.copyInviteLinkBtn.click();
    await expect(this.page.getByTestId("flash-message")).toHaveText(
      "Invite link copied to clipboard"
    );

    const copied = await this.page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    const absUrl = new URL(copied, this.page.url()).toString();
    const path = new URL(absUrl).pathname + new URL(absUrl).search;

    const m = path.match(/\/r\/([A-Za-z0-9\-_]+)/);
    const token = m?.[1] ?? "";
    if (!token) {
      throw new Error(`Magic link looked invalid: "${absUrl}"`);
    }

    return { url: absUrl, path, token };
  }
}
