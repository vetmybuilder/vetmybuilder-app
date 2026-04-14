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

  it("includes the 'based on your job details' caveat for deterministic ranges", () => {
    render(
      <PriceRangeBadge workType="Carpet Fitting" answers={flooringAnswers} />,
    );
    expect(
      screen.getByText(/based on your job details/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ballpark, not a quote/i)).toBeInTheDocument();
  });

  describe("AI fallback", () => {
    it("renders the classifier's price_band_estimate when no deterministic range is available", () => {
      render(
        <PriceRangeBadge
          workType="Tumble Dryer Installation" // non-spec work type
          answers={null}
          fallback="£1,695-£2,895"
        />,
      );
      expect(screen.getByTestId("price-range-badge")).toBeInTheDocument();
      expect(screen.getByTestId("price-range-value")).toHaveTextContent(
        "£1,695-£2,895",
      );
    });

    it("uses the AI-source caveat copy when rendering the fallback", () => {
      render(
        <PriceRangeBadge
          workType="Tumble Dryer Installation"
          answers={null}
          fallback="£1,200-£2,000"
        />,
      );
      expect(screen.getByText(/ai reading of your description/i)).toBeInTheDocument();
    });

    it("prefers the deterministic range over the fallback when both are present", () => {
      render(
        <PriceRangeBadge
          workType="Carpet Fitting"
          answers={flooringAnswers}
          fallback="£9,999-£99,999"
        />,
      );
      // The deterministic value wins — fallback string must not appear
      expect(screen.getByTestId("price-range-value").textContent).toMatch(
        /£\d[\d,]*–£\d[\d,]*/,
      );
      expect(
        screen.queryByText(/£9,999-£99,999/),
      ).not.toBeInTheDocument();
    });

    it("renders nothing when neither deterministic range nor fallback is available", () => {
      const { container } = render(
        <PriceRangeBadge
          workType="Tumble Dryer Installation"
          answers={null}
          fallback={null}
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("treats an empty/whitespace fallback string as no fallback", () => {
      const { container } = render(
        <PriceRangeBadge
          workType="Tumble Dryer Installation"
          answers={null}
          fallback="   "
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
