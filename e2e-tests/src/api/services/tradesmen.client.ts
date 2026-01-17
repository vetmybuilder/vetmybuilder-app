import { expect } from "@playwright/test";
import type { ApiCore } from "../_core";
import { encodeIdForPath } from "../_core";

export function tradesmenClient(core: ApiCore) {
  async function getTradesmanMe() {
    return core.get("/api/tradesmen/me");
  }

  async function getTradesmanMeUnauthed() {
    return core.request.get(`${core.baseUrl}/api/tradesmen/me`);
  }

  async function joinTradesmanDraft(args?: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
  }) {
    const stamp = Date.now();
    const payload = {
      companyName: args?.companyName || `Fav Co ${stamp}`,
      contactName: args?.contactName || "Test Tradesman",
      email: args?.email || `fav-${stamp}@example.com`,
      phone: args?.phone || "07123456789",
    };

    return core.post("/api/tradesmen/join", payload);
  }

  // ---------------- FAVOURITES (tradesmen) ----------------

  async function addFavouriteTradesman(tradesmanUid: string) {
    const id = encodeIdForPath(tradesmanUid);
    return core.post(`/api/tradesmen/${id}/favourite`, {});
  }

  async function removeFavouriteTradesman(tradesmanUid: string) {
    const id = encodeIdForPath(tradesmanUid);
    return core.request.delete(
      `${core.baseUrl}/api/tradesmen/${id}/favourite`,
      {
        headers: core.headers,
      },
    );
  }

  // These intentionally encode the raw value as a URL segment so that "   " becomes "%20%20%20"
  // and still matches /tradesmen/:id/favourite, letting the handler trim and return 400.
  async function addFavouriteTradesmanViaUrlParam(rawId: string) {
    const id = encodeURIComponent(String(rawId ?? ""));
    return core.post(`/api/tradesmen/${id}/favourite`, {});
  }

  async function removeFavouriteTradesmanViaUrlParam(rawId: string) {
    const id = encodeURIComponent(String(rawId ?? ""));
    return core.request.delete(
      `${core.baseUrl}/api/tradesmen/${id}/favourite`,
      {
        headers: core.headers,
      },
    );
  }

  async function listFavouriteTradesmen() {
    return core.get("/api/tradesmen/favourites");
  }

  async function fetchFavouriteItems(): Promise<{ items: any[] }> {
    const res = await listFavouriteTradesmen();
    expect(res.status()).toBe(200);
    const body: any = await res.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    return { items };
  }

  async function findFavouriteByBuilderId(builderId: string) {
    const { items } = await fetchFavouriteItems();
    const id = String(builderId);
    for (const it of items) {
      if (String(it?.builderId) === id) return it;
    }
    return null;
  }

  async function expectFavouriteListed(builderId: string) {
    const found = await findFavouriteByBuilderId(builderId);
    expect(found).toBeTruthy();
    return found;
  }

  async function expectFavouriteNotListed(builderId: string) {
    const found = await findFavouriteByBuilderId(builderId);
    expect(found).toBeFalsy();
  }

  async function countFavouriteEntries(builderId: string) {
    const { items } = await fetchFavouriteItems();
    const id = String(builderId);
    let count = 0;
    for (const it of items) {
      if (String(it?.builderId) === id) count++;
    }
    return count;
  }

  // NOTE: order tests can be flaky if DB stores only second precision.
  // We'll keep the strict helper (your spec can decide whether to use it).
  async function expectFavouritesNewestFirst(expectedBuilderIds: string[]) {
    const { items } = await fetchFavouriteItems();
    for (let i = 0; i < expectedBuilderIds.length; i++) {
      expect(String(items[i]?.builderId)).toBe(String(expectedBuilderIds[i]));
    }
  }

  return {
    // tradesmen
    getTradesmanMe,
    getTradesmanMeUnauthed,
    joinTradesmanDraft,

    // favourites
    addFavouriteTradesman,
    removeFavouriteTradesman,
    addFavouriteTradesmanViaUrlParam,
    removeFavouriteTradesmanViaUrlParam,
    listFavouriteTradesmen,
    fetchFavouriteItems,
    expectFavouriteListed,
    expectFavouriteNotListed,
    countFavouriteEntries,
    expectFavouritesNewestFirst,
  };
}
