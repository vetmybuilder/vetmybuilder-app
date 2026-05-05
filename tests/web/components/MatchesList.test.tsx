import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MatchesList from "@/components/project/MatchesList";

const matches = [
  { matchId: "m1", builderFirstName: "Mike", companyName: "BP",
    trades: ["Building"], source: "recommended" as const, status: "new" as const, whyMatch: "Free contact" },
  { matchId: "m2", builderFirstName: "James", companyName: "Harrow",
    trades: ["Building"], source: "ai-matched" as const, status: "new" as const, whyMatch: "Area + trade" },
  { matchId: "m3", builderFirstName: "Alan", companyName: "Lister",
    trades: ["Roofing"], source: "ai-matched" as const, status: "contacted" as const, whyMatch: "Area" },
];

describe("MatchesList", () => {
  it("shows new tab by default, grouped by source", () => {
    render(<MatchesList projectTitle="Kitchen" matches={matches} onOpen={() => {}} />);
    expect(screen.getByText(/Recommended by your network/)).toBeInTheDocument();
    expect(screen.getByText(/AI-matched/)).toBeInTheDocument();
    expect(screen.getByText("Mike")).toBeInTheDocument();
    expect(screen.getByText("James")).toBeInTheDocument();
    expect(screen.queryByText("Alan")).not.toBeInTheDocument();
  });

  it("switches to Contacted tab", () => {
    render(<MatchesList projectTitle="Kitchen" matches={matches} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Contacted/ }));
    expect(screen.getByText("Alan")).toBeInTheDocument();
    expect(screen.queryByText("James")).not.toBeInTheDocument();
  });

  it("shows empty copy when no new matches", () => {
    render(<MatchesList projectTitle="K" matches={[]} onOpen={() => {}} />);
    expect(screen.getByText(/No new matches yet/i)).toBeInTheDocument();
  });
});
