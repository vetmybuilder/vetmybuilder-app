// tests/server/webPresence.mocked-reasons.spec.ts
//
// Pins the fact that verifyWebPresence surfaces a `reasons` array in
// MOCK_EXTERNAL_SERVICES=1 mode (dev / CI). Previously it returned
// `{ verified: false, mocked: true }` with no reasons, so the
// `me.put.js` reason-extractor saw an empty array and wrote NULL to
// web_verification_reason - admin then showed the unticked website
// row with no human label next to it.
//
// Contract pinned:
//   - With the mock switch ON: verified is false, reasons contains
//     exactly one entry "website:external_services_mocked".
//   - The route never touches the real internet in mocked mode.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { verifyWebPresence } from "../../server/lib/webPresence";

describe("verifyWebPresence - MOCK_EXTERNAL_SERVICES short-circuit", () => {
  const original = process.env.MOCK_EXTERNAL_SERVICES;

  beforeEach(() => {
    process.env.MOCK_EXTERNAL_SERVICES = "1";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MOCK_EXTERNAL_SERVICES;
    } else {
      process.env.MOCK_EXTERNAL_SERVICES = original;
    }
  });

  it("returns verified=false + a website-prefixed reason", async () => {
    const result = await verifyWebPresence(
      "https://anything-since-mocked.example/",
      [],
      { vendorName: "Acme Trades" },
    );

    expect(result.verified).toBe(false);
    expect(result.mocked).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons).toContain("website:external_services_mocked");
  });

  it("returns the same shape even when no website is supplied", async () => {
    const result = await verifyWebPresence(null, [], {
      vendorName: "Acme Trades",
    });

    expect(result.verified).toBe(false);
    expect(result.mocked).toBe(true);
    expect(result.reasons).toContain("website:external_services_mocked");
  });
});
