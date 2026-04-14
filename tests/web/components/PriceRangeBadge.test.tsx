import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Hoisted mock so the helper returns a controllable value per test.
vi.mock("../../../web/utils/featureFlags", () => ({
  isProjectPriceRangeEnabled: vi.fn(() => true),
}));

import PriceRangeBadge from "../../../web/components/project/PriceRangeBadge";
import { isProjectPriceRangeEnabled } from "../../../web/utils/featureFlags";

const flooringAnswers = {
  _version: 1,
  flooring: {
    size: { kind: "m2" as const, value: 50 },
    floor_type: "carpet" as const,
  },
};

describe("<PriceRangeBadge />", () => {
  beforeEach(() => {
    (isProjectPriceRangeEnabled as any).mockReturnValue(true);
  });

  it("renders a formatted cost range for a flooring project", () => {
    render(
      <PriceRangeBadge workType="Carpet Fitting" answers={flooringAnswers} />,
    );
    expect(screen.getByTestId("price-range-badge")).toBeInTheDocument();
    const value = screen.getByTestId("price-range-value").textContent || "";
    expect(value).toMatch(/£\d[\d,]*–£\d[\d,]*/);
  });

  it("parses answers when passed as a JSON string", () => {
    render(
      <PriceRangeBadge
        workType="Carpet Fitting"
        answers={JSON.stringify(flooringAnswers)}
      />,
    );
    expect(screen.getByTestId("price-range-badge")).toBeInTheDocument();
  });

  it("renders nothing when the feature flag is off", () => {
    (isProjectPriceRangeEnabled as any).mockReturnValue(false);
    const { container } = render(
      <PriceRangeBadge workType="Carpet Fitting" answers={flooringAnswers} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the work type doesn't match a spec", () => {
    const { container } = render(
      <PriceRangeBadge
        workType="Tumble Dryer Installation"
        answers={flooringAnswers}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when answers are null or missing", () => {
    const { container: c1 } = render(
      <PriceRangeBadge workType="Carpet Fitting" answers={null} />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <PriceRangeBadge workType="Carpet Fitting" answers={undefined} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("renders nothing when required answers are missing (priceModel returns null)", () => {
    const { container } = render(
      <PriceRangeBadge
        workType="Carpet Fitting"
        answers={{ _version: 1, flooring: { floor_type: "carpet" } }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("includes the ballpark-not-a-quote caveat copy", () => {
    render(
      <PriceRangeBadge workType="Carpet Fitting" answers={flooringAnswers} />,
    );
    expect(
      screen.getByText(/ballpark, not a quote/i),
    ).toBeInTheDocument();
  });
});
