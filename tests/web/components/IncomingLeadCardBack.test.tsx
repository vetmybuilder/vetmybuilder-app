// tests/web/components/IncomingLeadCardBack.test.tsx
//
// Back face of a tradesman incoming-lead card. Pure presentational.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import IncomingLeadCardBack from "@/components/project/IncomingLeadCardBack";
import type { IncomingLead } from "@/components/project/IncomingLeadCard";

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

describe("<IncomingLeadCardBack />", () => {
  it("renders header, description, trades and 'Picked you Xh ago'", () => {
    render(<IncomingLeadCardBack lead={baseLead} />);
    expect(screen.getByText(baseLead.title)).toBeInTheDocument();
    expect(screen.getByText("Recommended by Alex")).toBeInTheDocument();
    expect(screen.getByText(/4m rear extension/)).toBeInTheDocument();
    expect(screen.getByText("Building")).toBeInTheDocument();
    expect(screen.getByText("Picked you 2h ago")).toBeInTheDocument();
    expect(screen.getByText("£15k–£25k")).toBeInTheDocument();
  });

  it("shows the View full project button and fires onViewFull when clicked", () => {
    const onViewFull = vi.fn();
    render(<IncomingLeadCardBack lead={baseLead} onViewFull={onViewFull} />);
    const btn = screen.getByRole("button", { name: /view full project/i });
    fireEvent.click(btn);
    expect(onViewFull).toHaveBeenCalledTimes(1);
  });

  it("omits the View full project button when onViewFull is not provided", () => {
    render(<IncomingLeadCardBack lead={baseLead} />);
    expect(
      screen.queryByRole("button", { name: /view full project/i }),
    ).not.toBeInTheDocument();
  });
});
