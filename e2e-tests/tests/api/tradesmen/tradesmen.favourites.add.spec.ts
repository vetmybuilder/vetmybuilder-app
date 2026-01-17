import { test, expect } from "../../../src/fixtures";
import {
  authedApiForUid,
  getUidFromJoinResponse,
} from "../../../src/api/services/client";

test.describe("Tradesmen favourites - adding", () => {
  test("A signed-in user can add a tradesman to their favourites list", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    const res = await client.addFavouriteTradesman(tradesmanUid);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, favourited: true });

    await client.expectFavouriteListed(tradesmanUid);
  });

  test("A user who is not logged in cannot favourite a tradesman", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const res = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/${encodeURIComponent(tradesmanUid)}/favourite`,
      { data: {} },
    );

    expect(res.status()).toBe(401);
  });

  test("Rejects a blank or invalid tradesman id", async ({
    request,
    runtime,
  }) => {
    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    // IMPORTANT:
    // must keep spaces in the URL segment so the route matches (:id = "%20%20%20"),
    // then the handler trims and returns 400.
    const res = await client.addFavouriteTradesmanViaUrlParam("   ");
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid tradesman id" });
  });

  test("Favouriting the same tradesman twice does not create duplicates", async ({
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
    expect((await client.addFavouriteTradesman(tradesmanUid)).status()).toBe(
      200,
    );

    expect(await client.countFavouriteEntries(tradesmanUid)).toBe(1);
  });

  test("Extra spaces around the tradesman id are ignored", async ({
    adminApiClient,
    request,
    runtime,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const tradesmanUid = await getUidFromJoinResponse(joinRes);

    const userUid = `fav-user-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, userUid);

    const res = await client.addFavouriteTradesman(`  ${tradesmanUid}  `);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, favourited: true });

    await client.expectFavouriteListed(tradesmanUid);
  });
});
