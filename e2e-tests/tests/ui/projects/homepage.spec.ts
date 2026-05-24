import { test } from "../../../src/ui.fixtures";

test.describe("Homepage", () => {
  test.describe("Logged-in homeowner", () => {
    test("hero CTA navigates to /projects/new", async ({ homePage }) => {
      await homePage.goto();
      await homePage.expectHeroCtaLabel(/post a new job/i);
      await homePage.clickHeroCta();
      await homePage.expectUrl(/\/projects\/new$/);
    });

    test("My projects link navigates to /projects", async ({ homePage }) => {
      await homePage.goto();
      await homePage.clickMyProjectsLink();
      await homePage.expectUrl(/\/projects$/);
    });

    test("shows the homeowner eyebrow above the headline", async ({
      homePage,
    }) => {
      await homePage.goto();
      await homePage.expectLocalTradespeopleEyebrow();
    });
  });

  test.describe("Logged-in tradesperson", () => {
    test("hero CTA navigates to /tradesman/jobs", async ({ homePage }) => {
      await homePage.asTradesperson();
      await homePage.goto();
      await homePage.expectHeroCtaLabel(/view available jobs/i);
      await homePage.clickHeroCta();
      await homePage.expectUrl(/\/tradesman\/jobs$/);
    });

    test("See how it works scrolls to the how-it-works section", async ({
      homePage,
    }) => {
      await homePage.asTradesperson();
      await homePage.goto();
      await homePage.expectNoMyProjectsLink();
      await homePage.clickSeeHowItWorks();
      await homePage.expectScrolledToHowItWorks();
    });

    test("hides the homeowner eyebrow above the headline", async ({
      homePage,
    }) => {
      await homePage.asTradesperson();
      await homePage.goto();
      await homePage.expectNoLocalTradespeopleEyebrow();
    });
  });

  test.describe("Guest", () => {
    test("header CTA opens the post-job wizard", async ({ basePage, homePage }) => {
      await basePage.logoutViaUrl();
      await homePage.goto();
      await homePage.expectHeaderPostAJobLabel(/post a job/i);
      await homePage.clickHeaderPostAJob();
      await homePage.expectUrl(/\/projects\/new$/);
    });

    test("See how it works scrolls to the how-it-works section", async ({
      basePage,
      homePage,
    }) => {
      await basePage.logoutViaUrl();
      await homePage.goto();
      await homePage.expectNoMyProjectsLink();
      await homePage.clickSeeHowItWorks();
      await homePage.expectScrolledToHowItWorks();
    });
  });
});
