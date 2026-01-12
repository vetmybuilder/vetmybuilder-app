import { test, expect } from "../../../src/fixtures";
import Tradesman from "../../../src/models/tradesman";

test.describe("POST /api/tradesmen/join", () => {
  test("creates a draft lead and returns an id", async ({
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com", "https://facebook.com/example"])
      .withDocs(2)
      .withWorkPhotos(3)
      .withOffer({ discountMin: 10, discountMax: 20, warranty: "12m" })
      .withLikesCount(40)
      .withWinsCount(2);

    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: tradesman.toJoinPayload(),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("lead_")).toBe(true);
  });

  test("400 when companyName is missing", async ({ request, runtime }) => {
    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: {
        tradeTypes: "plumbing",
        serviceAreas: "London",
      },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "companyName is required" });
  });

  test("400 when companyName is blank/whitespace", async ({
    request,
    runtime,
  }) => {
    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: {
        companyName: "   ",
        tradeTypes: "plumbing",
        serviceAreas: "London",
      },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "companyName is required" });
  });

  test("still creates when optional arrays are omitted", async ({
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: tradesman.toJoinPayload(),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("lead_")).toBe(true);
  });

  test("accepts websites/doc/photos fields even when empty arrays", async ({
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: {
        ...tradesman.toJoinPayload(),
        websites: [],
        docs: [],
        workPhotos: [],
      },
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("lead_")).toBe(true);
  });

  test("clamps discountMin/discountMax into 0..100 and still creates", async ({
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withOffer({ discountMin: -50, discountMax: 500, warranty: "12m" });

    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: tradesman.toJoinPayload(),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("lead_")).toBe(true);
  });

  test("accepts unknown warranty key and still creates", async ({
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      // route maps unknown -> 0 months
      .withOffer({ discountMin: 5, discountMax: 10, warranty: "weird" as any });

    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: tradesman.toJoinPayload(),
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("lead_")).toBe(true);
  });

  test("ignores non-array websites/docs/workPhotos and still creates", async ({
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    const res = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: {
        ...tradesman.toJoinPayload(),
        websites: "https://example.com",
        docs: "not-an-array",
        workPhotos: "not-an-array",
      } as any,
    });

    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(typeof body.id).toBe("string");
    expect(body.id.startsWith("lead_")).toBe(true);
  });

  test("can create multiple leads with same companyName (ids are unique)", async ({
    request,
    runtime,
  }) => {
    const companyName = `Same Co ${Date.now()}`;

    const t1 = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(companyName);
    const t2 = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(companyName);

    const r1 = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: t1.toJoinPayload(),
    });
    expect(r1.status()).toBe(201);
    const b1 = await r1.json();

    const r2 = await request.post(`${runtime.apiBaseUrl}/api/tradesmen/join`, {
      data: t2.toJoinPayload(),
    });
    expect(r2.status()).toBe(201);
    const b2 = await r2.json();

    expect(b1.ok).toBe(true);
    expect(b2.ok).toBe(true);
    expect(b1.id).not.toBe(b2.id);
  });

  test("404 on wrong route", async ({ request, runtime }) => {
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/joinn`,
      {
        data: { companyName: "Nope Ltd" },
      }
    );
    expect(res.status()).toBe(404);
  });

  test("GET is not allowed (expect 401 depending on server)", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(`${runtime.apiBaseUrl}/api/tradesmen/join`);
    expect(401).toEqual(res.status());
  });
});
