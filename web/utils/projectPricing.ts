// web/utils/projectPricing.ts
//
// Thin wrapper around the spec's priceModel that both the PriceRangeBadge
// and project views use — so "should we render the deterministic range?"
// and "should we hide the classifier's freeform price_band_estimate?" are
// answered by the same predicate.

import {
  getSpecForSelection,
  type PriceRange,
} from "@/config/jobFields";
import { isProjectPriceRangeEnabled } from "./featureFlags";

function parseAnswersJson(raw: unknown): Record<string, any> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as Record<string, any>;
  return null;
}

/**
 * Returns a deterministic typical-cost range for the project, or null when:
 * - the work type doesn't match a spec with a priceModel,
 * - answers are missing / unparseable, or
 * - the priceModel can't produce a range from the given answers
 *   (e.g. required input missing).
 *
 * This function does NOT check the feature flag — use
 * `hasVisiblePriceRange` for "would this actually render on screen" checks.
 */
export function computeProjectPriceRange(
  workType?: string | null,
  answers?: unknown,
): PriceRange | null {
  if (!workType) return null;
  const spec = getSpecForSelection([workType]);
  if (!spec?.priceModel) return null;
  const parsed = parseAnswersJson(answers);
  if (!parsed) return null;
  return spec.priceModel(parsed);
}

/**
 * Whether the deterministic price-range badge will render on the project
 * page for these inputs. When true, views should hide the classifier's
 * freeform `price_band_estimate` line so the user sees one clear estimate.
 */
export function hasVisiblePriceRange(
  workType?: string | null,
  answers?: unknown,
): boolean {
  if (!isProjectPriceRangeEnabled()) return false;
  return computeProjectPriceRange(workType, answers) !== null;
}
