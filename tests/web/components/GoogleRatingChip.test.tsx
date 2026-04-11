import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import React from "react";
import { GoogleRatingChip } from "../../../web/components/GoogleRatingChip";

describe("<GoogleRatingChip />", () => {
  it("renders the Google rating when rating is provided", () => {
    render(<GoogleRatingChip rating={4.8} count={25} placeId="ChIJ123" />);

    const chip = screen.getByTestId("builder-google-rating");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("4.8");
    expect(chip).toHaveTextContent("25 Google reviews");
  });

  it("links to Google Maps when placeId is provided", () => {
    render(<GoogleRatingChip rating={5.0} count={10} placeId="ChIJ123" />);

    const chip = screen.getByTestId("builder-google-rating");
    expect(chip.tagName).toBe("A");
    expect(chip).toHaveAttribute(
      "href",
      "https://www.google.com/maps/place/?q=place_id:ChIJ123",
    );
    expect(chip).toHaveAttribute("target", "_blank");
  });

  it("renders as a span (not a link) when placeId is missing", () => {
    render(<GoogleRatingChip rating={4.0} count={5} />);

    const chip = screen.getByTestId("builder-google-rating");
    expect(chip.tagName).toBe("SPAN");
  });

  it("does not render when rating is null", () => {
    render(<GoogleRatingChip rating={null} count={10} placeId="ChIJ123" />);

    expect(screen.queryByTestId("builder-google-rating")).not.toBeInTheDocument();
  });

  it("does not render when rating is undefined", () => {
    render(<GoogleRatingChip count={10} />);

    expect(screen.queryByTestId("builder-google-rating")).not.toBeInTheDocument();
  });

  it("renders without review count when count is null", () => {
    render(<GoogleRatingChip rating={3.5} />);

    const chip = screen.getByTestId("builder-google-rating");
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("3.5");
    expect(chip).not.toHaveTextContent("Google review");
  });

  it("shows correct star count", () => {
    render(<GoogleRatingChip rating={4.0} />);

    const chip = screen.getByTestId("builder-google-rating");
    // 4 full stars + 1 empty
    expect(chip).toHaveTextContent("★★★★☆");
  });
});
