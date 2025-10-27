// e2e-tests/tests/projects/my-completed-community-projects.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import {
  createProjectsApiForPage,
  createRecommendationsApiForPage,
} from "../../src/api-utils/api-factory";
import Project from "../../src/models/Project";
import Recommendation, {
  type RecommendationPhotoInput,
} from "../../src/models/Recommendation";

test.describe("My completed COMMUNITY projects", () => {
  test("completed projects in my area appear in the community tab", async ({
    page,
    loginAsNewUser,
    loginAsUid,
    loginAsOwner,
    projectsPage,
    projectViewPage,
  }) => {
    // Viewer is already logged in by the base fixture (postcode E4).

    // --- Owner creates & publishes a project (different user) ---
    const stamp = Date.now().toString(36);
    const owner = await loginAsNewUser({
      postcode: "E4",
      redirect: "/projects",
      username: `owner_${stamp}`,
      firstName: "Owner",
      lastName: `User_${stamp}`,
    });

    const ownerProjectsApi = await createProjectsApiForPage(page);

    const project = Project.aProject()
      .withPostcode("E4")
      .withName("Kitchen Makeover")
      .withType("Painting & decorating");
    await ownerProjectsApi.createProject(project);
    await ownerProjectsApi.publish(project, undefined, {
      waitForStatus: "live",
    });

    // --- Switch back to the viewer (community member) and add a recommendation ---
    await loginAsOwner({ redirect: `/projects/${project.id}` });
    await projectViewPage.expectLoaded();

    const recApi = await createRecommendationsApiForPage(page);

    const mkPic = (
      name: string,
      mimeType: string
    ): RecommendationPhotoInput => ({
      name,
      mimeType,
      buffer: Buffer.from(`fake-bytes-${name}`),
    });

    const rec = Recommendation.aRecommendation()
      .withRecommenderName("Rec User")
      .withTradesman("Pro Builders Ltd")
      .withComment("Clean, on time, and on budget.")
      .withRating(5)
      .withPictures([
        mkPic("after.jpg", "image/jpeg"),
        mkPic("invoice.png", "image/png"),
      ]);

    const recId = await recApi.create(project.id!, rec.toInput());

    // --- Switch to the project OWNER again to close as completed (pick this rec, add photos) ---
    await loginAsUid(owner.uid, { redirect: `/projects/${project.id}` });
    const ownerProjectsApi2 = await createProjectsApiForPage(page);

    await ownerProjectsApi2.closeWithPhotosById(project.id!, {
      didGoAhead: true,
      selectedRecommendationId: recId,
      winnerFromCommunity: true,
      wouldUseAgain: true,
      photos: [
        {
          name: "completed-1.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("photo-1"),
        },
        {
          name: "completed-2.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("photo-2"),
        },
      ],
      waitForStatus: "completed",
    });

    // --- Now the viewer should see it under “My completed community projects” ---
    await loginAsOwner({ redirect: "/projects" });
    await projectsPage.expectLoaded();

    // Open the Community tab (name may be “My completed community projects” in your UI)
    await projectsPage.tabCompletedCommunityProjects.click();

    // Minimal assertion for the row (type/location/tradesman/gallery)
    await projectsPage.hasCompletedProjects([
      {
        type: "Painting & decorating",
        location: "E4",
        tradesman: "Pro Builders Ltd",
        hasGallery: true,
      },
    ]);
  });
});
