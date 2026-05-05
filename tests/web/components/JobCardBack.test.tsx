// tests/web/components/JobCardBack.test.tsx
//
// Back face of a tradesman swipe-deck card, revealed when the eye
// button is tapped. Pure presentational.

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import JobCardBack from "@/components/tradesmen/JobCardBack";
import type { JobCardData } from "@/components/tradesmen/JobCard";

const baseJob: JobCardData = {
  projectId: 7,
  title: "Loft conversion - dormer with en-suite",
  type: "Loft Conversion",
  location: "E4",
  budget: "£60k+",
  propertyType: "Semi-detached",
  bedrooms: 3,
  description: "4m rear extension off the kitchen.",
  trades: ["Loft Conversion", "Plumbing"],
  matchedTrades: ["Loft Conversion"],
  postedAt: "2026-05-04T10:00:00Z",
  aiScore: 87,
};

describe("<JobCardBack />", () => {
  it("renders title, type, and location in the hero", () => {
    render(<JobCardBack data={baseJob} />);
    expect(screen.getByText(baseJob.title)).toBeInTheDocument();
    expect(screen.getByText("Loft Conversion")).toBeInTheDocument();
    expect(screen.getByText("E4")).toBeInTheDocument();
  });

  it("surfaces the AI summary + key concerns when present", () => {
    render(
      <JobCardBack
        data={{
          ...baseJob,
          aiSummary: "Homeowner wants a dormer loft with en-suite.",
          aiKeyConcerns: ["minimise disruption", "watertight finish"],
        }}
      />,
    );
    expect(
      screen.getByTestId("job-card-ai-summary"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Homeowner wants a dormer loft/),
    ).toBeInTheDocument();
    expect(screen.getByText("minimise disruption")).toBeInTheDocument();
    expect(screen.getByText("watertight finish")).toBeInTheDocument();
  });

  it("omits the AI summary block when aiSummary is null/missing", () => {
    render(<JobCardBack data={baseJob} />);
    expect(
      screen.queryByTestId("job-card-ai-summary"),
    ).not.toBeInTheDocument();
  });

  it("renders Property and Posted pills in the Job details row", () => {
    render(<JobCardBack data={baseJob} />);
    // Property combines bedrooms + propertyType
    expect(screen.getByText("3-bed Semi-detached")).toBeInTheDocument();
    // Posted shows a relative time string (exact value depends on date,
    // we just check the label is rendered)
    expect(screen.getByText("Posted:")).toBeInTheDocument();
  });

  it("appends a checkmark to matched trades only", () => {
    render(<JobCardBack data={baseJob} />);
    expect(screen.getByText("Loft Conversion ✓")).toBeInTheDocument();
    expect(screen.getByText("Plumbing")).toBeInTheDocument();
    expect(screen.queryByText("Plumbing ✓")).not.toBeInTheDocument();
  });
});
