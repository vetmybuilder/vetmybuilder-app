// e2e-tests/tests/recommendation.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import {
  createProjectsApiForPage,
  createRecommendationsApiForPage,
} from "../../src/api-utils/api-factory";
import Project from "../../src/models/Project";
import Recommendation, {
  type RecommendationPhotoInput,
} from "../../src/models/Recommendation";

test.describe("Recommendation", () => {
  test("can add a recommendation with a photo via the api (different user)", async ({
    page,
    loginAsNewUser,
    projectsPage,
    projectViewPage,
  }) => {
    // 1) Owner (auto-logged-in by fixture) creates + publishes the project
    const projectsApi = await createProjectsApiForPage(page);
    const project = Project.aProject().withPostcode("E4");
    await projectsApi.createProject(project);
    await projectsApi.publish(project, undefined, { waitForStatus: "live" });

    // 2) Switch to a NEW user (same location) with DISTINCT username + first/last name
    const stamp = Date.now().toString(36);
    const username = `recommender_${stamp}`;
    const firstName = "Rec";
    const lastName = `User_${stamp}`;

    await loginAsNewUser({
      postcode: project.location,
      redirect: "/projects",
      username,
      firstName,
      lastName,
    });
    await projectsPage.expectLoaded();

    // 3) Build recommendation (as the NEW user) and create via API
    const recApi = await createRecommendationsApiForPage(page);

    const mkPic = (
      name: string,
      mimeType: string
    ): RecommendationPhotoInput => ({
      name,
      mimeType,
      buffer: Buffer.from(`fake-bytes-for-${name}`),
    });

    const rec = Recommendation.aRecommendation()
      .withTradesman("Pro Builders Ltd")
      .withComment("Clean, on time, and on budget.")
      .withRating(5)
      .withPictures([
        mkPic("after.jpg", "image/jpeg"),
        mkPic("invoice.png", "image/png"),
        mkPic("kitchen.webp", "image/webp"),
      ]);
    await recApi.create(project.id!, rec.toInput());

    // (Optional) quick UI smoke
    // await projectsPage.filterByName(project.name);
    // await projectsPage.viewProject(project.name);
    // await expect(page.getByText("Pro Builders Ltd")).toBeVisible();
    // await expect(page.getByText("Clean, on time, and on budget.")).toBeVisible();
  });
});
