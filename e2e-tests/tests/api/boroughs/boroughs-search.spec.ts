import { test, expect } from "../../../src/fixtures";

test.describe("GET /api/boroughs/search", () => {
  test("returns matched borough for lowercase query", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/boroughs/search?q=waltham`,
    );

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const match = body.find((b: { name: string }) => b.name === "Waltham Forest");
    expect(match).toBeTruthy();
    expect(match.outwardCodes).toEqual(["E4", "E10", "E11", "E17"]);
  });

  test("is case-insensitive (uppercase query)", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/boroughs/search?q=WALTHAM`,
    );

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);

    const match = body.find((b: { name: string }) => b.name === "Waltham Forest");
    expect(match).toBeTruthy();
  });

  test("returns empty array for unmatched query", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/boroughs/search?q=zzzzz`,
    );

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("returns empty array when q is empty", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/boroughs/search?q=`,
    );

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
