import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const { REFUND_POLICY_VERSION } = require("../../server/lib/payments/refundPolicyVersion");

// Keeps the version stamp written against paid orders in lockstep with
// what users see on the public /refund-policy page. If you bump one
// without the other this test trips - on purpose. Bump both.
describe("refund policy version sync", () => {
  it("REFUND_POLICY_VERSION matches the lastUpdated string in /refund-policy", () => {
    const pagePath = path.resolve(__dirname, "../../web/pages/refund-policy.tsx");
    const src = readFileSync(pagePath, "utf8");
    const m = src.match(/lastUpdated\s*=\s*"([^"]+)"/);
    expect(m, "lastUpdated prop must exist in refund-policy.tsx").toBeTruthy();

    const human = new Date(`${REFUND_POLICY_VERSION}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    expect(m![1]).toBe(human);
  });
});
