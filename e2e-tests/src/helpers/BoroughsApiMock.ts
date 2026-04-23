import { expect, type Page } from "@playwright/test";

export type BoroughsApiMock = {
  callCount(): number;
  expectNotCalled(): Promise<void>;
};

export async function mockBoroughsApi(page: Page): Promise<BoroughsApiMock> {
  let calls = 0;
  await page.route(/\/api\/boroughs\/search/, async (route) => {
    calls += 1;
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    const all = [
      { name: "Waltham Forest", outwardCodes: ["E4", "E10", "E11", "E17"] },
      { name: "Hackney", outwardCodes: ["E5", "E8", "E9", "N1", "N16"] },
    ];
    const body =
      q.length < 2 ? [] : all.filter((b) => b.name.toLowerCase().includes(q));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  return {
    callCount: () => calls,
    async expectNotCalled() {
      await page.waitForTimeout(400);
      expect(calls).toBe(0);
    },
  };
}
