// shared/lib/plans.ts
import { PLANS } from "../config/plans";

export type PlanId = (typeof PLANS.plans)[number]["id"];
export type Plan = (typeof PLANS.plans)[number];

const byId: Record<PlanId, Plan> = PLANS.plans.reduce((acc, p) => {
  acc[p.id] = p as Plan;
  return acc;
}, {} as Record<PlanId, Plan>);

export function getPlan(planId?: string | null): Plan | undefined {
  if (!planId) return undefined;
  return byId[planId as PlanId];
}

export function tierWeight(planId?: PlanId): number {
  const key = (getPlan(planId)?.ranking.weightMultiplierKey ??
    "free") as keyof typeof PLANS.scoring.tiers;
  return PLANS.scoring.tiers[key] ?? 1.0;
}

/**
 * Basic eligibility check for CH / Google / insurance.
 */
export function isEligible(
  planId: PlanId,
  status: {
    companiesHouseVerified?: boolean;
    googleVerified?: boolean;
    hasValidInsurance?: boolean;
  }
): boolean {
  const plan = getPlan(planId);
  if (!plan) return false;

  const needCH = !!plan.eligibility.requiresCompaniesHouseVerification;
  const needG = !!plan.eligibility.requiresGoogleVerification;
  const needIns = !!plan.eligibility.requiresValidInsurance;

  const hasCH = !!status.companiesHouseVerified;
  const hasG = !!status.googleVerified;
  const hasIns = !!status.hasValidInsurance;

  return (!needCH || hasCH) && (!needG || hasG) && (!needIns || hasIns);
}

/**
 * Visibility helpers
 */
export function showsOnOwnersPage(planId?: PlanId): boolean {
  const plan = getPlan(planId);
  return !!plan?.visibility.showOnOwnersPage;
}
export function contactAccessMode(planId?: PlanId) {
  return getPlan(planId)?.contact_access.mode ?? "hidden";
}

/**
 * Guard to block actions if not eligible. Throw with helpful message.
 */
export function assertEligibleOrThrow(
  planId: PlanId,
  status: {
    companiesHouseVerified?: boolean;
    googleVerified?: boolean;
    hasValidInsurance?: boolean;
  }
) {
  if (!isEligible(planId, status)) {
    const plan = getPlan(planId)!;
    const reqs: string[] = [];
    if (plan.eligibility.requiresCompaniesHouseVerification)
      reqs.push("Companies House verification");
    if (plan.eligibility.requiresGoogleVerification)
      reqs.push("Google verification");
    if (plan.eligibility.requiresValidInsurance) reqs.push("valid insurance");
    const reqText = reqs.join(", ");
    throw new Error(`Not eligible for ${plan.name}. Required: ${reqText}.`);
  }
}

/** Narrowing helper for optional minProjectBudget on visibility */
function getMinProjectBudget(plan: Plan): number | undefined {
  // Use an in-check to keep TS happy across the union type
  const vis: unknown = plan.visibility;
  if (
    vis &&
    typeof vis === "object" &&
    "minProjectBudget" in (vis as Record<string, unknown>) &&
    typeof (vis as Record<string, unknown>).minProjectBudget === "number"
  ) {
    return (vis as { minProjectBudget: number }).minProjectBudget;
  }
  return undefined;
}

/**
 * Can this plan appear for a given project budget?
 * e.g. Spotlight requires projectBudget >= minProjectBudget (15,000).
 */
export function visibleForProjectBudget(
  planId: PlanId,
  projectBudget?: number | null
): boolean {
  const plan = getPlan(planId);
  if (!plan) return false;

  const min = getMinProjectBudget(plan);
  if (typeof min === "number") {
    // If caller didn't pass a number, treat as not visible for safety.
    if (typeof projectBudget !== "number") return false;
    return projectBudget >= min;
  }
  return true; // no minimum -> visible everywhere
}

/** Return all plans visible for a given project budget. */
export function availablePlansForProject(
  projectBudget?: number | null
): Plan[] {
  return PLANS.plans.filter((p) =>
    visibleForProjectBudget(p.id as PlanId, projectBudget)
  );
}

export { PLANS };
