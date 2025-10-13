// e2e-tests/tests/header/notification.spec.ts
import { test, expect } from "../../src/fixtures/base-fixture";
import { ProjectsApi } from "../../src/api-utils/projects-api";
import Project from "../../src/models/Project";
import { randomOf, phoneFor, companyLabel } from "../../src/utils/helpers";
import { names, now, comments } from "../../src/constants/index";

function photoBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6W6nS0AAAAASUVORK5CYII=",
    "base64"
  );
}

test.describe("Header", () => {
  test.skip("check notification", async ({
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

    const recommendations = Array.from({ length: 100 }, (_v, i) => ({
      name: randomOf(names),
      email: `e2e+${now}-${i}@example.com`, // uses Date.now + index
      phone: phoneFor(i),
      company: companyLabel(i),
      comment: randomOf(comments),
      rating: 4,
      source: "platform" as const,
      photos: [
        {
          name: `img-${i}.png`,
          mimeType: "image/png",
          buffer: photoBuffer(),
        },
      ],
    }));
    await recApi.createManySmart(project.id!, recommendations);

    await loginAsUid(ownerUid!, { redirect: `/projects/${project.id}` });
  });
});
