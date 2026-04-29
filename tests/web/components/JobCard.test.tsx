// tests/web/components/JobCard.test.tsx
//
// Smoke tests for the JobCard budget-cell priority logic:
//   1. deterministic range (computeProjectPriceRange) wins
//   2. AI price_band_estimate fallback
//   3. legacy budget string
//   4. — when nothing is available
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import JobCard, { type JobCardData } from "@/components/tradesmen/JobCard";

const BASE: JobCardData = {
  projectId: 1,
  title: "Kitchen Refurb",
  type: "Carpet Fitting",
  location: "E4 8AB",
  description: "Full kitchen refurb",
  trades: ["Carpet Fitting"],
  matchedTrades: [],
  postedAt: new Date().toISOString(),
};

// Flooring answers that satisfy the carpet priceModel (50 m²).
const FLOORING_ANSWERS = {
  _version: 1,
  flooring: {
    size: { kind: "m2" as const, value: 50 },
    floor_type: "carpet" as const,
  },
};

function getBudgetCell(container: HTMLElement): string {
  // The Budget label is rendered in a StatCell; its sibling div above it
  // holds the value. Query by finding all text content under .text-center divs.
  const cells = container.querySelectorAll(".text-center");
  for (const cell of cells) {
    const label = cell.querySelector(".uppercase");
    if (label?.textContent?.trim().toLowerCase() === "budget") {
      const value = cell.querySelector(".font-extrabold, .text-emerald-600");
      return value?.textContent?.trim() ?? "";
    }
  }
  return "";
}

describe("JobCard budget-cell priority", () => {
  it("Priority 1: shows deterministic range when answersJson matches a spec", () => {
    const { container } = render(
      <JobCard
        data={{
          ...BASE,
          answersJson: FLOORING_ANSWERS,
          priceBandEstimate: "£9,999–£99,999",
          budget: "£5k–£15k",
        }}
      />,
    );
    const value = getBudgetCell(container);
    // Deterministic range should be a formatted £x–£y, not the AI string
    expect(value).toMatch(/^£[\d,]+–£[\d,]+$/);
    expect(value).not.toContain("£9,999");
    expect(value).not.toBe("£5k–£15k");
  });

  it("Priority 2: shows priceBandEstimate when no deterministic range available", () => {
    const { container } = render(
      <JobCard
        data={{
          ...BASE,
          type: "Unknown Trade",
          answersJson: null,
          priceBandEstimate: "£5,000–£15,000",
          budget: "£5k–£15k",
        }}
      />,
    );
    const value = getBudgetCell(container);
    expect(value).toBe("£5,000–£15,000");
  });

  it("Priority 3: shows legacy budget when no range or AI estimate", () => {
    const { container } = render(
      <JobCard
        data={{
          ...BASE,
          type: "Unknown Trade",
          answersJson: null,
          priceBandEstimate: null,
          budget: "£5k–£15k",
        }}
      />,
    );
    const value = getBudgetCell(container);
    expect(value).toBe("£5k–£15k");
  });

  it("Priority 4: shows — when nothing is available", () => {
    const { container } = render(
      <JobCard
        data={{
          ...BASE,
          type: "Unknown Trade",
          answersJson: null,
          priceBandEstimate: null,
          budget: null,
        }}
      />,
    );
    const value = getBudgetCell(container);
    expect(value).toBe("—");
  });
});
