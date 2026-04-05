import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import React from "react";
import StatPill from "../../../web/components/StatPill";

describe("<StatPill />", () => {
  it("renders the value and label", () => {
    render(<StatPill icon={null} label="Likes" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Likes")).toBeInTheDocument();
  });

  it("renders a string value", () => {
    render(<StatPill icon={null} label="Score" value="83" />);
    expect(screen.getByText("83")).toBeInTheDocument();
  });

  it("renders the icon", () => {
    render(
      <StatPill
        icon={<svg data-testid="stat-icon" />}
        label="Photos"
        value={6}
      />
    );
    expect(screen.getByTestId("stat-icon")).toBeInTheDocument();
  });

  it("applies the testId to the wrapper", () => {
    render(<StatPill icon={null} label="Completed" value={10} testId="stat-completed" />);
    expect(screen.getByTestId("stat-completed")).toBeInTheDocument();
  });

  it("renders without a testId when not provided", () => {
    const { container } = render(<StatPill icon={null} label="Likes" value={0} />);
    expect(container.firstChild).not.toHaveAttribute("data-testid");
  });
});
