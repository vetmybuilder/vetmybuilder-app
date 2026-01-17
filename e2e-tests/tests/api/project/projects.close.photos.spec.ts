import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/project";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("POST /api/projects/:id/close/photos", () => {
  test("owner can upload closure photos", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const photoPaths = ["src/files/photo1.jpg", "src/files/photo2.jpg"];

    const res = await apiClient.uploadProjectClosePhotos(
      project.id,
      photoPaths,
    );

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body).toEqual({ ok: true, count: 2 });
  });

  test("400 Invalid id", async ({ apiClient }) => {
    const res = await apiClient.uploadProjectClosePhotos("nope" as any, [
      "src/files/photo1.jpg",
    ]);

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid id" });
  });

  test("404 Not found", async ({ apiClient }) => {
    const res = await apiClient.uploadProjectClosePhotos(99999999, [
      "src/files/photo1.jpg",
    ]);

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("403 Forbidden (non-owner)", async ({ apiClient, request, runtime }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const otherUid = `not-owner-${Date.now()}`;
    const otherClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      otherUid,
    );

    const res = await otherClient.uploadProjectClosePhotos(project.id, [
      "src/files/photo1.jpg",
    ]);

    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  test("close photos endpoint succeeds even when no photos are uploaded", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const res = await apiClient.post(
      `/api/projects/${project.id}/close/photos`,
      {
        anything: "not-multipart",
      },
    );

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 0 });
  });

  test("uploads are limited to 20 photos", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const base = [
      "src/files/photo1.jpg",
      "src/files/photo2.jpg",
      "src/files/photo3.jpg",
      "src/files/photo4.jpg",
      "src/files/photo5.jpg",
      "src/files/photo6.jpg",
    ];

    const photoPaths = [...base, ...base, ...base, ...base];

    const res = await apiClient.uploadProjectClosePhotos(
      project.id,
      photoPaths,
    );

    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ ok: true, count: 20 });
  });

  test("owner can upload a single closure photo", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const res = await apiClient.uploadProjectClosePhotos(project.id, [
      "src/files/photo1.jpg",
    ]);

    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ ok: true, count: 1 });
  });

  test("returns 401 when user is not authenticated", async ({ apiClient }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const res = await apiClient.uploadProjectClosePhotosUnauthed(project.id, [
      "src/files/photo1.jpg",
    ]);

    expect(res.status()).toBe(401);
  });

  test("rejects invalid file type when uploading closure photos", async ({
    apiClient,
  }) => {
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toPayload(),
    );
    expect(projectRes.status()).toBe(201);

    const { project } = await projectRes.json();

    const res = await apiClient.uploadProjectClosePhotos(project.id, [
      "src/files/invalid.txt",
    ]);

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("upload_failed");
  });
});
