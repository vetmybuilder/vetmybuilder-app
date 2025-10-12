// e2e-tests/tests/recommendation/view-project-recommendations.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import { ProjectsApi } from "../../src/api-utils/projects-api";
import Project from "../../src/models/Project";

function photoBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6W6nS0AAAAASUVORK5CYII=",
    "base64"
  );
}

test.describe("View all project recommendations", () => {
  test("should display all recommendations", async ({
    usersApi,
    authApi,
    loginAsUid,
    projectViewPage,
    recommendationsPage,
    recommendationsApiForUser,
  }) => {
    const { api: ownerApi, uid: ownerUid } =
      await ProjectsApi.createForNewOwner({
        usersApi,
        authApi,
        loginInBrowser: false,
      });

    const project = Project.aProject();
    (project as any).location = "E4";
    await ownerApi.createProject(project);
    await ownerApi.publish(project);

    // --- Create a recommender whose location matches the project (=> community) ---
    const { uid: recUid } = await usersApi.createUser({
      email: `e2e+${Date.now()}@example.com`,
      password: "Passw0rd1",
      location: "E4", // <- MUST match project area
    });

    const recApi = await recommendationsApiForUser({ uid: recUid });

    await recApi.createManySmart(project.id!, [
      {
        name: "Chris Morris",
        email: "morris@example.com",
        phone: "02071234567",
        company: "Builder A",
        comment: "Excellent job, tidy and on time.",
        rating: 5,
        source: "platform",
        photos: [
          { name: "a.png", mimeType: "image/png", buffer: photoBuffer() },
        ],
      },
      {
        name: "Bobby Brown",
        email: "bobby.brown@example.com",
        phone: "02071234561",
        company: "Builder B",
        comment: "Solid work overall.",
        rating: 4,
        source: "platform",
        photos: [
          { name: "b.png", mimeType: "image/png", buffer: photoBuffer() },
        ],
      },
      {
        name: "Jane Doe",
        email: "jane.doe@example.com",
        phone: "02071234562",
        company: "Builder C",
        comment: "Friendly and fast service.",
        rating: 5,
        source: "platform",
        photos: [
          { name: "c.png", mimeType: "image/png", buffer: photoBuffer() },
        ],
      },
      {
        name: "Alex Roe",
        email: "alex.roe@example.com",
        phone: "02071234563",
        company: "Builder D",
        comment: "Would hire again next time.",
        rating: 5,
        source: "platform",
      },
    ]);

    await loginAsUid(ownerUid!, { redirect: `/projects/${project.id}` });

    await projectViewPage.viewMoreBtn.click();
    await expect(recommendationsPage.page).toHaveURL(
      /\/projects\/\d+\/shortlist/
    );
    await recommendationsPage.hasHeading(project.name);
    await recommendationsPage.hasRecommendations([
      {
        company: "Builder D",
        rating: 5,
        likes: 1,
        comment: "Would hire again next time.",
        label: "community",
        recommenderName: "Alex Roe",
        email: "alex.roe@example.com",
        phone: "02071234563",
        hasGallery: false,
      },
      {
        company: "Builder C",
        rating: 5,
        likes: 1,
        comment: "Friendly and fast service.",
        label: "community",
        recommenderName: "Jane Doe",
        email: "jane.doe@example.com",
        phone: "02071234562",
        hasGallery: true,
      },
      {
        company: "Builder B",
        rating: 4,
        likes: 1,
        comment: "Solid work overall.",
        label: "community",
        recommenderName: "Bobby Brown",
        email: "bobby.brown@example.com",
        phone: "02071234561",
        hasGallery: true,
      },
      {
        company: "Builder A",
        rating: 5,
        likes: 1,
        comment: "Excellent job, tidy and on time.",
        label: "community",
        recommenderName: "Chris Morris",
        email: "morris@example.com",
        phone: "02071234567",
        hasGallery: true,
      },
    ]);
  });
});
