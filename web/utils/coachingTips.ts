import type { VendorForScoring } from "./vendorScoring";

export type CoachingTip = {
  key: string;
  points: number;
  message: string;
};

// Gap rules sorted by point value (highest impact first).
// Each rule checks a condition and returns a tip message if the gap exists.
const GAP_RULES: Array<{
  key: string;
  points: number;
  check: (p: VendorForScoring) => boolean;
  message: (p: VendorForScoring) => string;
}> = [
  {
    key: "companiesHouse",
    points: 22,
    check: (p) => (p.chStatus || "").toLowerCase() !== "verified",
    message: () => "Verify your company with Companies House to build trust.",
  },
  {
    key: "warranty",
    points: 16,
    check: (p) => !p.warrantyMonths || p.warrantyMonths <= 0,
    message: () => "Add your warranty terms — homeowners value guarantees.",
  },
  {
    key: "photos",
    points: 12,
    check: (p) => (p.photoCount ?? 0) < 3,
    message: (p) => {
      const have = p.photoCount ?? 0;
      const need = 3 - have;
      return `Add ${need} more photo${need === 1 ? "" : "s"} of your work to stand out.`;
    },
  },
  {
    key: "trades",
    points: 12,
    check: (p) => {
      const arr = Array.isArray(p.trades) ? p.trades : (p.trades || "").toString().split(",").filter(Boolean);
      return arr.length < 3;
    },
    message: () => "List at least 3 trade types so homeowners can find you.",
  },
  {
    key: "serviceAreas",
    points: 10,
    check: (p) => {
      const arr = Array.isArray(p.serviceAreas) ? p.serviceAreas : (p.serviceAreas || "").toString().split(",").filter(Boolean);
      return arr.length < 3;
    },
    message: () => "Add more service areas to appear in more searches.",
  },
  {
    key: "supportingDocs",
    points: 8,
    check: (p) => (p.supportingDocCount ?? 0) < 2,
    message: () => "Upload insurance or qualification documents.",
  },
  {
    // Fires when the trader supplied a website but the server couldn't
    // confirm it (verifyWebPresence returned verified=false, e.g.
    // brand_mismatch / parked_or_placeholder). Surfaces ahead of the
    // generic "no web presence" tip because the gap is more actionable -
    // they've already tried, they just need to make their name visible
    // on the page or use a domain that matches.
    key: "websiteUnverified",
    points: 7,
    check: (p) => {
      const hasUrl = !!(p.websiteUrl || "").trim();
      const verified = p.webVerified === true || p.webVerified === 1;
      return hasUrl && !verified;
    },
    message: () =>
      "We couldn't verify your website. Make sure your company name appears on the page so we can confirm it belongs to you.",
  },
  {
    key: "webPresence",
    points: 5,
    check: (p) => {
      const hasUrl = !!(p.websiteUrl || "").trim();
      const hasSocial = Array.isArray(p.socialLinks) ? p.socialLinks.length > 0 : !!(p.socialLinks || "").trim();
      return !hasUrl && !hasSocial;
    },
    message: () => "Add your website or social media links.",
  },
  {
    key: "discount",
    points: 5,
    check: (p) => !p.offersDiscount,
    message: () => "Consider offering a VMB member discount.",
  },
];

const MAX_TIPS = 3;

/**
 * Returns the top 3 highest-impact coaching tips for a tradesman profile.
 * Rules are pre-sorted by point value. As the user fixes gaps, the next
 * tips surface automatically.
 */
export function getCoachingTips(profile: VendorForScoring): CoachingTip[] {
  const tips: CoachingTip[] = [];

  for (const rule of GAP_RULES) {
    if (tips.length >= MAX_TIPS) break;
    if (rule.check(profile)) {
      tips.push({
        key: rule.key,
        points: rule.points,
        message: rule.message(profile),
      });
    }
  }

  return tips;
}
