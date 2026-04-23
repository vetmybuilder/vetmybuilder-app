import type { Page } from "@playwright/test";

const UK_POSTCODE_PARTS = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

function metaFor(postcode: string) {
  const clean = postcode.trim().toUpperCase().replace(/\s+/g, " ");
  const m = clean.replace(/\s+/g, "").match(UK_POSTCODE_PARTS);
  const outward = m ? m[1] : clean.split(" ")[0];
  const inward = m ? m[2] : clean.split(" ")[1] ?? "";
  return {
    postcode: inward ? `${outward} ${inward}` : outward,
    outcode: outward,
    outward_code: outward,
    incode: inward,
    inward_code: inward,
    admin_district: "Westminster",
    region: "London",
    country: "England",
    latitude: 51.5014,
    longitude: -0.1419,
  };
}

export async function mockPostcodesIo(page: Page): Promise<void> {
  await page.route(/api\.postcodes\.io/, async (route) => {
    const url: string = route.request().url();

    if (url.includes("/autocomplete")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: 200, result: [] }),
      });
      return;
    }

    if (url.includes("/places")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: 200, result: [] }),
      });
      return;
    }

    const pcMatch = url.match(/\/postcodes\/([^?/]+)/);
    if (pcMatch) {
      const pc = decodeURIComponent(pcMatch[1]);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: 200, result: metaFor(pc) }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: 200, result: metaFor("SW1A 1AA") }),
    });
  });
}
