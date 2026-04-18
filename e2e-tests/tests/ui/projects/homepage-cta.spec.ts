import { test } from "../../../src/ui.fixtures";

test.describe("Homepage CTAs", () => {
  test("logged-in homeowner sees 'Post a job' and 'My Projects' buttons", async ({
    homePage,
  }) => {
    await homePage.goto();
    await homePage.expectHeroCtaVisible(/Post a job/);
    await homePage.expectMyProjectsLinkVisible();
  });

  test("'Post a job' links to /projects/new for logged-in homeowner", async ({
    homePage,
  }) => {
    await homePage.goto();
    await homePage.expectHeroCtaHref("/projects/new");
  });
});
