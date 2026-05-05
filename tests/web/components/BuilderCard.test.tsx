import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BuilderCard from "@/components/project/BuilderCard";

const builder = {
  uid: "b1",
  displayName: "James H.",
  companyName: "Harrow Building Ltd",
  photoUrl: null,
  starRating: 4.8,
  reviewCount: 27,
  yearsTrading: 12,
  chVerified: true,
  whyMatch: "Covers E4 · Kitchen specialist · 12 jobs in your price band",
  tier: "recommended" as const,
  recommenderName: "Alex",
};

describe("BuilderCard", () => {
  it("renders company, stat pills, Recommendation pill, and recommender", () => {
    render(<BuilderCard builder={builder} />);
    expect(screen.getByText("Harrow Building Ltd")).toBeInTheDocument();
    expect(screen.getByText(/4\.8/)).toBeInTheDocument();
    expect(screen.getByText(/27/)).toBeInTheDocument();
    expect(screen.getByText(/12 yrs/)).toBeInTheDocument();
    expect(screen.getByText(/Verified/)).toBeInTheDocument();
    expect(screen.getByText(/Recommendation/)).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
  });

  it("shows AI match badge when tier is ai-matched", () => {
    render(<BuilderCard builder={{ ...builder, tier: "ai-matched", recommenderName: undefined }} />);
    expect(screen.getByText(/AI match/)).toBeInTheDocument();
  });

  it("singularises the years pill at 1 year", () => {
    render(<BuilderCard builder={{ ...builder, yearsTrading: 1 }} />);
    expect(screen.getByText("1 yr")).toBeInTheDocument();
  });
});
