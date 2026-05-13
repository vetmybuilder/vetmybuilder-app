import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// useRecentCompleted hits /api/tradesmen/:uid/recent-completed under
// the hood. Mock it so the front-card chip can be asserted in both
// states without spinning up an API.
const useRecentCompletedMock = vi.fn();
vi.mock("@/hooks/useRecentCompleted", () => ({
  useRecentCompleted: (uid: string | null | undefined) =>
    useRecentCompletedMock(uid),
}));

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

function mockHook(
  topTradesperson: boolean,
  items: Array<{
    projectType: string | null;
    area: string | null;
    closedAt: string | null;
    photos: string[];
  }> = [],
) {
  useRecentCompletedMock.mockReturnValue({
    loading: false,
    topTradesperson,
    items,
  });
}

describe("BuilderCard", () => {
  it("renders company, stat pills, Recommendation pill, and recommender", () => {
    mockHook(false);
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
    mockHook(false);
    render(<BuilderCard builder={{ ...builder, tier: "ai-matched", recommenderName: undefined }} />);
    expect(screen.getByText(/AI match/)).toBeInTheDocument();
  });

  it("singularises the years pill at 1 year", () => {
    mockHook(false);
    render(<BuilderCard builder={{ ...builder, yearsTrading: 1 }} />);
    expect(screen.getByText("1 yr")).toBeInTheDocument();
  });

  it("renders the Top tradesperson chip when the hook reports topTradesperson=true", () => {
    mockHook(true, [
      { projectType: "Bathroom", area: "E4", closedAt: null, photos: [] },
    ]);
    render(
      <BuilderCard builder={{ ...builder, tier: "ai-matched", recommenderName: undefined }} />,
    );
    expect(screen.getByTestId("card-top-tradesperson")).toBeInTheDocument();
    expect(screen.getByText(/Top tradesperson/)).toBeInTheDocument();
  });

  it("hides the Top tradesperson chip when topTradesperson=false", () => {
    mockHook(false);
    render(
      <BuilderCard builder={{ ...builder, tier: "ai-matched", recommenderName: undefined }} />,
    );
    expect(screen.queryByTestId("card-top-tradesperson")).not.toBeInTheDocument();
  });
});
