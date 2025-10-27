// e2e-tests/tests/projects/my-completed-project.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import {
  createProjectsApiForPage,
  createRecommendationsApiForPage,
} from "../../src/api-utils/api-factory";
import Project from "../../src/models/Project";
import Recommendation, {
  type RecommendationPhotoInput,
} from "../../src/models/Recommendation";

test.describe("My completed project", () => {
  test("competed projects appear in my completed projects tab", async ({
    page,
    loginAsNewUser,
    loginAsOwner,
    projectsPage,
    projectViewPage,
  }) => {
    // 1) Owner (auto-logged-in by fixture) creates + publishes the project
    const projectsApi = await createProjectsApiForPage(page);
    const project = Project.aProject()
      .withPostcode("E4")
      .withName("Living Room Renovation")
      .withType("Painting & decorating");
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
      .withRecommenderName(`${firstName} ${lastName}`)
      .withTradesman("Pro Builders Ltd")
      .withComment("Clean, on time, and on budget.")
      .withPictures([
        mkPic("after.jpg", "image/jpeg"),
        mkPic("invoice.png", "image/png"),
        mkPic("kitchen.webp", "image/webp"),
      ]);

    const recId = await recApi.create(project.id!, rec.toInput());

    // 4) Switch BACK to the project owner (only owner can close)
    await loginAsOwner({ redirect: `/projects/${project.id}` });

    // Recreate an owner-bound ProjectsApi (fresh idToken after re-login)
    const ownerProjectsApi = await createProjectsApiForPage(page);

    // 5) Close the project as "went ahead", select this recommendation as the winner,
    //    and attach completion photos (done in one helper).

    await ownerProjectsApi.closeWithPhotosById(project.id!, {
      didGoAhead: true,
      selectedRecommendationId: recId, // the tradesman who did the work
      winnerFromCommunity: true, // ← this makes it “completed” on your server
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
    project.status = "Completed";
    await projectViewPage.backToProjectsButton.click();
    await projectsPage.hasProjects([project]);
    await projectsPage.viewProject(project.name);
    await projectViewPage.hasProjectData(project);
    await projectViewPage.backToProjectsButton.click();
    // 6) Verify in UI that the project is marked as completed
    await projectsPage.tabMyCompletedProjects.click();
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
