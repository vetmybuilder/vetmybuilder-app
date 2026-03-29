import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";
import Tradesman from "../../../src/models/tradesman";

const PHOTOS = [
  "https://cdn.example.com/photo-a.jpg",
  "https://cdn.example.com/photo-b.jpg",
  "https://cdn.example.com/photo-c.jpg",
];

test.describe("Profile picture — GET /api/tradesmen/:uid (public)", () => {
  test("profilePictureUrl in photoUrls is returned as avatarUrl", async ({
    request,
    runtime,
  }) => {
    const uid = `pp-in-set-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS)
      .withProfilePictureUrl(PHOTOS[1]);

    const putRes = await client.put(
      "/api/tradesmen/me",
      tradesman.toPayload(),
    );
    expect(putRes.status()).toBe(200);
    expect((await putRes.json()).ok).toBe(true);

    const getRes = await client.get(`/api/tradesmen/${uid}`);
    expect(getRes.status()).toBe(200);
    const { item } = await getRes.json();

    expect(item.avatarUrl).toBe(PHOTOS[1]);
    expect(item.profilePictureUrl).toBe(PHOTOS[1]);
  });

  test("profilePictureUrl NOT in photoUrls is cleared; avatarUrl falls back to first photo", async ({
    request,
    runtime,
  }) => {
    const uid = `pp-not-in-set-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS)
      .withProfilePictureUrl("https://cdn.example.com/not-uploaded.jpg");

    const putRes = await client.put(
      "/api/tradesmen/me",
      tradesman.toPayload(),
    );
    expect(putRes.status()).toBe(200);

    const getRes = await client.get(`/api/tradesmen/${uid}`);
    expect(getRes.status()).toBe(200);
    const { item } = await getRes.json();

    expect(item.profilePictureUrl).toBeNull();
    expect(item.avatarUrl).toBe(PHOTOS[0]);
  });

  test("profilePictureUrl null uses first photo as avatarUrl", async ({
    request,
    runtime,
  }) => {
    const uid = `pp-null-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS)
      .withProfilePictureUrl(null);

    const putRes = await client.put(
      "/api/tradesmen/me",
      tradesman.toPayload(),
    );
    expect(putRes.status()).toBe(200);

    const getRes = await client.get(`/api/tradesmen/${uid}`);
    expect(getRes.status()).toBe(200);
    const { item } = await getRes.json();

    expect(item.profilePictureUrl).toBeNull();
    expect(item.avatarUrl).toBe(PHOTOS[0]);
  });

  test("updating photoUrls to a set that omits the profilePictureUrl clears it", async ({
    request,
    runtime,
  }) => {
    const uid = `pp-removed-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    // First save: pick PHOTOS[2] as profile picture
    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman()
        .withRandomDetails()
        .withPhotoUrls(PHOTOS)
        .withProfilePictureUrl(PHOTOS[2])
        .toPayload(),
    );

    // Second save: update photoUrls to only include PHOTOS[0] and PHOTOS[1],
    // leaving PHOTOS[2] out. profilePictureUrl not sent — server should
    // clear it because it's no longer in the set.
    const tradesman2 = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls([PHOTOS[0], PHOTOS[1]])
      .withProfilePictureUrl(PHOTOS[2]); // still requesting removed photo

    await client.put("/api/tradesmen/me", tradesman2.toPayload());

    const getRes = await client.get(`/api/tradesmen/${uid}`);
    expect(getRes.status()).toBe(200);
    const { item } = await getRes.json();

    expect(item.profilePictureUrl).toBeNull();
    expect(item.avatarUrl).toBe(PHOTOS[0]);
  });

  test("no photos and no profilePictureUrl returns avatarUrl null", async ({
    request,
    runtime,
  }) => {
    const uid = `pp-no-photos-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const tradesman = Tradesman.aTradesman().withRandomDetails();

    await client.put("/api/tradesmen/me", tradesman.toPayload());

    const getRes = await client.get(`/api/tradesmen/${uid}`);
    expect(getRes.status()).toBe(200);
    const { item } = await getRes.json();

    expect(item.profilePictureUrl).toBeNull();
    expect(item.avatarUrl).toBeNull();
  });
});

test.describe("Profile picture — GET /api/tradesmen/me (authenticated)", () => {
  test("profile_picture_url in photo set is returned as avatar_url", async ({
    request,
    runtime,
  }) => {
    const uid = `me-pp-in-set-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman()
        .withRandomDetails()
        .withPhotoUrls(PHOTOS)
        .withProfilePictureUrl(PHOTOS[1])
        .toPayload(),
    );

    const res = await client.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);
    const { profile } = await res.json();

    expect(profile.profile_picture_url).toBe(PHOTOS[1]);
    expect(profile.avatar_url).toBe(PHOTOS[1]);
  });

  test("profile_picture_url not in photo set is cleared; avatar_url falls back to first photo", async ({
    request,
    runtime,
  }) => {
    const uid = `me-pp-not-in-set-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman()
        .withRandomDetails()
        .withPhotoUrls(PHOTOS)
        .withProfilePictureUrl("https://cdn.example.com/not-uploaded.jpg")
        .toPayload(),
    );

    const res = await client.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);
    const { profile } = await res.json();

    expect(profile.profile_picture_url).toBeNull();
    expect(profile.avatar_url).toBe(PHOTOS[0]);
  });

  test("no profile_picture_url; avatar_url falls back to first photo", async ({
    request,
    runtime,
  }) => {
    const uid = `me-pp-null-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman()
        .withRandomDetails()
        .withPhotoUrls(PHOTOS)
        .withProfilePictureUrl(null)
        .toPayload(),
    );

    const res = await client.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);
    const { profile } = await res.json();

    expect(profile.profile_picture_url).toBeNull();
    expect(profile.avatar_url).toBe(PHOTOS[0]);
  });

  test("no photos and no profile_picture_url returns avatar_url null", async ({
    request,
    runtime,
  }) => {
    const uid = `me-pp-no-photos-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman().withRandomDetails().toPayload(),
    );

    const res = await client.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);
    const { profile } = await res.json();

    expect(profile.profile_picture_url).toBeNull();
    expect(profile.avatar_url).toBeNull();
  });

  test("photo_urls array is returned and matches what was saved", async ({
    request,
    runtime,
  }) => {
    const uid = `me-photo-urls-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman()
        .withRandomDetails()
        .withPhotoUrls(PHOTOS)
        .toPayload(),
    );

    const res = await client.get("/api/tradesmen/me");
    expect(res.status()).toBe(200);
    const { profile } = await res.json();

    expect(profile.photo_urls).toEqual(PHOTOS);
    expect(profile.photo_count).toBe(PHOTOS.length);
  });
});
