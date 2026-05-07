// tests/web/components/JobCard.test.tsx
//
// Front face of a tradesman swipe-deck card. Pure presentational -
// no fetches, no router, no SSE. The front shows only what the trade
// needs to make a swipe decision: title, location, type + AI score
// badges, and the LLM plain-English summary. The full breakdown
// (property, materials, trade chips, etc.) lives on JobCardBack.

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import JobCard, { type JobCardData } from "@/components/tradesmen/JobCard";

const baseJob: JobCardData = {
  projectId: 7,
  title: "Loft conversion - dormer with en-suite",
  type: "Loft Conversion",
  location: "E4",
  distanceMiles: 1.2,
  budget: "£60k+",
  propertyType: "Semi-detached",
  bedrooms: 3,
  description: "4m rear extension off the kitchen.",
  trades: ["Loft Conversion", "Plumbing", "Electrical"],
  matchedTrades: ["Loft Conversion"],
  postedAt: "2026-05-04T10:00:00Z",
  aiScore: 87,
  aiSummary: "Dormer loft conversion with new en-suite bathroom.",
};

describe("<JobCard />", () => {
  it("renders title, type, and distance-aware location", () => {
    render(<JobCard data={baseJob} />);
    expect(screen.getByText(baseJob.title)).toBeInTheDocument();
    expect(screen.getByText("Loft Conversion")).toBeInTheDocument();
    // Location row appends miles when distanceMiles is supplied.
    expect(screen.getByText(/E4 · 1\.2 mi away/)).toBeInTheDocument();
  });

  it("renders the AI summary when present", () => {
    render(<JobCard data={baseJob} />);
    expect(
      screen.getByText("Dormer loft conversion with new en-suite bathroom."),
    ).toBeInTheDocument();
  });

  it("hides the summary paragraph when aiSummary is missing", () => {
    render(<JobCard data={{ ...baseJob, aiSummary: null }} />);
    expect(
      screen.queryByText("Dormer loft conversion with new en-suite bathroom."),
    ).not.toBeInTheDocument();
  });

  it("shows the AI match badge when aiScore is provided", () => {
    render(<JobCard data={baseJob} />);
    expect(screen.getByText(/87% match/)).toBeInTheDocument();
  });

  it("hides the AI match badge when aiScore is null", () => {
    render(<JobCard data={{ ...baseJob, aiScore: null }} />);
    expect(screen.queryByText(/% match/)).not.toBeInTheDocument();
  });
});
