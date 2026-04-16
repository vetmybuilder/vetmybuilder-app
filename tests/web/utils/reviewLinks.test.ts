import { describe, it, expect } from "vitest";
import {
  REVIEW_PLATFORMS,
  normalizeReviewLink,
  buildReviewLinksPayload,
  platformLabelFor,
} from "../../../web/utils/reviewLinks";

describe("normalizeReviewLink", () => {
  it("returns null for an empty input", () => {
    expect(normalizeReviewLink("trustpilot", "")).toBeNull();
    expect(normalizeReviewLink("trustpilot", "   ")).toBeNull();
  });

  it("accepts a canonical https URL on the right domain", () => {
    expect(
      normalizeReviewLink(
        "trustpilot",
        "https://www.trustpilot.com/review/example.com",
      ),
    ).toBe("https://www.trustpilot.com/review/example.com");
  });

  it("upgrades http -> https", () => {
    expect(
      normalizeReviewLink("bark", "http://www.bark.com/en/gb/company/foo/"),
    ).toBe("https://www.bark.com/en/gb/company/foo/");
  });

  it("infers https when the user typed only a host", () => {
    expect(
      normalizeReviewLink("checkatrade", "www.checkatrade.com/trades/foo"),
    ).toBe("https://www.checkatrade.com/trades/foo");
  });

  it("rejects a URL on the wrong platform's domain", () => {
    // trustpilot URL submitted under bark
    expect(
      normalizeReviewLink("bark", "https://www.trustpilot.com/review/x"),
    ).toBeNull();
  });

  it("accepts both the canonical host and the locale subdomain", () => {
    expect(
      normalizeReviewLink("trustpilot", "https://uk.trustpilot.com/review/x"),
    ).toBe("https://uk.trustpilot.com/review/x");
  });

  it("rejects malformed URLs", () => {
    expect(normalizeReviewLink("trustpilot", "not a url")).toBeNull();
    expect(normalizeReviewLink("trustpilot", "javascript:alert(1)")).toBeNull();
  });

  it("rejects an unknown platform id", () => {
    // @ts-expect-error - intentionally passing an invalid id
    expect(normalizeReviewLink("notarealplatform", "https://x.com")).toBeNull();
  });

  it("covers every advertised platform with at least one happy-path URL", () => {
    for (const p of REVIEW_PLATFORMS) {
      // Use the placeholder as a stand-in for a real URL - it's defined
      // to be a canonical example for that platform.
      const got = normalizeReviewLink(p.id, p.placeholder);
      expect(got, `no normaliser hit for ${p.id}`).not.toBeNull();
      expect(got).toMatch(/^https:\/\//);
    }
  });
});

describe("buildReviewLinksPayload", () => {
  it("drops empty entries silently", () => {
    expect(
      buildReviewLinksPayload([
        { platform: "trustpilot", url: "" },
        { platform: "bark", url: "   " },
      ]),
    ).toEqual([]);
  });

  it("drops entries that fail platform validation", () => {
    expect(
      buildReviewLinksPayload([
        { platform: "trustpilot", url: "https://www.trustpilot.com/review/x" },
        { platform: "bark", url: "https://www.trustpilot.com/review/x" }, // wrong host for bark
      ]),
    ).toEqual([
      {
        platform: "trustpilot",
        url: "https://www.trustpilot.com/review/x",
      },
    ]);
  });

  it("preserves declared platform tag rather than guessing from URL", () => {
    const out = buildReviewLinksPayload([
      {
        platform: "houzz",
        url: "https://www.houzz.co.uk/professionals/foo",
      },
    ]);
    expect(out[0].platform).toBe("houzz");
  });
});

describe("platformLabelFor", () => {
  it("returns the canonical label for a known platform", () => {
    expect(
      platformLabelFor({
        platform: "trustpilot",
        url: "https://www.trustpilot.com/review/x",
      }),
    ).toBe("Trustpilot");
  });

  it("falls back to the hostname for an unknown platform id", () => {
    expect(
      platformLabelFor({
        platform: "newshinyplatform",
        url: "https://reviews.example.co.uk/foo",
      }),
    ).toBe("reviews.example.co.uk");
  });

  it("falls back to a generic label when both id and URL are unparseable", () => {
    expect(
      platformLabelFor({
        platform: "x",
        url: "not a url",
      }),
    ).toBe("external link");
  });
});
