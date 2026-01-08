// shared/config/plans.js

const PLANS = {
  version: "2.0.0",
  currency: "GBP",

  plans: [
    {
      id: "free",
      type: "subscription",
      name: "Free / Basic",
      slug: "free",
      priceMonthly: 0,
      priceAnnual: 0,
      isOneOff: false,
      showInPlanModal: true,
      planOrder: 1,
      visibility: {
        discoverable: false,
        ranked: false,
      },
      contactAccess: { mode: "none" },
      requirements: { chVerified: false, insurance: false },
      features: ["Share your profile to homeowners", "Basic presence"],
    },

    {
      id: "unlock_contact",
      type: "one_off",
      slug: "unlock-contact",
      name: "Unlock Contact",
      priceOnce: 9.99,
      durationDays: null,
      isOneOff: true,
      showInPlanModal: true,
      planOrder: 2,
      visibility: { discoverable: false, ranked: false },
      contactAccess: {
        mode: "reveal_on_purchase",
        description: "Unlock contact details for this project only.",
      },
      requirements: { chVerified: false, insurance: true },
      features: [
        "One-off purchase for a single project",
        "Instant reveal of owner’s contact details",
        "Works with any plan",
      ],
    },

    {
      id: "gold",
      type: "subscription",
      slug: "gold",
      name: "Gold",
      priceMonthly: 29,
      priceAnnual: 290,
      isOneOff: false,
      showInPlanModal: true,
      planOrder: 3,
      visibility: { discoverable: true, ranked: true },
      contactAccess: { mode: "one_off_payment", price: 9.99 },
      requirements: { chVerified: true, insurance: true },
      features: [
        "Full visibility across the site",
        "Ranked against other trades",
        "Can contact homeowners after sharing profile",
      ],
    },

    {
      id: "spotlight",
      type: "one_off",
      slug: "spotlight",
      name: "Spotlight",
      priceOnce: 39.99,
      durationDays: 30,
      isOneOff: true,
      showInPlanModal: true,
      planOrder: 4,
      visibility: { discoverable: true, ranked: false },
      contactAccess: { mode: "none" },
      requirements: { chVerified: true, insurance: true },
      features: [
        "Featured placement for homeowners",
        "Prominent profile highlight",
        "Ideal for £15k+ serious jobs",
      ],
    },
  ],
};

module.exports = { PLANS };
