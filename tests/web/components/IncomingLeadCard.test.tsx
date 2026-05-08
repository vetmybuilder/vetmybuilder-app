// tests/web/components/IncomingLeadCard.test.tsx
//
// Front face of a tradesman incoming-lead card. Pure presentational.

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import IncomingLeadCard, {
  type IncomingLead,
} from "@/components/project/IncomingLeadCard";

const baseLead: IncomingLead = {
  matchId: "m1",
  projectId: "p1",
  title: "Kitchen extension with bifolds",
  budget: "£15k–£25k",
  outward: "E4",
  startWindow: "1 month",
  description: "4m rear extension off the kitchen.",
  trades: ["Building", "Electrics"],
  source: "recommended",
  recommenderName: "Alex",
  pickedHoursAgo: 2,
};

describe("<IncomingLeadCard />", () => {
  it("renders title, summary pills, description, and trades", () => {
    render(<IncomingLeadCard lead={baseLead} />);
    expect(screen.getByText(baseLead.title)).toBeInTheDocument();
    expect(screen.getByText("£15k–£25k")).toBeInTheDocument();
    expect(screen.getByText("E4")).toBeInTheDocument();
    expect(screen.getByText("1 month")).toBeInTheDocument();
    expect(
      screen.getByText("4m rear extension off the kitchen."),
    ).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Electrics")).toBeInTheDocument();
    // "picked you" hours-ago caption - exact phrasing varies (e.g.
    // "2 hours ago", "1 day ago"), so match on the prefix.
    expect(screen.getByText(/picked you/i)).toBeInTheDocument();
  });

  it("shows the recommender attribution for recommended-source leads", () => {
    render(<IncomingLeadCard lead={baseLead} />);
    expect(screen.getByText(/recommended by alex/i)).toBeInTheDocument();
  });

  it("falls back to a generic network label when recommenderName is missing", () => {
    render(
      <IncomingLeadCard lead={{ ...baseLead, recommenderName: undefined }} />,
    );
    expect(screen.getByText(/recommended by your network/i)).toBeInTheDocument();
  });

  it("hides the recommender attribution for subscribed-source leads", () => {
    render(
      <IncomingLeadCard lead={{ ...baseLead, source: "subscribed" }} />,
    );
    expect(screen.queryByText(/recommended by/i)).not.toBeInTheDocument();
  });
});
