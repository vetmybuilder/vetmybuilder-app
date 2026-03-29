import { test, expect } from "../../../src/fixtures";
import {
  authedApiForUid,
  getUidFromJoinResponse,
} from "../../../src/api/services/client";

test.describe("Tradesmen favourites - viewing", () => {
  test("A user can see a tradesman they have favourited in their favourites list", async ({
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

    const fav = await client.expectFavouriteListed(tradesmanUid);

    expect(fav.builderId).toBe(String(tradesmanUid));
    expect(fav.displayName).toBeTruthy();
    expect(fav.tier).toBeTruthy();
    expect(fav.stats).toBeTruthy();
    expect(Boolean(fav.isFavourite)).toBe(true);

    expect(typeof fav.stats?.completed).toBe("number");
    expect(typeof fav.stats?.photos).toBe("number");
    expect(typeof fav.stats?.reviews).toBe("number");
  });

  test("A signed-in user with no favourites sees an empty list", async ({
    request,
    runtime,
  }) => {
    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    const res = await client.listFavouriteTradesmen();
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  test("A user who is not logged in cannot view favourites", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/tradesmen/favourites`,
    );
    expect(res.status()).toBe(401);
  });

  test("A user can see multiple favourites they have added", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    const join1 = await adminApiClient.joinTradesmanDraft({
      companyName: `Fav Co A ${Date.now()}`,
      email: `fav-a-${Date.now()}@example.com`,
    });
    expect(join1.status()).toBe(201);
    const uid1 = await getUidFromJoinResponse(join1);

    const join2 = await adminApiClient.joinTradesmanDraft({
      companyName: `Fav Co B ${Date.now()}`,
      email: `fav-b-${Date.now()}@example.com`,
    });
    expect(join2.status()).toBe(201);
    const uid2 = await getUidFromJoinResponse(join2);

    expect((await client.addFavouriteTradesman(uid1)).status()).toBe(200);
    expect((await client.addFavouriteTradesman(uid2)).status()).toBe(200);

    await client.expectFavouriteListed(uid1);
    await client.expectFavouriteListed(uid2);
  });
});
