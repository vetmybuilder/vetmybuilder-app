export const PLANS = {
  version: "1.3.0",
  currency: "GBP",
  scoring: {
    base_weight_multiplier: 1.0,
    tiers: { free: 0.75, gold: 1.0, platinum: 1.2 },
  },
  plans: [
    {
      id: "free",
      name: "Free / Basic",
      slug: "free",
      billing: { type: "free", priceMonthly: 0, priceAnnual: 0 },
      eligibility: {
        requiresCompaniesHouseVerification: false,
        requiresGoogleVerification: false,
        requiresValidInsurance: false,
      },
      ranking: {
        weightMultiplierKey: "free",
        rankHint: "Ranked bottom; less weight if not verified",
      },
      visibility: { showOnOwnersPage: false, showInDiscover: true },
      contact_access: {
        mode: "hidden",
        description: "Contact details are not shown by default",
      },
      cta: {
        primary: "Upgrade to reach more homeowners",
        secondary: "Complete verification to improve ranking",
      },
      features: [
        "Eligible for scoring logic (reduced weight if unverified)",
        "Appear in Discover searches",
        "Profile can be shared with owners (no auto contact reveal)",
      ],
      notes: "No verification required; appears but ranks lower.",
    },

    /* ========= UNLOCK CONTACT: one-off, per-project ========= */
    {
      id: "unlock_contact",
      name: "Unlock Contact",
      slug: "unlock-contact",
      billing: {
        type: "one_off",
        priceOnce: 9.99, // £9.99 one-time
        // no duration; entitlement is “see owner contact on this project”
      },
      eligibility: {
        requiresCompaniesHouseVerification: false,
        requiresGoogleVerification: false,
        requiresValidInsurance: true, // requirement per your spec
      },
      ranking: {
        weightMultiplierKey: "gold",
        rankHint: "No ranking change; grants contact visibility",
      },
      visibility: { showOnOwnersPage: false, showInDiscover: false },
      contact_access: {
        mode: "auto_after_share",
        description:
          "Purchasing this unlock reveals the project owner's contact details.",
      },
      cta: {
        primary: "See owner contact details",
        secondary: "Valid insurance required",
      },
      features: [
        "One-off payment to reveal owner's contact details",
        "Works with your current plan",
        "No subscription — pay as you go",
      ],
      notes:
        "Entitlement is scoped per project/owner; system you already have handles the reveal.",
    },

    /* ========= SPOTLIGHT: one-off, 1 month ========= */
    {
      id: "spotlight",
      name: "Spotlight",
      slug: "spotlight",
      billing: { type: "one_off", priceOnce: 39.99, durationDays: 30 },
      eligibility: {
        requiresCompaniesHouseVerification: true,
        requiresGoogleVerification: false,
        requiresValidInsurance: true,
      },
      ranking: {
        weightMultiplierKey: "gold",
        rankHint: "Featured placement for ~1 month",
      },
      visibility: {
        showOnOwnersPage: true,
        showInDiscover: true,
        minProjectBudget: 15000, // only for projects £15k+
      },
      contact_access: {
        mode: "hidden",
        description: "Promotional placement; standard contact rules apply.",
      },
      cta: {
        primary: "Get featured to serious owners",
        secondary: "Showcase photos, badges and wins",
      },
      features: [
        "Prominent placement on owners’ Featured list",
        "Hero photo gallery & trust badges",
        "Drives enquiries on £15k+ projects",
      ],
      notes: "One-off purchase; expires automatically after ~1 month.",
    },

    {
      id: "gold",
      name: "Gold",
      slug: "gold",
      billing: {
        type: "subscription",
        priceMonthly: 29,
        priceAnnual: 290,
        trialDays: 0,
      },
      eligibility: {
        requiresCompaniesHouseVerification: true,
        requiresGoogleVerification: false,
        requiresValidInsurance: true,
      },
      ranking: {
        weightMultiplierKey: "gold",
        rankHint: "Ranked per scoring logic (mid/high)",
      },
      visibility: { showOnOwnersPage: true, showInDiscover: true },
      contact_access: {
        mode: "one_off_payment",
        price: 999, // £9.99 per contact unlock (legacy path; still supported)
        currency: "GBP",
        description:
          "After sending profile to owner, offer a one-off payment to unlock owner contact details.",
      },
      cta: {
        primary: "Send profile to project owners",
        secondary: "Unlock contact details with one-off payment",
      },
      features: [
        "Displayed on project owners page",
        "Ranked by scoring logic",
        "Option to purchase single-contact access after sharing profile",
        "Verification badge for Companies House + Insurance",
      ],
      notes: "Must pass CH verification and provide valid insurance.",
    },
  ],
  verification_badges: {
    companiesHouse: { key: "ch", label: "Companies House Verified" },
    google: { key: "gmb", label: "Google Verified" },
    insurance: { key: "ins", label: "Valid Insurance" },
  },
  contact_access_modes: {
    hidden: "No contact details shown by default.",
    one_off_payment: "Offer a single-payment unlock after profile share.",
    auto_after_share: "Auto-reveal contact details after profile share.",
  },
} as const;

export type PlansConfig = typeof PLANS;
