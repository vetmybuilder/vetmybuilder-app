// e2e-tests/src/pages/ProjectViewPage.ts
import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import Project from "../models/Project";

type TopRecommendationExpectation = {
  company: string;
  likes?: number;
  comment?: string;
  recommenderName?: string;
  hasGallery?: boolean;
  labels?: Array<"friend" | "community">;
  expectCHBadge?: boolean;
  expectVmbScore?: boolean;
};

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\s*\+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class ProjectViewPage extends BasePage {
  readonly title: Locator;
  readonly createdAt: Locator;
  readonly backToProjectsButton: Locator;

  // Shortlist section
  readonly shortlistRoot: Locator;
  readonly shortlistList: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByTestId("project-title");
    this.createdAt = page.getByTestId("project-created");
    this.backToProjectsButton = page.getByLabel("Back to my projects");

    this.shortlistRoot = page.getByTestId("project-shortlist");
    this.shortlistList = page.getByTestId("shortlist-list");
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
    await expect(this.createdAt).toBeVisible();
  }

  /**
   * Assert the “Top recommendations” card using ONLY the data-testids
   * defined in the provided ShortlistSection component.
   */
  async hasTopRecommendations(exp: TopRecommendationExpectation) {
    // Section present + list visible
    await expect(this.shortlistRoot).toBeVisible();
    await expect(
      this.shortlistRoot.getByRole("heading", { name: "Top recommendations" })
    ).toBeVisible();
    await expect(
      this.shortlistRoot.getByText(
        "Top recommendations, grouped by company (VMB score)."
      )
    ).toBeVisible();
    await expect(this.shortlistList).toBeVisible();

    // Find the card/group for the company
    const byCompany = this.shortlistList
      .getByTestId("shortlist-group")
      .filter({
        has: this.page
          .getByTestId("shortlist-company-name")
          .filter({ hasText: new RegExp(exp.company, "i") }),
      })
      .first();

    const card =
      (await byCompany.count()) > 0
        ? byCompany
        : this.shortlistList.getByTestId("shortlist-group").first();

    await expect(card).toBeVisible();

    // Companies House badge — wait until VERIFIED before asserting company (it becomes UPPER_CASED)
    const chBadge = card.getByTestId("shortlist-badge-ch");
    if (exp.expectCHBadge !== false) {
      await expect(chBadge).toBeVisible();
      await expect(chBadge).toHaveAttribute("data-status", "verified", {
        timeout: 20000,
      });
    }

    // Company name (after CH verified it renders uppercased)
    const companyEl = card.getByTestId("shortlist-company-name");
    await expect(companyEl).toBeVisible();
    if (exp.expectCHBadge !== false) {
      await expect(companyEl).toHaveText(exp.company.toUpperCase());
    } else {
      await expect(companyEl).toHaveText(exp.company);
    }

    // Comment
    if (exp.comment) {
      await expect(card.getByTestId("shortlist-comment")).toHaveText(
        exp.comment
      );
    }

    // VMB score chip (shows "VMB X.X")
    if (exp.expectVmbScore !== false) {
      const score = card.getByTestId("shortlist-vmb-score");
      await expect(score).toBeVisible();
      await expect(score).toHaveText(/VMB\s+\d+(\.\d+)?/);
    }

    // Vote button (non-owner) + count
    await expect(card.getByTestId("shortlist-vote-button")).toBeVisible();
    if (typeof exp.likes === "number") {
      await expect(card.getByTestId("shortlist-vote-count")).toHaveText(
        String(exp.likes)
      );
    }

    // Badges
    if (exp.labels?.includes("friend")) {
      await expect(card.getByTestId("shortlist-badge-friend")).toBeVisible();
    }
    if (exp.labels?.includes("community")) {
      await expect(card.getByTestId("shortlist-badge-community")).toBeVisible();
    }
    if (exp.hasGallery) {
      await expect(card.getByTestId("shortlist-badge-photos")).toBeVisible();
    }

    // Recommender line — normalize “A + B” vs “A B”
    if (exp.recommenderName) {
      const recText = await card
        .getByTestId("shortlist-recommender")
        .innerText();
      expect(norm(recText)).toContain(norm(exp.recommenderName));
    }

    // Date presence (format owned by UI)
    await expect(card.getByTestId("shortlist-date")).toBeVisible();
  }
}
