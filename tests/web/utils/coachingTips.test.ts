import { describe, it, expect } from "vitest";
import { getCoachingTips } from "../../../web/utils/coachingTips";
import type { VendorForScoring } from "../../../web/utils/vendorScoring";

// A profile with EVERYTHING filled in — should produce zero tips.
const completeProfile: VendorForScoring = {
  chStatus: "verified",
  warrantyMonths: 36,
  photoCount: 5,
  trades: ["Plumber", "Gas Engineer", "Bathroom Fitter"],
  serviceAreas: ["E4", "E17", "N17"],
  supportingDocCount: 3,
  websiteUrl: "https://example.com",
  webVerified: true,
  socialLinks: ["https://facebook.com/example"],
  offersDiscount: true,
};

// A profile with NOTHING filled in — should produce 3 tips (the top 3 by points).
const emptyProfile: VendorForScoring = {};

describe("getCoachingTips", () => {
  it("returns empty array for a complete profile", () => {
    expect(getCoachingTips(completeProfile)).toEqual([]);
  });

  it("returns max 3 tips even when more gaps exist", () => {
    const tips = getCoachingTips(emptyProfile);
    expect(tips).toHaveLength(3);
  });

  it("returns tips sorted by highest impact first", () => {
    const tips = getCoachingTips(emptyProfile);
    expect(tips[0].key).toBe("companiesHouse"); // 22 points
    expect(tips[1].key).toBe("warranty");        // 16 points
    expect(tips[2].key).toBe("photos");          // 12 points
  });

  it("shows the correct photo tip with dynamic count", () => {
    const profile: VendorForScoring = {
      ...completeProfile,
      photoCount: 1,
    };
    const tips = getCoachingTips(profile);
    const photoTip = tips.find((t) => t.key === "photos");
    expect(photoTip?.message).toBe("Add 2 more photos of your work to stand out.");
  });

  it("surfaces next tips as earlier gaps are fixed", () => {
    const profile: VendorForScoring = {
      ...emptyProfile,
      chStatus: "verified",    // fix gap 1
      warrantyMonths: 24,      // fix gap 2
      photoCount: 5,           // fix gap 3
    };
    const tips = getCoachingTips(profile);
    // Now the next 3 should surface: trades (12), serviceAreas (10), supportingDocs (8)
    expect(tips[0].key).toBe("trades");
    expect(tips[1].key).toBe("serviceAreas");
    expect(tips[2].key).toBe("supportingDocs");
  });

  it("handles string-format service areas and trades", () => {
    const profile: VendorForScoring = {
      ...emptyProfile,
      chStatus: "verified",
      warrantyMonths: 36,
      photoCount: 5,
      trades: "Plumber,Gas Engineer,Bathroom Fitter" as any,
      serviceAreas: "E4,E17" as any, // only 2 — still a gap
    };
    const tips = getCoachingTips(profile);
    expect(tips.some((t) => t.key === "serviceAreas")).toBe(true);
    expect(tips.some((t) => t.key === "trades")).toBe(false);
  });

  it("each tip includes key, points, and message", () => {
    const tips = getCoachingTips(emptyProfile);
    for (const tip of tips) {
      expect(tip.key).toBeTruthy();
      expect(tip.points).toBeGreaterThan(0);
      expect(tip.message).toBeTruthy();
    }
  });

  it("surfaces a tip when the website is set but verification failed", () => {
    // Otherwise-complete profile with a website that the server
    // couldn't confirm (verifyWebPresence returned verified=false on
    // save - e.g. company name not on the page).
    const profile: VendorForScoring = {
      ...completeProfile,
      webVerified: false,
    };
    const tips = getCoachingTips(profile);
    const tip = tips.find((t) => t.key === "websiteUnverified");
    expect(tip).toBeDefined();
    expect(tip?.message).toMatch(/couldn't verify/i);
  });

  it("does NOT surface the unverified-website tip when no website is set", () => {
    const profile: VendorForScoring = {
      ...completeProfile,
      websiteUrl: null,
      webVerified: false,
    };
    const tips = getCoachingTips(profile);
    expect(tips.some((t) => t.key === "websiteUnverified")).toBe(false);
  });
});
