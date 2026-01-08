import { PLANS } from "../config/plans";

/**
 * Types derived directly from new PLANS structure
 */
export type Plan = typeof PLANS.plans[number];
export type PlanId = Plan["id"];

/**
 * Build fast lookup dictionary
 */
const byId: Record<PlanId, Plan> = PLANS.plans.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<PlanId, Plan>);

/**
 * Get full plan definition
 */
export function getPlan(planId?: string | null): Plan | undefined {
  if (!planId) return undefined;
  return byId[planId as PlanId];
}

/**
 * Weighting multiplier used by scoring logic
 * Free = low, Gold = high, Spotlight/unlock = middle
 *
 * (Because new config removed scoring.tiers entirely,
 *  we hard-code the tier weights for now)
 */
export function tierWeight(planId?: PlanId): number {
  switch (planId) {
    case "gold":
      return 1.0;
    case "spotlight":
      return 0.9; // visible but not ranked
    case "unlock_contact":
      return 0.8; // temporary one-off
    case "free":
    default:
      return 0.6;
  }
}

/**
 * Does a user meet plan requirements?
 */
export function isEligible(
  planId: PlanId,
  status: {
    chVerified?: boolean;
    insurance?: boolean;
  }
): boolean {
  const plan = getPlan(planId);
  if (!plan) return false;

  const needCH = plan.requirements.chVerified;
  const needIns = plan.requirements.insurance;

  const hasCH = !!status.chVerified;
  const hasIns = !!status.insurance;

  return (!needCH || hasCH) && (!needIns || hasIns);
}

/**
 * Should this plan show on owners' pages?
 */
export function showsOnOwnersPage(planId?: PlanId): boolean {
  const plan = getPlan(planId);
  if (!plan) return false;
  return !!plan.visibility.discoverable;
}

/**
 * Contact access mode:
 * free            → none
 * unlock_contact  → reveal_on_purchase
 * gold            → one_off_payment
 * spotlight       → none
 */
export function contactAccessMode(planId?: PlanId) {
  return getPlan(planId)?.contactAccess.mode ?? "none";
}

/**
 * Spotlight budget requirement:
 * Only visible for budgets ≥ 15k
 */
export function spotlightMinBudget(): number {
  return 15000;
}

/**
 * Spotlight visibility helper
 */
export function spotlightAllowed(projectBudget?: number | null): boolean {
  if (typeof projectBudget !== "number") return false;
  return projectBudget >= spotlightMinBudget();
}

/**
 * Return only plans that make sense for a given project
 * (e.g. Spotlight filtered by budget)
 */
export function availablePlansForProject(
  projectBudget?: number | null
): Plan[] {
  return PLANS.plans.filter((p) => {
    if (p.id !== "spotlight") return true;
    return spotlightAllowed(projectBudget);
  });
}

export { PLANS };
