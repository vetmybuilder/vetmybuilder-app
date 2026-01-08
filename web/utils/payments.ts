// web/utils/payments.ts
export type Money = { amount: number; currency: string };
export type CheckoutItem = { label: string; price: Money; quantity?: number };

export type CheckoutSession = {
  id: string;
  status: "open" | "paid" | "canceled" | "expired";
  userId: string;
  planId?: string;
  items: CheckoutItem[];
  total: Money;
  hosted_url: string;
  success_url: string;
  cancel_url: string;
  createdAt: string;
  updatedAt: string;
};

type CreatePlanCheckoutInput = {
  planId: "free" | "gold" | "platinum";
  /** Minor units (e.g. 100 = £1.00) since PLANS have TBD pricing in dev */
  amountMinor?: number;
  currency?: string; // default "GBP"
  success_url?: string;
  cancel_url?: string;
  metadata?: Record<string, any>;
  ttlSeconds?: number;
};

type CreateItemsCheckoutInput = {
  items: CheckoutItem[];
  success_url?: string;
  cancel_url?: string;
  metadata?: Record<string, any>;
  ttlSeconds?: number;
};

export async function createPlanCheckout(
  input: CreatePlanCheckoutInput
): Promise<CheckoutSession> {
  const res = await fetch("/api/payments/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      planId: input.planId,
      amountMinor: input.amountMinor ?? 100, // £1.00 default for mock
      currency: input.currency ?? "GBP",
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      metadata: input.metadata,
      ttlSeconds: input.ttlSeconds,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      json?.error || `Failed to create checkout (HTTP ${res.status})`
    );
  return json.session as CheckoutSession;
}

export async function createItemsCheckout(
  input: CreateItemsCheckoutInput
): Promise<CheckoutSession> {
  const res = await fetch("/api/payments/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      json?.error || `Failed to create checkout (HTTP ${res.status})`
    );
  return json.session as CheckoutSession;
}

/**
 * Fire-and-go helper: creates a checkout for a plan and navigates to hosted_url.
 * Pass in a Next.js router (useRouter()).
 */
export async function goToHostedCheckoutForPlan(
  router: { push: (url: string) => any },
  planId: "free" | "gold" | "platinum",
  opts?: Omit<CreatePlanCheckoutInput, "planId">
) {
  const session = await createPlanCheckout({ planId, ...(opts || {}) });
  await router.push(
    session.hosted_url || `/payments/mock/checkout/${session.id}`
  );
  return session;
}

/**
 * Same but for arbitrary items (e.g., one-off unlocks).
 */
export async function goToHostedCheckoutForItems(
  router: { push: (url: string) => any },
  items: CheckoutItem[],
  opts?: Omit<CreateItemsCheckoutInput, "items">
) {
  const session = await createItemsCheckout({ items, ...(opts || {}) });
  await router.push(
    session.hosted_url || `/payments/mock/checkout/${session.id}`
  );
  return session;
}
