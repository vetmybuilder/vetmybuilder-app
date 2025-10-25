// // tests/specs/recommendation.spec.ts
// import { test, expect } from "../../src/fixtures/base-fixture";
// import { ProjectsApi } from "../../src/api-utils/projects-api";
// import Project from "../../src/models/Project";
// import User from "../../src/models/User";

// test.describe("Recommendation", () => {
//   test("can add a recommendation with a photo from recommendation page", async ({
//     usersApi,
//     authApi,
//     loginAsUid,
//     projectsPage,
//     projectViewPage,
//     projectRecommendPage,
//   }) => {
//     // Owner creates + publishes (API only; no owner UI login)
//     const { api: ownerApi } = await ProjectsApi.createForNewOwner({
//       usersApi,
//       authApi,
//       loginInBrowser: false,
//     });

//     const project = Project.aProject();
//     (project as any).location = "E4";
//     await ownerApi.createProject(project);

//     project.status = "Live";

//     // Recommender logs in (same location) and gets the publish notification
//     const recommender = User.aUser()
//       .withFirstName("Bobby")
//       .withLastName("Brown")
//       .withEmail(`e2e+${Date.now()}-b@example.com`)
//       .withPostcode("E4")
//       .withPassword("Passw0rd1");
//     const { uid: recommenderUid } = await usersApi.createUser(recommender);

//     await loginAsUid(recommenderUid!, { redirect: "/projects" });
//     await projectsPage.expectLoaded();
//     await ownerApi.publish(project);
//     await projectsPage.page.reload(); // ensure SSE client bootstrap picks up latest
//     await projectsPage.notification.click();
//     await projectsPage.menuItem.click();
//     await projectViewPage.addRecommendationBtn.click();
//     await expect(projectRecommendPage.name).toHaveValue(
//       `${recommender.firstName} ${recommender.lastName}`
//     );
//     await expect(projectRecommendPage.email).toHaveValue(recommender.email!);
//     await expect(projectRecommendPage.name).toBeDisabled();
//     await expect(projectRecommendPage.email).toBeDisabled();
//     await expect(projectRecommendPage.name).toHaveAttribute("readonly", "");
//     await expect(projectRecommendPage.email).toHaveAttribute("readonly", "");

//     await projectRecommendPage.addRecommendationViaForm({
//       company: "Elegant building services limited",
//       phone: "0207 123 4567",
//       hireAgain: "yes",
//       comment: "Excellent job, tidy and on time.",
//       withPhoto: true,
//     });

//     await expect(projectRecommendPage.recommendationCard).toContainText(
//       "Thanks! Your recommendation has been submitted."
//     );
//     await projectViewPage.hasShortlist({
//       company: "Elegant building services limited",
//       rating: 5,
//       likes: 1,
//       comment: "Excellent job, tidy and on time.",
//       recommenderName: "Bobby Brown",
//       email: recommender.email!,
//       phone: "02071234567",
//       hasGallery: true,
//     });
//   });

//   test("can add a recommendation (via magic link)", async ({
//     usersApi,
//     authApi,
//     loginAsUid,
//     projectsPage,
//     projectViewPage,
//     projectRecommendPage,
//   }) => {
//     // Owner creates & publishes
//     const { api: ownerApi, uid: ownerUid } =
//       await ProjectsApi.createForNewOwner({
//         usersApi,
//         authApi,
//         loginInBrowser: false,
//       });

//     const project = Project.aProject();
//     (project as any).location = "E4";
//     await ownerApi.createProject(project);
//     await ownerApi.publish(project);
//     project.status = "Live";

//     await loginAsUid(ownerUid!, { redirect: `/projects/${project.id}` });
//     const { path } = await projectViewPage.copyMagicLinkToClipboard();

//     const recommender = User.aUser()
//       .withFirstName("Bobby")
//       .withLastName("Brown")
//       .withEmail(`e2e+${Date.now()}-b@example.com`)
//       .withPostcode("E4")
//       .withPassword("Passw0rd1");
//     const { uid: recommenderUid } = await usersApi.createUser(recommender);

//     await loginAsUid(recommenderUid!, { redirect: "/projects" });
//     await projectsPage.hasNoRecommendations();
//     await projectsPage.visit({ url: path });
//     await expect(projectRecommendPage.name).toHaveValue(
//       `${recommender.firstName} ${recommender.lastName}`
//     );
//     await expect(projectRecommendPage.email).toHaveValue(recommender.email!);
//     await expect(projectRecommendPage.name).toBeDisabled();
//     await expect(projectRecommendPage.email).toBeDisabled();
//     await expect(projectRecommendPage.name).toHaveAttribute("readonly", "");
//     await expect(projectRecommendPage.email).toHaveAttribute("readonly", "");
//     await projectRecommendPage.addRecommendationViaForm({
//       company: "Builder A",
//       phone: "0207 123 4567",
//       hireAgain: "yes",
//       comment: "Excellent job, tidy and on time.",
//       withPhoto: true,
//     });

//     await expect(
//       projectRecommendPage.recommendationSubmittedConfirmation
//     ).toHaveText(
//       "Thanks!Your recommendation has been sent.Redirecting to the homepage…"
//     );

//     await projectsPage.page.goto(`/projects/${project.id}`);
//     await projectViewPage.hasShortlist({
//       company: "Builder A",
//       rating: 5,
//       likes: 1,
//       comment: "Excellent job, tidy and on time.",
//       recommenderName: "Bobby Brown",
//       email: recommender.email!,
//       phone: "02071234567",
//       hasGallery: true,
//     });
//     await projectsPage.goto();
//     await projectsPage.tabMyRecommendations.click();
//     await projectsPage.hasProjects([project]);
//   });

//   test("can add a recommendation anonymously (via magic link)", async ({
//     usersApi,
//     authApi,
//     loginAsUid,
//     projectsPage,
//     projectViewPage,
//     projectRecommendPage,
//   }) => {
//     const { api: ownerApi, uid: ownerUid } =
//       await ProjectsApi.createForNewOwner({
//         usersApi,
//         authApi,
//         loginInBrowser: false,
//       });

//     const project = Project.aProject();
//     (project as any).location = "E4";
//     await ownerApi.createProject(project);
//     await ownerApi.publish(project);
//     project.status = "Live";

//     await loginAsUid(ownerUid!, { redirect: `/projects/${project.id}` });
//     const { path } = await projectViewPage.copyMagicLinkToClipboard();

//     await projectsPage.logoutAndWait();
//     await projectsPage.visit({ url: path });
//     await expect(projectRecommendPage.name).toBeEnabled();
//     await expect(projectRecommendPage.email).toBeEnabled();
//     await expect(projectRecommendPage.name).toBeEmpty();
//     await expect(projectRecommendPage.email).toBeEmpty();
//     await projectRecommendPage.addRecommendationViaForm({
//       name: "Chris Morris",
//       email: "morris@example.com",
//       company: "Builder A",
//       phone: "0207 123 4567",
//       hireAgain: "yes",
//       comment: "Excellent job, tidy and on time.",
//       withPhoto: true,
//     });

//     await expect(
//       projectRecommendPage.recommendationSubmittedConfirmation
//     ).toHaveText(
//       "Thanks!Your recommendation has been sent.Redirecting to the homepage…"
//     );

//     await loginAsUid(ownerUid!, { redirect: `/projects/${project.id}` });
//     await projectViewPage.hasShortlist({
//       company: "Builder A",
//       rating: 5,
//       likes: 1,
//       comment: "Excellent job, tidy and on time.",
//       recommenderName: "Chris Morris",
//       email: "morris@example.com",
//       phone: "02071234567",
//       hasGallery: true,
//     });
//     await projectsPage.goto();
//     await projectsPage.hasProjects([project]);
//   });
// });
