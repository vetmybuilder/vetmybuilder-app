import { test, expect } from "../../../src/fixtures";
import {
  authedApiForUid,
  getUidFromJoinResponse,
} from "../../../src/api/services/client";

test.describe("Tradesmen favourites - removing", () => {
  test("A signed-in user can remove a tradesman from their favourites list", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    expect((await client.addFavouriteTradesman(tradesmanUid)).status()).toBe(
      200,
    );

    const del = await client.removeFavouriteTradesman(tradesmanUid);
    expect(del.status()).toBe(200);
    expect(await del.json()).toEqual({ ok: true, favourited: false });

    await client.expectFavouriteNotListed(tradesmanUid);
  });

  test("A user who is not logged in cannot remove a favourite", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const res = await request.delete(
      `${runtime.apiBaseUrl}/api/tradesmen/${encodeURIComponent(tradesmanUid)}/favourite`,
    );

    expect(res.status()).toBe(401);
  });

  test("Rejects a blank or invalid tradesman id when removing", async ({
    request,
    runtime,
  }) => {
    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    const res = await client.removeFavouriteTradesmanViaUrlParam("   ");
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid tradesman id" });
  });

  test("Removing a favourite that was never added still returns success", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    const res = await client.removeFavouriteTradesman(tradesmanUid);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, favourited: false });
  });

  test("Removing a favourite only affects the current user", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const userA = `fav-user-a-${Date.now()}`;
    const userB = `fav-user-b-${Date.now()}`;

    const clientA = await authedApiForUid(request, runtime.apiBaseUrl, userA);
    const clientB = await authedApiForUid(request, runtime.apiBaseUrl, userB);

    expect((await clientA.addFavouriteTradesman(tradesmanUid)).status()).toBe(
      200,
    );
    expect((await clientB.addFavouriteTradesman(tradesmanUid)).status()).toBe(
      200,
    );

    expect(
      (await clientA.removeFavouriteTradesman(tradesmanUid)).status(),
    ).toBe(200);

    await clientA.expectFavouriteNotListed(tradesmanUid);
    await clientB.expectFavouriteListed(tradesmanUid);
  });
});
