export declare const PLANS: {
  version: string;
  currency: string;
  plans: Array<{
    id: string;
    type: string;
    name: string;
    slug: string;
    priceMonthly?: number;
    priceAnnual?: number;
    priceOnce?: number;
    durationDays?: number | null;
    isOneOff: boolean;
    showInPlanModal: boolean;
    planOrder: number;
    visibility: { discoverable: boolean; ranked: boolean };
    contactAccess: { mode: string; description?: string; price?: number };
    requirements: { chVerified: boolean; insurance: boolean };
    features: string[];
  }>;
};
